import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { and, asc, count, countDistinct, eq, ne, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { inboxes, inboxMembers, users, conversations } from '../db/schema.js';
import { requireAuth, requireOwner, isFullPortfolio, isFinance } from '../middleware/auth.js';
import { assignedInboxes, inboxBadge } from '../lib/conversations.js';
import { messagingService } from '../lib/waha.js';
import { railsJson } from '../lib/serialize.js';
import { chatCompletion } from '../lib/openai.js';
import { historyProgress } from '../jobs/wahaHistorySync.js';
import { deleteContactCascade, deleteConversationCascade } from '../lib/wahaIngestion.js';

export const inboxesRouter = Router();
inboxesRouter.use('/inboxes', requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

type Inbox = typeof inboxes.$inferSelect;
const toJson = (i: Inbox) => { const b = inboxBadge(i); return { ...railsJson(i), badge_short: b.short, badge_color: b.color }; };

export function webhookUrlFor(inbox: Inbox) {
  const host = (process.env.PUBLIC_URL || 'http://localhost:3011').replace(/\/$/, '');
  const secret = process.env.WAHA_WEBHOOK_SECRET ? `&secret=${encodeURIComponent(process.env.WAHA_WEBHOOK_SECRET)}` : '';
  return `${host}/webhooks/waha?inbox_id=${inbox.id}${secret}`;
}

async function loadInbox(req: Request, res: Response, key = 'id'): Promise<Inbox | null> {
  const [i] = await db.select().from(inboxes).where(and(eq(inboxes.accountId, req.user!.accountId!), eq(inboxes.id, Number(req.params[key])))).limit(1);
  if (!i) { res.status(404).json({ error: 'not_found' }); return null; }
  return i;
}

// inbox_params da v1 (strong params)
const PERMITTED: Record<string, keyof typeof inboxes.$inferInsert> = {
  name: 'name', provider: 'provider', phone_number: 'phoneNumber', api_url: 'apiUrl', api_key: 'apiKey', bot_prompt: 'botPrompt',
  ai_enabled: 'aiEnabled', ai_name: 'aiName', ai_prompt: 'aiPrompt', ai_temperature: 'aiTemperature', knowledge_base: 'knowledgeBase',
  working_hours_enabled: 'workingHoursEnabled', out_of_office_message: 'outOfOfficeMessage', followup_enabled: 'followupEnabled',
  followup_max_attempts: 'followupMaxAttempts', followup_wait_time_minutes: 'followupWaitTimeMinutes',
  followup_send_closing_message: 'followupSendClosingMessage', followup_closing_message: 'followupClosingMessage',
  round_robin_group_id: 'roundRobinGroupId', restrict_by_portfolio: 'restrictByPortfolio', sign_messages: 'signMessages', working_hours: 'workingHours',
  color: 'color', short_name: 'shortName',
};
const BOOL = new Set(['aiEnabled', 'workingHoursEnabled', 'followupEnabled', 'followupSendClosingMessage', 'restrictByPortfolio', 'signMessages']);
const NUM = new Set(['aiTemperature', 'followupMaxAttempts', 'followupWaitTimeMinutes', 'roundRobinGroupId']);

function inboxParams(body: Record<string, unknown>): Partial<typeof inboxes.$inferInsert> {
  const src = (body.inbox ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(PERMITTED)) {
    if (!(k in src)) continue;
    let v = src[k];
    if (BOOL.has(col)) v = v === true || v === 'true' || v === '1' || v === 1;
    else if (NUM.has(col)) v = v === '' || v === null || v === undefined ? null : Number(v);
    else if (col === 'workingHours') v = Array.isArray(v) ? v.map(w => { const o = w as Record<string, unknown>; return { day: o.day, open: o.open, start: o.start, end: o.end }; }) : [];
    out[col] = v;
  }
  return out;
}

/** Validação da v1: duas caixas de WhatsApp com o mesmo número disputariam a mesma sessão. */
async function phoneTaken(accountId: number, values: Partial<typeof inboxes.$inferInsert>, exceptId?: number) {
  if (values.provider !== 'waha' && values.provider !== 'baileys') return false;
  if (!values.phoneNumber) return false;
  const conds = [eq(inboxes.accountId, accountId), eq(inboxes.phoneNumber, values.phoneNumber)];
  if (exceptId) conds.push(ne(inboxes.id, exceptId));
  const [dup] = await db.select({ id: inboxes.id }).from(inboxes).where(and(...conds)).limit(1);
  return !!dup;
}

inboxesRouter.get('/inboxes', async (req, res) => {
  const u = req.user!;
  // só restringe quem JÁ tem caixa configurada em Gerenciar Acesso (senão vê todas, igual à v1)
  const mine = await assignedInboxes(u.id);
  if (isFullPortfolio(u) || isFinance(u) || !mine.length) {
    res.json((await db.select().from(inboxes).where(eq(inboxes.accountId, u.accountId!)).orderBy(asc(inboxes.id))).map(toJson));
  } else {
    const rows = await db.select({ i: inboxes }).from(inboxMembers).innerJoin(inboxes, eq(inboxes.id, inboxMembers.inboxId)).where(eq(inboxMembers.userId, u.id)).orderBy(asc(inboxes.id));
    res.json(rows.map(r => toJson(r.i)));
  }
});

inboxesRouter.get('/inboxes/:id', async (req, res) => {
  const i = await loadInbox(req, res);
  if (i) res.json(toJson(i));
});

inboxesRouter.post('/inboxes', requireOwner, async (req, res) => {
  // regra geral da Clara: toda caixa nasce "por carteira" (cada consultora só vê o que é dela)
  const values = { restrictByPortfolio: true, ...inboxParams(req.body), accountId: req.user!.accountId! };
  if (await phoneTaken(values.accountId, values)) return res.status(422).json({ phone_number: ['já está em uso'] });
  const [inbox] = await db.insert(inboxes).values(values).returning();
  if (inbox.provider === 'waha') await messagingService(inbox).createConnection(webhookUrlFor(inbox)).catch(() => {});
  res.status(201).json(toJson(inbox));
});

/** Caixa virou "por carteira": conversa sem atendente passa pra dona da revendedora. */
export async function syncAtendentesDaCarteira(inboxId: number) {
  await db.execute(sql`UPDATE conversations cv SET user_id = c.user_id FROM contacts c
    WHERE cv.contact_id = c.id AND cv.inbox_id = ${inboxId} AND cv.user_id IS NULL AND c.user_id IS NOT NULL`);
}

async function updateInbox(req: Request, res: Response) {
  const i = await loadInbox(req, res);
  if (!i) return;
  const values = inboxParams(req.body);
  if (await phoneTaken(i.accountId!, { provider: i.provider, phoneNumber: i.phoneNumber, ...values }, i.id)) return res.status(422).json({ phone_number: ['já está em uso'] });
  if (values.provider === 'instagram' && values.followupEnabled) return res.status(422).json({ followup_enabled: ['não é permitido para o canal Instagram (janela de 24h da Meta)'] });
  const [updated] = await db.update(inboxes).set({ ...values, updatedAt: new Date() }).where(eq(inboxes.id, i.id)).returning();
  if (updated.restrictByPortfolio && !i.restrictByPortfolio) await syncAtendentesDaCarteira(updated.id);
  res.json(toJson(updated));
}
inboxesRouter.put('/inboxes/:id', requireOwner, updateInbox);
inboxesRouter.patch('/inboxes/:id', requireOwner, updateInbox);

inboxesRouter.get('/inboxes/:id/qr_code', requireOwner, async (req, res) => {
  const i = await loadInbox(req, res);
  if (!i) return;
  const service = messagingService(i);
  let qr = await service.fetchQrCode();
  // só recria a sessão se não há QR E não está conectada (não derruba sessão funcionando)
  if (!qr && !(await service.connected())) {
    await service.deleteConnection().catch(() => {});
    await new Promise(r => setTimeout(r, 500));
    await service.createConnection(webhookUrlFor(i)).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    qr = await service.fetchQrCode();
  }
  res.json(qr ? { qr_code: qr } : { qr_code: null, message: 'QR Code não disponível. Tente novamente em instantes.' });
});

inboxesRouter.get('/inboxes/:id/status', async (req, res) => {
  const i = await loadInbox(req, res);
  if (i) res.json({ connected: await messagingService(i).connected(), history: historyProgress(i.id), history_imported_at: i.historyImportedAt });
});

// desloga o WhatsApp mas mantém a caixa e todo o histórico
inboxesRouter.post('/inboxes/:id/disconnect', requireOwner, async (req, res) => {
  const i = await loadInbox(req, res);
  if (!i) return;
  if (await messagingService(i).deleteConnection()) return res.json({ disconnected: true });
  res.status(422).json({ error: 'Não foi possível desconectar. Tente novamente.' });
});

// apaga a caixa; conversas ficam com inbox_id nulo (histórico preservado)
inboxesRouter.delete('/inboxes/:id', requireOwner, async (req, res) => {
  const i = await loadInbox(req, res);
  if (!i) return;
  const [{ n: convCount }] = await db.select({ n: count() }).from(conversations).where(eq(conversations.inboxId, i.id));
  const [{ n: contactCount }] = await db.select({ n: countDistinct(conversations.contactId) }).from(conversations).where(eq(conversations.inboxId, i.id));
  await messagingService(i).deleteConnection().catch(() => {});
  if (req.query.apagar_conversas === '1') {
    // apaga as conversas e mensagens da caixa; o contato só sai junto se veio apenas desta caixa e
    // não é revendedora (sem Jueri, sem status da régua) nem tem funil, tarefa ou outra conversa
    const convs = await db.select({ id: conversations.id, contactId: conversations.contactId }).from(conversations).where(eq(conversations.inboxId, i.id));
    for (const cv of convs) await deleteConversationCascade(cv.id);
    let contatos = 0;
    for (const contactId of [...new Set(convs.map(c => c.contactId))]) {
      const [livre] = await db.execute(sql`SELECT 1 AS ok FROM contacts c WHERE c.id = ${contactId} AND c.id_jueri IS NULL AND c.status IS NULL
        AND NOT EXISTS (SELECT 1 FROM conversations x WHERE x.contact_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM pipeline_cards p WHERE p.contact_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM tarefas t WHERE t.contact_id = c.id)`) as unknown as { ok: number }[];
      if (livre) { await deleteContactCascade(contactId); contatos++; }
    }
    res.setHeader('X-Deleted-Conversations', String(convs.length));
    res.setHeader('X-Deleted-Contacts', String(contatos));
  }
  await db.update(conversations).set({ inboxId: null }).where(eq(conversations.inboxId, i.id));
  await db.execute(sql`UPDATE flows SET inbox_id = NULL WHERE inbox_id = ${i.id}`);
  await db.delete(inboxMembers).where(eq(inboxMembers.inboxId, i.id));
  await db.delete(inboxes).where(eq(inboxes.id, i.id));
  res.setHeader('X-Preserved-Conversations', String(convCount));
  res.setHeader('X-Preserved-Contacts', String(contactCount));
  res.status(204).end();
});

// Gerador de prompt da IA (mesmo texto da v1, herdado da VisitaIA) — usado na aba do Agente de IA
inboxesRouter.post('/inboxes/:id/generate_prompt', requireOwner, async (req, res) => {
  const i = await loadInbox(req, res);
  if (!i) return;
  const d = (req.body.prompt_data ?? {}) as Record<string, string | boolean | undefined>;
  const system = `Você é um Engenheiro de Prompts especialista em IA para Imobiliárias.
Sua tarefa é criar um System Prompt detalhado, persuasivo e à prova de falhas para a IA de uma imobiliária, baseado nas informações fornecidas.
O prompt gerado será usado como a diretriz de comportamento primária da IA.
Sempre retorne APENAS o texto do prompt final, sem introduções ou explicações.
`;
  const role = d.ai_role === 'sdr_only' ? 'ATUAÇÃO RESTRITA A SDR: A IA NÃO pode ofertar imóveis aleatórios. O objetivo é APENAS qualificar o lead.' : 'ATUAÇÃO COMPLETA: A IA atua como SDR e como Corretora, podendo qualificar, pesquisar imóveis no banco e ofertar de forma vendedora.';
  const sched = d.allow_scheduling ? 'AGENDAMENTO AUTOMÁTICO: A IA PODE e DEVE realizar o agendamento automatizado no sistema quando o cliente quiser visitar.' : 'SEM AGENDAMENTO: A IA NÃO DEVE prometer agendamento automatizado. O agendamento é feito pelo corretor humano, a IA deve apenas anotar o interesse e transferir o atendimento.';
  const nameI = d.use_whatsapp_name ? 'NOME DO CLIENTE E TELEFONE: O sistema já fornecerá o nome do cliente. Inicie o atendimento chamando-o pelo nome. NUNCA pergunte qual é o nome. Como JÁ ESTÃO no WhatsApp, NUNCA PERGUNTE O TELEFONE DE CONTATO, você já tem essa informação implicitamente.' : 'NOME DO CLIENTE E TELEFONE: Pergunte o nome do cliente de forma educada no início. No entanto, como já estão conversando pelo WhatsApp, NUNCA PERGUNTE O TELEFONE DE CONTATO.';
  const emoji = d.emoji_usage === 'none' ? 'PROIBIDO USO DE EMOJIS: Não utilize emojis em nenhuma circunstância. Mantenha a comunicação estritamente em texto limpo.'
    : d.emoji_usage === 'lots' ? 'USO FREQUENTE DE EMOJIS: Utilize bastantes emojis para tornar a conversa muito descontraída, calorosa e jovem.'
    : 'USO MODERADO DE EMOJIS: Utilize emojis de forma equilibrada e profissional para dar um tom amigável, sem exagerar.';
  const proib = d.prohibited_actions ? `AÇÕES ESTRITAMENTE PROIBIDAS (NUNCA FAÇA ISSO): ${d.prohibited_actions}` : 'AÇÕES PROIBIDAS: Nenhuma extra.';
  const greet = d.greeting_message ? `MENSAGEM DE SAUDAÇÃO EXATA (Primeiro Contato): Use exatamente esta mensagem quando o cliente entrar em contato pela primeira vez: "${d.greeting_message}"` : 'MENSAGEM DE SAUDAÇÃO: Crie uma saudação natural e acolhedora alinhada com a identidade e tom de voz definidos acima.';
  const user = `Crie o prompt usando estas diretrizes:
1. Identidade e Tom de Voz: ${d.identity ?? ''}
2. Institucional (Horários/Diferenciais): ${d.institutional ?? ''}
3. FAQ: ${d.faq ?? ''}
4. ${greet}
5. Modo de Atuação: ${role}
6. Regras de Agendamento: ${sched}
7. Tratamento de Contato: ${nameI}
8. Estilo de Comunicação: ${emoji}
9. Linhas Vermelhas: ${proib}
10. Regras de SDR (Dados obrigatórios para coletar): ${d.sdr_rules ?? ''}
11. Regras de Transbordo (Quando transferir para humano ou agendar visita): ${d.routing_rules ?? ''}

Certifique-se de que o prompt instrua a IA a ser natural, não robótica, e seguir rigorosamente as restrições de agendamento, atendimento e as regras estritas de nunca perguntar o telefone.
`;
  try {
    res.json({ prompt: await chatCompletion('gpt-4o', [{ role: 'system', content: system }, { role: 'user', content: user }], 0.7) });
  } catch {
    res.status(422).json({ error: 'Erro ao gerar prompt na OpenAI.' });
  }
});

// Extrai o texto de um PDF pra base de conhecimento (não salva sozinho)
inboxesRouter.post('/inboxes/:id/extract_knowledge_base_pdf', requireOwner, upload.single('file'), async (req, res) => {
  const i = await loadInbox(req, res);
  if (!i) return;
  const file = req.file;
  if (!file) return res.status(422).json({ error: 'Nenhum arquivo enviado.' });
  if (file.mimetype !== 'application/pdf' && !file.originalname.toLowerCase().endsWith('.pdf')) return res.status(422).json({ error: 'Envie um arquivo PDF.' });
  try {
    const { extractPdfText } = await import('../lib/pdf.js');
    const texto = (await extractPdfText(file.buffer)).trim();
    if (!texto) return res.status(422).json({ error: 'Não consegui extrair texto desse PDF (pode ser um PDF escaneado/imagem, sem texto real).' });
    res.json({ text: texto });
  } catch (e) {
    console.error('Erro ao extrair PDF da base de conhecimento:', (e as Error).message);
    res.status(422).json({ error: `PDF inválido ou não suportado: ${(e as Error).message}` });
  }
});

// --- Gerenciar Acesso (InboxMembersController) --------------------------------------------------

inboxesRouter.get('/inboxes/:inbox_id/members', async (req, res) => {
  const i = await loadInbox(req, res, 'inbox_id');
  if (!i) return;
  const all = await db.select().from(users).where(eq(users.accountId, req.user!.accountId!)).orderBy(asc(users.id));
  const members = new Set((await db.select({ userId: inboxMembers.userId }).from(inboxMembers).where(eq(inboxMembers.inboxId, i.id))).map(m => m.userId));
  res.json(all.map(u => ({ id: u.id, email: u.email, name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(), is_member: members.has(u.id) })));
});

inboxesRouter.post('/inboxes/:inbox_id/members', requireOwner, async (req, res) => {
  const i = await loadInbox(req, res, 'inbox_id');
  if (!i) return;
  const [u] = await db.select().from(users).where(and(eq(users.accountId, req.user!.accountId!), eq(users.id, Number(req.body.user_id))));
  if (!u) return res.status(404).json({ error: 'not_found' });
  await db.insert(inboxMembers).values({ inboxId: i.id, userId: u.id }).onConflictDoNothing();
  res.json({ success: true });
});

inboxesRouter.delete('/inboxes/:inbox_id/members/:id', requireOwner, async (req, res) => {
  const i = await loadInbox(req, res, 'inbox_id');
  if (!i) return;
  await db.delete(inboxMembers).where(and(eq(inboxMembers.inboxId, i.id), eq(inboxMembers.userId, Number(req.params.id))));
  res.json({ success: true });
});
