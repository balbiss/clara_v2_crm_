import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { conversations, contacts, inboxes, messages, scheduledMessages, conversationTags, tags, accounts, users } from '../db/schema.js';
import { requireAuth, isOwner, isFullPortfolio, visibleContactsWhere, type User } from '../middleware/auth.js';
import { visibleConversationsWhere, findVisibleConversation, formatConversations, formatConversation, conversationTagsOf, findOrCreateTag, addConversationTag, convStatusValue, assignedInboxes, inboxBadge, type Conversation } from '../lib/conversations.js';
import { createContact, searchByNameOrPhoneWhere, channelIdentifier, ACENTOS_DE, ACENTOS_PARA, semAcento, likeEscape, updateContact } from '../lib/contacts.js';
import { createMessage, messageStatusValue, messagePayload, rebroadcast } from '../lib/messages.js';
import { triggerOnConversationClosed } from '../lib/salesbot.js';
import { messagingService } from '../lib/waha.js';
import { cache } from '../lib/cache.js';
import { attach, blobFor, blobUrl, downloadBlob } from '../lib/storage.js';
import { broadcastConversations } from '../lib/realtime.js';
import { accountUsersMap, avatarUrl } from '../lib/users.js';
import { notifyAssignment } from '../lib/agentNotification.js';
import { chatCompletion, openaiApiKey, transcribeAudio, transcriptionApiKey } from '../lib/openai.js';
import { deleteConversationCascade } from '../lib/wahaIngestion.js';
import { hhmm, iso8601 } from '../lib/serialize.js';

export const conversationsRouter = Router();
conversationsRouter.use('/conversations', requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
const WHATSAPP_PROVIDERS = ['waha'];
const id = (req: Request, key = 'id') => Number(req.params[key]);
const notFound = (res: Response) => res.status(404).json({ error: 'not_found' });

async function loadVisible(req: Request, res: Response, key = 'id'): Promise<Conversation | null> {
  const conv = await findVisibleConversation(req.user!, id(req, key));
  if (!conv) { notFound(res); return null; }
  return conv;
}


// GET /conversations — 100 mais recentes visíveis (só a última mensagem de cada; ver formatConversations)
conversationsRouter.get('/conversations', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(500, Math.max(1, Number(req.query.per_page) || 100));
  const rows = await db.select({ c: conversations }).from(conversations)
    .leftJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(await visibleConversationsWhere(req.user!))
    .orderBy(sql`${conversations.lastActivityAt} DESC NULLS LAST`)
    .offset((page - 1) * limit).limit(limit);
  res.json(await formatConversations(rows.map(r => r.c), req.user!.accountId!, { fullMessages: false }));
});

// POST /conversations — inicia conversa com revendedora existente (contact_id) ou número novo (phone)
conversationsRouter.post('/conversations', async (req, res) => {
  const u = req.user!;
  let contact: typeof contacts.$inferSelect | null = null;
  if (req.body.contact_id) {
    [contact] = await db.select().from(contacts).where(and(await visibleContactsWhere(u), eq(contacts.id, Number(req.body.contact_id)))).limit(1);
    if (!contact) return res.status(404).json({ error: 'not_found', message: 'Revendedora não encontrada ou fora da sua carteira.' });
  } else {
    let digitos = String(req.body.phone ?? '').replace(/\D/g, '');
    if (digitos.length >= 10 && digitos.length <= 11) digitos = '55' + digitos;
    if (digitos.length < 12 || digitos.length > 13) {
      return res.status(422).json({ error: 'telefone_invalido', message: 'Telefone inválido. Use DDD + número, ex: (16) 99323-5750.' });
    }
    const [existente] = await db.select().from(contacts).where(and(eq(contacts.accountId, u.accountId!), searchByNameOrPhoneWhere(digitos))).limit(1);
    if (existente) {
      const [vis] = await db.select({ id: contacts.id }).from(contacts).where(and(await visibleContactsWhere(u), eq(contacts.id, existente.id))).limit(1);
      if (!vis) return res.status(403).json({ error: 'fora_da_carteira', message: `Esse número já é de ${existente.name || 'uma revendedora'}, que está em outra carteira.` });
      contact = existente;
    } else {
      contact = await createContact({ accountId: u.accountId!, phone: `+${digitos}`, name: String(req.body.name ?? '').trim() || `+${digitos}`, userId: u.id, source: 'WhatsApp' });
    }
  }

  let inbox: typeof inboxes.$inferSelect | undefined;
  if (req.body.inbox_id) {
    [inbox] = await db.select().from(inboxes).where(and(eq(inboxes.accountId, u.accountId!), inArray(inboxes.provider, WHATSAPP_PROVIDERS), eq(inboxes.id, Number(req.body.inbox_id)))).limit(1);
  }
  if (!inbox) {
    // pick_inbox_for: caixa liberada pro usuário, senão a primeira de WhatsApp da conta
    const mine = (await assignedInboxes(u.id)).find(i => WHATSAPP_PROVIDERS.includes(i.provider ?? ''));
    if (mine) [inbox] = await db.select().from(inboxes).where(eq(inboxes.id, mine.id));
    else [inbox] = await db.select().from(inboxes).where(and(eq(inboxes.accountId, u.accountId!), inArray(inboxes.provider, WHATSAPP_PROVIDERS))).orderBy(asc(inboxes.id)).limit(1);
  }
  if (!inbox) return res.status(422).json({ error: 'sem_caixa_conectada', message: 'Nenhuma caixa de WhatsApp conectada nesta conta ainda.' });

  let [conv] = await db.select().from(conversations).where(and(eq(conversations.contactId, contact.id), eq(conversations.inboxId, inbox.id))).orderBy(asc(conversations.id)).limit(1);
  if (!conv) {
    [conv] = await db.insert(conversations).values({ accountId: u.accountId!, contactId: contact.id, inboxId: inbox.id, status: 0, userId: contact.userId || u.id, source: 'whatsapp' }).returning();
  }
  res.status(201).json(await formatConversation(conv, u.accountId!));
});

// GET /conversations/search?q= — nome/telefone da revendedora e texto das mensagens (com transcrição)
conversationsRouter.get('/conversations/search', async (req, res) => {
  const u = req.user!;
  const termo = String(req.query.q ?? '').trim();
  if (termo.length < 2) return res.json({ conversations: [], messages: [] });
  const visibleIds = db.select({ id: conversations.id }).from(conversations).leftJoin(contacts, eq(contacts.id, conversations.contactId)).where(await visibleConversationsWhere(u));
  const usersMap = await accountUsersMap(u.accountId!);

  const contactIds = db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.accountId, u.accountId!), searchByNameOrPhoneWhere(termo)));
  const convs = await db.select({ c: conversations, contactName: contacts.name, contactPhone: contacts.phone, inboxName: inboxes.name })
    .from(conversations).leftJoin(contacts, eq(contacts.id, conversations.contactId)).leftJoin(inboxes, eq(inboxes.id, conversations.inboxId))
    .where(and(eq(conversations.accountId, u.accountId!), inArray(conversations.id, visibleIds), inArray(conversations.contactId, contactIds)))
    .orderBy(sql`${conversations.lastActivityAt} DESC NULLS LAST`).limit(15);

  const palavras = semAcento(termo).split(/\s+/).filter(Boolean);
  const texto = sql`translate(lower(coalesce(${messages.text}, '') || ' ' || coalesce(${messages.transcription}, '')), ${ACENTOS_DE}, ${ACENTOS_PARA})`;
  const msgs = await db.select({ m: messages, contactName: contacts.name, contactPhone: contacts.phone, inboxName: inboxes.name })
    .from(messages).innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .leftJoin(contacts, eq(contacts.id, conversations.contactId)).leftJoin(inboxes, eq(inboxes.id, conversations.inboxId))
    .where(and(eq(messages.accountId, u.accountId!), inArray(messages.conversationId, visibleIds), ...palavras.map(p => sql`${texto} LIKE ${'%' + likeEscape(p) + '%'}`)))
    .orderBy(desc(messages.createdAt)).limit(40);

  const conversationStatus = (n: number | null) => ['open', 'pending', 'resolved', 'snoozed'][n ?? 0];
  res.json({
    conversations: convs.map(r => ({
      conversation_id: r.c.id, contact_name: r.contactName || r.contactPhone, contact_phone: r.contactPhone,
      inbox_name: r.inboxName, status: conversationStatus(r.c.status), last_activity_iso: iso8601(r.c.lastActivityAt ?? r.c.createdAt),
    })),
    messages: msgs.map(r => ({
      id: r.m.id, conversation_id: r.m.conversationId, contact_name: r.contactName || r.contactPhone, inbox_name: r.inboxName,
      text: String(r.m.text ?? '').startsWith('📎') && r.m.transcription ? r.m.transcription : [r.m.text, r.m.transcription].filter(t => t && t.trim()).join(' — '),
      sender: r.m.senderType === 'User' ? (r.m.senderId && usersMap.get(r.m.senderId)?.firstName) || 'Equipe' : null,
      timestamp: iso8601(r.m.createdAt),
    })),
  });
});

conversationsRouter.get('/conversations/:id', async (req, res) => {
  const conv = await loadVisible(req, res);
  if (!conv) return;
  // a mesma cliente conversando por outro número da loja (que a pessoa também enxerga): avisa na tela
  const outras = await db.select({ id: conversations.id, inboxId: conversations.inboxId, last: conversations.lastActivityAt, name: inboxes.name, phone: inboxes.phoneNumber, color: inboxes.color, shortName: inboxes.shortName })
    .from(conversations).leftJoin(contacts, eq(contacts.id, conversations.contactId)).innerJoin(inboxes, eq(inboxes.id, conversations.inboxId))
    .where(and(await visibleConversationsWhere(req.user!), eq(conversations.contactId, conv.contactId), ne(conversations.id, conv.id)));
  res.json({
    ...(await formatConversation(conv, req.user!.accountId!)),
    other_conversations: outras.map(o => ({ conversation_id: o.id, inbox_id: o.inboxId, inbox_name: o.name, inbox_phone: o.phone, inbox_short: inboxBadge({ id: o.inboxId!, name: o.name, color: o.color, shortName: o.shortName }).short, inbox_color: inboxBadge({ id: o.inboxId!, name: o.name, color: o.color, shortName: o.shortName }).color, last_activity_at: o.last })),
  });
});

conversationsRouter.post('/conversations/:id/mark_as_read', async (req, res) => {
  const conv = await loadVisible(req, res);
  if (!conv) return;
  if (conv.unreadCount !== 0) await db.update(conversations).set({ unreadCount: 0 }).where(eq(conversations.id, conv.id));
  res.status(204).end();
});

// PUT/PATCH /conversations/:id — status, atendente (transferência), adiar
async function updateConversation(req: Request, res: Response) {
  const u = req.user!;
  const conv = await loadVisible(req, res);
  if (!conv) return;
  const p = (req.body.conversation ?? {}) as Record<string, unknown>;
  const oldUserId = conv.userId;
  const newStatusParam = typeof p.status === 'string' ? p.status : undefined;

  const set: Partial<typeof conversations.$inferInsert> = {};
  if ('status' in p) {
    const v = convStatusValue(String(p.status));
    if (v === null) return res.status(422).json({ errors: [`Status '${p.status}' is not a valid status`] });
    set.status = v;
  }
  if ('user_id' in p) set.userId = p.user_id === null || p.user_id === '' ? null : Number(p.user_id);
  // consultora só atribui a si mesma ou tira (Bel, 26/10: a lista inteira confundia); transferir com nota segue liberado
  if ('user_id' in p && set.userId && set.userId !== u.id && !isFullPortfolio(u) && !req.body.transfer_note) return res.status(403).json({ error: 'forbidden', message: 'Você só pode atribuir a conversa a você mesma. Pra passar pra outra pessoa, use Transferir.' });
  if ('snoozed_until' in p) set.snoozedUntil = p.snoozed_until ? new Date(String(p.snoozed_until)) : null;
  let current = conv;
  if (Object.keys(set).length) [current] = await db.update(conversations).set({ ...set, updatedAt: new Date() }).where(eq(conversations.id, conv.id)).returning();

  if (newStatusParam === 'resolved') { await handleResolveSideEffects(req, current); void triggerOnConversationClosed(current.id).catch(e => console.error('Gatilho conversa fechada falhou —', e.message)) }
  else if (newStatusParam === 'open' && current.snoozedUntil) [current] = await db.update(conversations).set({ snoozedUntil: null }).where(eq(conversations.id, conv.id)).returning();

  const newUserId = current.userId;
  if (newUserId !== oldUserId) {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, current.contactId));
    if (newUserId) {
      broadcastConversations(u.accountId!, { event: 'lead_atribuido', assigned_to_user_id: newUserId, conversation_id: current.id, contact_name: contact?.name || contact?.phone, assigned_by: 'manual' });
      const [agent] = await db.select().from(users).where(eq(users.id, newUserId));
      if (agent) notifyAssignment(agent, current, 'manual').catch(() => {});
    }
    const tag = await findOrCreateTag(u.accountId!, 'com_atendente', '#8b5cf6');
    if (newUserId) await addConversationTag(current.id, tag.id);
    else await db.delete(conversationTags).where(and(eq(conversationTags.conversationId, current.id), eq(conversationTags.tagId, tag.id)));
    broadcastConversations(u.accountId!, { event: 'conversation_tags_updated', conversation_id: current.id, tags: await conversationTagsOf(current.id) });

    if (req.body.transfer_note && newUserId) {
      const note = await createMessage({
        accountId: u.accountId!, conversationId: current.id, text: `Transferido por ${u.firstName}: ${req.body.transfer_note}`,
        senderType: 'User', senderId: u.id, sourceId: `transfer_${crypto.randomBytes(8).toString('hex')}`, status: messageStatusValue('delivered'), isPrivate: true,
      });
      void note; // o broadcast 'message_created' já sai pelo createMessage
    }
  }

  // Atendente é temporário: ao resolver sem transferência explícita, volta pro responsável da carteira
  if (newStatusParam === 'resolved' && !('user_id' in p)) {
    const [contact] = await db.select({ userId: contacts.userId }).from(contacts).where(eq(contacts.id, current.contactId));
    if (current.userId !== (contact?.userId ?? null)) {
      [current] = await db.update(conversations).set({ userId: contact?.userId ?? null }).where(eq(conversations.id, current.id)).returning();
    }
  }

  const formatted = await formatConversation(current, u.accountId!);
  broadcastConversations(u.accountId!, { event: 'conversation_updated', conversation: formatted });
  res.json(formatted);
}
conversationsRouter.put('/conversations/:id', updateConversation);
conversationsRouter.patch('/conversations/:id', updateConversation);

async function handleResolveSideEffects(req: Request, conversation: Conversation) {
  const u = req.user!;
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, conversation.contactId));
  const [inbox] = conversation.inboxId ? await db.select().from(inboxes).where(eq(inboxes.id, conversation.inboxId)) : [];
  const jid = contact ? channelIdentifier(contact) : null;
  if (jid && inbox) cache.write(`ai_paused_${inbox.id}_${jid}`, Math.floor(Date.now() / 1000), 30 * 24 * 3600);

  const tag = await findOrCreateTag(conversation.accountId, 'agente_off', '#f97316');
  await addConversationTag(conversation.id, tag.id);

  if (req.body.kanban_stage && contact) await updateContact(contact, { status: String(req.body.kanban_stage) }, u.id);

  if (String(req.body.send_closing_message) === 'true' && req.body.closing_message_text) {
    try {
      const externalId = inbox && jid ? await messagingService(inbox).sendMessage(jid, String(req.body.closing_message_text)) : null;
      await createMessage({
        accountId: conversation.accountId, conversationId: conversation.id, text: String(req.body.closing_message_text),
        senderType: 'User', senderId: u.id, sourceId: externalId || `closing_${crypto.randomBytes(8).toString('hex')}`, status: messageStatusValue('delivered'),
      });
    } catch (e) { console.error('Erro ao enviar mensagem de encerramento:', (e as Error).message); }
  }
  broadcastConversations(conversation.accountId, { event: 'conversation_tags_updated', conversation_id: conversation.id, tags: await conversationTagsOf(conversation.id) });
}

// DELETE /conversations/:id — apaga só a conversa e as mensagens (a revendedora fica)
// Kommo: consultor não exclui (perfil sem "Excluir") — só gerência/diretoria
conversationsRouter.delete('/conversations/:id', async (req, res) => {
  if (!isFullPortfolio(req.user!)) return res.status(403).json({ error: 'forbidden', message: 'Só gerência e diretoria podem excluir conversas.' });
  const conv = await loadVisible(req, res);
  if (!conv) return;
  await deleteConversationCascade(conv.id);
  res.status(204).end();
});

conversationsRouter.get('/conversations/:id/ai_status', async (req, res) => {
  const conv = await loadVisible(req, res);
  if (!conv) return;
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId));
  const pausedAt = cache.read<number>(`ai_paused_${conv.inboxId}_${contact ? channelIdentifier(contact) : ''}`);
  if (pausedAt) res.json({ paused: true, remaining_seconds: Math.max(30 * 60 - (Math.floor(Date.now() / 1000) - pausedAt), 0) });
  else res.json({ paused: false, remaining_seconds: 0 });
});

conversationsRouter.post('/conversations/:id/resume_ai', async (req, res) => {
  const conv = await loadVisible(req, res);
  if (!conv) return;
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId));
  cache.delete(`ai_paused_${conv.inboxId}_${contact ? channelIdentifier(contact) : ''}`);
  const atuais = await conversationTagsOf(conv.id);
  const off = atuais.find(t => t.name === 'agente_off');
  if (off) {
    await db.delete(conversationTags).where(and(eq(conversationTags.conversationId, conv.id), eq(conversationTags.tagId, off.id)));
    broadcastConversations(req.user!.accountId!, { event: 'conversation_tags_updated', conversation_id: conv.id, tags: atuais.filter(t => t.id !== off.id) });
  }
  res.json({ success: true });
});

conversationsRouter.post('/conversations/:id/generate_summary', async (req, res) => {
  const conv = await loadVisible(req, res);
  if (!conv) return;
  const recent = (await db.select().from(messages).where(eq(messages.conversationId, conv.id)).orderBy(desc(messages.createdAt), desc(messages.id)).limit(30)).reverse();
  if (!(await openaiApiKey())) return res.status(422).json({ error: 'Resumo precisa da chave da OpenAI. Cadastre em Agente de IA › Chave da OpenAI.' });
  const history = recent.map(m => `${m.senderType === 'Contact' ? 'Revendedora' : 'Equipe/IA'}: ${m.text && !m.text.startsWith('📎') ? m.text : m.transcription || '[Mídia]'}`).join('\n');
  const system = `Você é assistente da Clara Ferreira Acessórios (semijoias vendidas por revendedoras com maleta consignada). Leia o histórico da conversa abaixo e gere um resumo curto, direto e objetivo do atendimento.
Destaque, quando aparecer:
- O que a revendedora/cliente quer ou perguntou
- Situação da maleta, acerto, pedido ou pagamento
- Dúvidas ou problemas em aberto
- Próximos passos combinados (datas, agendamentos)
Não crie informações que não estejam no texto. Retorne apenas o resumo.
`;
  try {
    const summary = await chatCompletion('gpt-4o-mini', [{ role: 'system', content: system }, { role: 'user', content: `Histórico:\n${history}` }], 0.3);
    res.json({ summary });
  } catch (e) {
    const msg = String((e as Error).message || '');
    res.status(422).json({ error: /401/.test(msg) ? 'A chave da OpenAI foi recusada — confira em Agente de IA › Chave da OpenAI.' : /429/.test(msg) ? 'A OpenAI recusou por limite ou falta de crédito na conta.' : 'Erro ao gerar resumo. Tente de novo.' });
  }
});

conversationsRouter.get('/conversations/:id/transcript', async (req, res) => {
  const u = req.user!;
  const conv = await loadVisible(req, res);
  if (!conv) return;
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId));
  const [acc] = await db.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, u.accountId!));
  const [agent] = conv.userId ? await db.select({ firstName: users.firstName }).from(users).where(eq(users.id, conv.userId)) : [];
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, conv.id)).orderBy(asc(messages.createdAt));
  const atts = new Set((await db.execute<{ record_id: number }>(sql`SELECT record_id FROM active_storage_attachments WHERE record_type = 'Message' AND name = 'attachment' AND record_id IN (SELECT id FROM messages WHERE conversation_id = ${conv.id})`)).map(r => Number(r.record_id)));
  const accountName = acc?.name || 'Imobiliária';
  const fmt = (d: Date) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(d).replace(',', '');
  const bar = '='.repeat(60);
  const lines = [bar, 'TRANSCRIÇÃO DA CONVERSA', bar, `Imobiliária: ${accountName}`, `Contato: ${contact?.name || contact?.phone}`, `Telefone: ${contact?.phone ?? ''}`,
    `Atendente: ${agent?.firstName || 'Não atribuído'}`, `Data: ${fmt(new Date())}`, bar, ''];
  for (const m of msgs) {
    if (!m.text && !atts.has(m.id)) continue;
    const author = m.senderType === 'Contact' ? (contact?.name || 'Lead') : 'Atendente/IA';
    lines.push(`[${fmt(m.createdAt)}] ${author}: ${m.text || '[Anexo]'}`);
  }
  lines.push('', bar, `Fim da transcrição — ${accountName}`, bar);
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="transcricao_${contact?.phone ?? ''}_${hoje}.txt"`);
  res.send(lines.join('\n'));
});

// --- mensagens ------------------------------------------------------------------------------

/** Assinatura "*Nome:*" (chave "Assinar mensagens" da caixa) — só no que vai pro WhatsApp. */
function signedText(inbox: typeof inboxes.$inferSelect, u: User, text: string) {
  if (!inbox.signMessages || !text.trim()) return text;
  const name = String(u.firstName ?? '').trim();
  return name ? `*${name}:*\n${text}` : text;
}

conversationsRouter.post('/conversations/:conversation_id/messages', upload.single('attachment'), async (req, res) => {
  const u = req.user!;
  const conv = await loadVisible(req, res, 'conversation_id');
  if (!conv) return;
  const isPrivate = String(req.body.is_private) === 'true';

  // anexo: upload novo ou cópia do anexo de uma mensagem encaminhada (cópia, não o mesmo blob)
  let file: { data: Buffer; filename: string; contentType: string } | null = null;
  if (req.file) {
    file = { data: req.file.buffer, filename: Buffer.from(req.file.originalname, 'latin1').toString('utf8'), contentType: req.file.mimetype };
  } else if (req.body.forward_message_id) {
    const [src] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.accountId, u.accountId!), eq(messages.id, Number(req.body.forward_message_id))));
    if (!src) return notFound(res);
    const blob = await blobFor('Message', src.id, 'attachment');
    if (blob) file = { data: await downloadBlob(blob), filename: blob.filename, contentType: blob.contentType || 'application/octet-stream' };
  }

  let message;
  let attachment = null;
  try {
    message = await createMessage({
      accountId: u.accountId!, conversationId: conv.id, senderType: 'User', senderId: u.id,
      text: req.body.text ?? '', isPrivate, status: messageStatusValue('sent'),
    }, { skipBroadcast: true });
    if (file) attachment = await attach('Message', message.id, 'attachment', file.data, file.filename, file.contentType);
  } catch (e) {
    console.error(`Falha ao salvar mensagem/anexo na conversa ${conv.id}:`, (e as Error).message);
    return res.status(422).json({ error: 'falha_anexo', message: `Não foi possível salvar o anexo (${(e as Error).name}).` });
  }
  broadcastConversations(u.accountId!, { event: 'message_created', conversation_id: conv.id, message: await messagePayload(message, attachment) });

  const [inbox] = conv.inboxId ? await db.select().from(inboxes).where(eq(inboxes.id, conv.inboxId)) : [];
  if (!isPrivate && inbox && WHATSAPP_PROVIDERS.includes(inbox.provider ?? '')) {
    // envio em segundo plano: a tela não fica esperando o WhatsApp (com a caixa lenta/caída o campo
    // ficava travado com o texto); se falhar, a mensagem vira "Não enviada" na conversa
    const msgId = message.id;
    void (async () => {
      let externalId: string | null = null;
      try {
        const [contact] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId));
        const recipient = channelIdentifier(contact);
        // flag anti-eco ANTES de enviar: o eco (fromMe) do webhook pode chegar antes da resposta
        if (contact.jid) cache.write(`sending_from_crm_${inbox.id}_${contact.jid}`, true, 20);
        externalId = recipient ? await messagingService(inbox).sendMessage(recipient, signedText(inbox, u, message.text ?? ''), file) : null;
      } catch (e) {
        console.error('Failed to send message via waha:', (e as Error).message);
      }
      await db.update(messages).set(externalId ? { sourceId: externalId } : { status: messageStatusValue('failed') }).where(eq(messages.id, msgId));
      if (!externalId) await rebroadcast(msgId);
    })();
  }

  res.status(201).json({ success: true, message: {
    id: message.id, senderType: 'agent', text: message.text, timestamp: hhmm(message.createdAt), status: 'sent',
    agentName: u.firstName, agentAvatarUrl: await avatarUrl(u.id), isPrivate: message.isPrivate,
    attachmentUrl: attachment ? blobUrl(attachment) : null, attachmentType: attachment?.contentType ?? null, attachmentName: attachment?.filename ?? null,
  } });
});

// Botão "T": transcreve o áudio sob demanda e guarda em messages.transcription
conversationsRouter.post('/conversations/:conversation_id/messages/:id/transcribe', async (req, res) => {
  const conv = await loadVisible(req, res, 'conversation_id');
  if (!conv) return;
  const [message] = await db.select().from(messages).where(and(eq(messages.conversationId, conv.id), eq(messages.id, id(req))));
  if (!message) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  if (message.transcription) return res.json({ transcription: message.transcription });
  const blob = await blobFor('Message', message.id, 'attachment');
  if (!blob || !String(blob.contentType).startsWith('audio/')) return res.status(422).json({ error: 'Essa mensagem não tem áudio.' });
  if (!(await transcriptionApiKey())) return res.status(422).json({ error: 'Transcrição indisponível: chave da IA não configurada.' });
  try {
    const ext = blob.filename.includes('.') ? blob.filename.split('.').pop() : String(blob.contentType).split('/').pop()!.split(';')[0];
    const text = await transcribeAudio(await downloadBlob(blob), `audio_${message.id}.${ext}`);
    if (!text?.trim()) return res.status(422).json({ error: 'Não foi possível entender o áudio.' });
    await db.update(messages).set({ transcription: text.trim() }).where(eq(messages.id, message.id));
    res.json({ transcription: text.trim() });
  } catch (e) {
    console.error(`Falha ao transcrever mensagem ${message.id}:`, (e as Error).message);
    res.status(422).json({ error: 'Falha ao transcrever o áudio. Tente de novo.' });
  }
});

// --- mensagens agendadas ----------------------------------------------------------------------

async function formatScheduled(m: typeof scheduledMessages.$inferSelect) {
  const att = await blobFor('ScheduledMessage', m.id, 'attachment');
  return { id: m.id, text: m.text, send_at: iso8601(m.sendAt), status: m.status,
    attachmentUrl: att ? blobUrl(att) : null, attachmentType: att?.contentType ?? null, attachmentName: att?.filename ?? null };
}

conversationsRouter.get('/conversations/:conversation_id/scheduled_messages', async (req, res) => {
  const conv = await loadVisible(req, res, 'conversation_id');
  if (!conv) return;
  const rows = await db.select().from(scheduledMessages).where(and(eq(scheduledMessages.conversationId, conv.id), eq(scheduledMessages.status, 'pending'))).orderBy(asc(scheduledMessages.sendAt));
  res.json(await Promise.all(rows.map(formatScheduled)));
});

conversationsRouter.post('/conversations/:conversation_id/scheduled_messages', upload.single('attachment'), async (req, res) => {
  const conv = await loadVisible(req, res, 'conversation_id');
  if (!conv) return;
  const sendAt = req.body.send_at ? new Date(String(req.body.send_at)) : null;
  if (!sendAt || isNaN(sendAt.getTime())) return res.status(422).json({ errors: ['Send at inválido'] });
  const [m] = await db.insert(scheduledMessages).values({ conversationId: conv.id, text: req.body.text ?? null, sendAt, status: 'pending' }).returning();
  if (req.file) await attach('ScheduledMessage', m.id, 'attachment', req.file.buffer, Buffer.from(req.file.originalname, 'latin1').toString('utf8'), req.file.mimetype);
  // o envio sai pela varredura de agendadas (jobs/scheduledMessages.ts), a cada 30s
  res.status(201).json(await formatScheduled(m));
});

conversationsRouter.delete('/conversations/:conversation_id/scheduled_messages/:id', async (req, res) => {
  const conv = await loadVisible(req, res, 'conversation_id');
  if (!conv) return;
  const [m] = await db.update(scheduledMessages).set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(scheduledMessages.conversationId, conv.id), eq(scheduledMessages.id, id(req)))).returning();
  if (!m) return notFound(res);
  res.status(204).end();
});

// --- etiquetas da conversa -------------------------------------------------------------------

conversationsRouter.get('/conversations/:conversation_id/tags', async (req, res) => {
  const conv = await loadVisible(req, res, 'conversation_id');
  if (conv) res.json(await conversationTagsOf(conv.id));
});

conversationsRouter.post('/conversations/:conversation_id/tags', async (req, res) => {
  const u = req.user!;
  const conv = await loadVisible(req, res, 'conversation_id');
  if (!conv) return;
  const name = String(req.body.name ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!name) return res.status(422).json({ error: 'Nome obrigatório' });
  let [tag] = await db.select().from(tags).where(and(eq(tags.accountId, u.accountId!), eq(tags.name, name))).limit(1);
  if (!tag) {
    // anexar etiqueta existente: qualquer um; criar etiqueta nova no catálogo: só diretoria
    if (!isOwner(u)) return res.status(403).json({ error: 'forbidden', message: 'Só a diretoria pode criar etiquetas novas. Escolha uma já existente.' });
    [tag] = await db.insert(tags).values({ accountId: u.accountId!, name, color: req.body.color || '#6b7280' }).returning();
  }
  const atuais = await conversationTagsOf(conv.id);
  if (!atuais.some(t => t.id === tag.id)) {
    await addConversationTag(conv.id, tag.id);
    broadcastConversations(conv.accountId, { event: 'conversation_tags_updated', conversation_id: conv.id, tags: await conversationTagsOf(conv.id) });
  }
  res.json({ id: tag.id, name: tag.name, color: tag.color });
});

conversationsRouter.delete('/conversations/:conversation_id/tags/:id', async (req, res) => {
  const conv = await loadVisible(req, res, 'conversation_id');
  if (!conv) return;
  const atuais = await conversationTagsOf(conv.id);
  const tag = atuais.find(t => t.id === id(req));
  if (tag) {
    // tirar 'agente_off' = "Retomar IA": limpa a pausa e tira 'com_atendente' junto
    if (tag.name === 'agente_off') {
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId));
      cache.delete(`ai_paused_${conv.inboxId}_${contact ? channelIdentifier(contact) : ''}`);
      const com = atuais.find(t => t.name === 'com_atendente');
      if (com) await db.delete(conversationTags).where(and(eq(conversationTags.conversationId, conv.id), eq(conversationTags.tagId, com.id)));
    }
    await db.delete(conversationTags).where(and(eq(conversationTags.conversationId, conv.id), eq(conversationTags.tagId, tag.id)));
    broadcastConversations(conv.accountId, { event: 'conversation_tags_updated', conversation_id: conv.id, tags: await conversationTagsOf(conv.id) });
  }
  res.status(204).end();
});
