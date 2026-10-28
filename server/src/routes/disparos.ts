import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { broadcastRecipients, broadcasts, contactTags, contacts, flows, inboxes, users } from '../db/schema.js';
import { createContact } from '../lib/contacts.js';
import { findOrCreateTag } from '../lib/conversations.js';
import { isFullPortfolio, requireAuth, requireBroadcast } from '../middleware/auth.js';
import { attach, blobFor, blobUrl } from '../lib/storage.js';
import { messagingService } from '../lib/waha.js';
import { assignedInboxes, inboxBadge } from '../lib/conversations.js';
import { LIMITE_MAXIMO, audienceWhere, cleanFiltros, disparoAtivoNoNumero, iniciarDisparo, mudarStatusDisparo, problemaNoTexto, renderTexto, situacaoDoNumero, type Filtros } from '../lib/disparos.js';

// Comunicações › Disparos (lib/disparos.ts). Gerência e diretoria; consultora com "Fazer disparos" ligado
// no usuário dispara só pra própria carteira, pelos números que atende, e só vê os disparos que criou.
export const disparosRouter = Router();
disparosRouter.use('/broadcasts', requireAuth, requireBroadcast);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });
const acc = (req: Request) => req.user!.accountId!;
const restrito = (req: Request) => !isFullPortfolio(req.user!);
/** Filtros do público; pra consultora a carteira é sempre a dela (fica gravado no disparo e vale no envio). */
const filtrosDe = (req: Request, raw: unknown): Filtros => {
  const f = cleanFiltros(raw);
  return restrito(req) ? { ...f, user_ids: [req.user!.id] } : f;
};
/** Disparo visível pra quem pede: consultora só os que ela criou. */
const doUsuario = (req: Request) => and(eq(broadcasts.accountId, acc(req)), restrito(req) ? eq(broadcasts.createdById, req.user!.id) : undefined);
const WHATSAPP = ['waha', 'baileys'];
/* eslint-disable @typescript-eslint/no-explicit-any */

const contagens = async (ids: number[]) => {
  if (!ids.length) return new Map<number, Record<string, number>>();
  const rows = await db.select({ b: broadcastRecipients.broadcastId, status: broadcastRecipients.status, n: sql<number>`count(*)::int`, resp: sql<number>`count(${broadcastRecipients.repliedAt})::int` })
    .from(broadcastRecipients).where(inArray(broadcastRecipients.broadcastId, ids)).groupBy(broadcastRecipients.broadcastId, broadcastRecipients.status);
  const m = new Map<number, Record<string, number>>();
  for (const r of rows) {
    const c = m.get(r.b) ?? { total: 0, pending: 0, sent: 0, failed: 0, skipped: 0, cancelled: 0, replied: 0 };
    c.total += r.n; c[r.status === 'sending' ? 'pending' : r.status] = (c[r.status === 'sending' ? 'pending' : r.status] || 0) + r.n; c.replied += r.resp;
    m.set(r.b, c);
  }
  return m;
};

async function toJson(b: typeof broadcasts.$inferSelect, counts?: Record<string, number>) {
  const [inbox] = b.inboxId ? await db.select().from(inboxes).where(eq(inboxes.id, b.inboxId)) : [];
  const [resp] = b.assigneeId ? await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, b.assigneeId)) : [];
  const [autor] = b.createdById ? await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, b.createdById)) : [];
  const [flow] = b.flowId ? await db.select({ name: flows.name }).from(flows).where(eq(flows.id, b.flowId)) : [];
  const blob = await blobFor('Broadcast', b.id, 'attachment');
  return {
    id: b.id, name: b.name, status: b.status, pause_reason: b.pauseReason, text: b.text, flow_id: b.flowId, flow_name: flow?.name ?? null,
    filters: b.filters, scheduled_at: b.scheduledAt, started_at: b.startedAt, finished_at: b.finishedAt, next_send_at: b.nextSendAt, created_at: b.createdAt,
    min_interval_seconds: b.minIntervalSeconds, max_interval_seconds: b.maxIntervalSeconds, daily_limit: b.dailyLimit, start_hour: b.startHour, end_hour: b.endHour, cooldown_days: b.cooldownDays,
    inbox: inbox ? { id: inbox.id, name: inbox.name, phone_number: inbox.phoneNumber, ...inboxBadge(inbox) } : null,
    created_by: autor ? `${autor.firstName ?? ''} ${autor.lastName ?? ''}`.trim() : null,
    assignee_id: b.assigneeId, assignee: resp ? `${resp.firstName ?? ''} ${resp.lastName ?? ''}`.trim() : null,
    attachment: blob ? { url: blobUrl(blob), name: blob.filename, type: blob.contentType } : null,
    counts: counts ?? (await contagens([b.id])).get(b.id) ?? { total: 0, pending: 0, sent: 0, failed: 0, skipped: 0, cancelled: 0, replied: 0 },
  };
}

/** Quanto o número ainda pode mandar hoje (aquecimento + limite de leads frios). */
disparosRouter.get('/broadcasts/numero/:inbox_id(\\d+)', async (req, res) => {
  const [ib] = await db.select({ id: inboxes.id }).from(inboxes).where(and(eq(inboxes.id, Number(req.params.inbox_id)), eq(inboxes.accountId, acc(req))));
  if (!ib) return res.status(404).json({ error: 'not_found' });
  const sit = await situacaoDoNumero(ib.id);
  const ativo = await disparoAtivoNoNumero(ib.id);
  res.json({ enviados_hoje: sit.hoje, frios_hoje: sit.friosHoje, limite_hoje: sit.limite, limite_frios: sit.limiteFrios, dias: sit.dias, disparo_ativo: ativo });
});

disparosRouter.get('/broadcasts', async (req, res) => {
  const list = await db.select().from(broadcasts).where(doUsuario(req)).orderBy(desc(broadcasts.id)).limit(100);
  const cm = await contagens(list.map(b => b.id));
  res.json(await Promise.all(list.map(b => toJson(b, cm.get(b.id)))));
});

/** Quantas pessoas recebem + amostra + como a mensagem chega pra 1ª delas. */
disparosRouter.post('/broadcasts/preview', async (req, res) => {
  const f = filtrosDe(req, req.body.filters);
  const where = await audienceWhere(acc(req), f, Math.max(0, Number(req.body.cooldown_days) || 0));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(contacts).where(where);
  const amostra = await db.select().from(contacts).where(where).orderBy(asc(contacts.name)).limit(8);
  const [resp] = amostra[0]?.userId ? await db.select({ firstName: users.firstName }).from(users).where(eq(users.id, amostra[0].userId)) : [];
  res.json({
    total: n,
    amostra: amostra.map(c => ({ id: c.id, name: c.name, phone: c.phone })),
    exemplo: amostra[0] && req.body.text ? { para: amostra[0].name || amostra[0].phone, texto: renderTexto(String(req.body.text), amostra[0], resp?.firstName || req.user!.firstName || '', () => 0) } : null,
  });
});

/**
 * Lista de números (colada ou de um .csv): uma pessoa por linha, com ou sem nome ("Maria; 14 99999-0000").
 * Número que já existe no CRM é reaproveitado (mesmo DDD + mesmos 8 últimos dígitos, sem grupo); o novo
 * vira contato com a etiqueta LISTA UPLOAD (como no Kommo). Devolve os ids pra usar no disparo.
 */
disparosRouter.post('/broadcasts/numeros', async (req, res) => {
  const linhas = String(req.body.texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 5000);
  const tag = await findOrCreateTag(acc(req), 'LISTA UPLOAD', '#9ca3af');
  const ids = new Set<number>();
  let criados = 0, existentes = 0, outraCarteira = 0;
  const invalidos: string[] = [];
  // consultora: número que é de outra carteira fica de fora; sem responsável ou novo vira dela
  const minha = restrito(req) ? req.user!.id : null;
  for (const linha of linhas) {
    const partes = linha.split(/[;,\t]/).map(p => p.trim()).filter(Boolean);
    const fone = partes.find(p => (p.replace(/\D/g, '').length >= 10));
    let digitos = (fone || '').replace(/\D/g, '');
    if (digitos.length >= 10 && digitos.length <= 11) digitos = '55' + digitos;
    if (digitos.length < 12 || digitos.length > 13) { if (!/^(nome|telefone|celular|whatsapp)/i.test(linha)) invalidos.push(linha); continue; }
    const nome = partes.filter(p => p !== fone).join(' ').trim() || null;
    const fim = '%' + digitos.slice(-8);
    const candidatos = await db.select().from(contacts).where(and(eq(contacts.accountId, acc(req)),
      sql`coalesce(${contacts.status}, '') <> 'grupo' AND coalesce(${contacts.jid}, '') NOT LIKE '%@g.us'`,
      sql`regexp_replace(coalesce(${contacts.phone}, ''), '\\D', '', 'g') LIKE ${fim}`)).limit(10);
    const mesmo = candidatos.find(c => (c.phone || '').replace(/\D/g, '').slice(2, 4) === digitos.slice(2, 4));
    if (mesmo) {
      if (minha && mesmo.userId && mesmo.userId !== minha) { outraCarteira++; continue; }
      if (minha && !mesmo.userId) await db.update(contacts).set({ userId: minha }).where(eq(contacts.id, mesmo.id));
      ids.add(mesmo.id); existentes++; continue;
    }
    const novo = await createContact({ accountId: acc(req), phone: '+' + digitos, name: nome || '+' + digitos, source: 'Lista de disparo', ...(minha ? { userId: minha } : {}) } as any);
    await db.insert(contactTags).values({ contactId: novo.id, tagId: tag.id }).onConflictDoNothing();
    ids.add(novo.id); criados++;
  }
  res.json({ contact_ids: [...ids], total: ids.size, criados, existentes, outra_carteira: outraCarteira, invalidos: invalidos.slice(0, 20), n_invalidos: invalidos.length });
});

const int = (v: unknown, d: number, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

/** Cria e já inicia (ou agenda). multipart: data (JSON) + attachment opcional. */
disparosRouter.post('/broadcasts', upload.single('attachment'), async (req, res) => {
  let v: any;
  try { v = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body } catch { return res.status(422).json({ message: 'Dados inválidos.' }) }
  const name = String(v.name || '').trim();
  if (!name) return res.status(422).json({ message: 'Dê um nome pro disparo.' });
  const [inbox] = await db.select().from(inboxes).where(and(eq(inboxes.id, Number(v.inbox_id)), eq(inboxes.accountId, acc(req))));
  if (!inbox || !WHATSAPP.includes(inbox.provider || '')) return res.status(422).json({ message: 'Escolha o número de WhatsApp que vai disparar.' });
  if (restrito(req) && !(await assignedInboxes(req.user!.id)).some(i => i.id === inbox.id)) return res.status(403).json({ message: 'Você só pode disparar pelos números que atende.' });
  const flowId = Number(v.flow_id) || null;
  if (flowId) {
    const [f] = await db.select({ id: flows.id }).from(flows).where(and(eq(flows.id, flowId), eq(flows.accountId, acc(req))));
    if (!f) return res.status(422).json({ message: 'Robô não encontrado.' });
  }
  const text = flowId ? null : String(v.text || '').trim();
  if (!flowId && !text) return res.status(422).json({ message: 'Escreva a mensagem (mesmo com anexo, ela vai como legenda).' });
  // proteção contra banimento (lib/disparos.ts): texto variado e 1 disparo por vez no número
  const ruim = text ? problemaNoTexto(text) : null;
  if (ruim) return res.status(422).json({ message: ruim });
  const ativo = await disparoAtivoNoNumero(inbox.id);
  if (ativo) return res.status(422).json({ message: `Esse número já está com o disparo "${ativo.name}" rodando. Um por vez em cada número: espere terminar, pause ou cancele, ou use outro número.` });
  // consultora não acelera nem passa dos 200/dia (protege o número que é de todos)
  const minS = int(v.min_interval_seconds, 30, restrito(req) ? 30 : 20, 3600);
  const maxS = Math.max(minS, int(v.max_interval_seconds, 90, 20, 3600));
  const startH = int(v.start_hour, 8, 0, 23), endH = int(v.end_hour, 20, 1, 24);
  if (endH <= startH) return res.status(422).json({ message: 'O horário de fim precisa ser depois do início.' });
  const scheduledAt = v.scheduled_at ? new Date(v.scheduled_at) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return res.status(422).json({ message: 'Data de agendamento inválida.' });

  // responsável: consultora é sempre ela mesma; gerência escolhe (ou deixa sem)
  let assigneeId: number | null = restrito(req) ? req.user!.id : Number(v.assignee_id) || null;
  if (assigneeId && !restrito(req)) {
    const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, assigneeId), eq(users.accountId, acc(req))));
    if (!u) return res.status(422).json({ message: 'Responsável não encontrado.' });
  }
  const [b] = await db.insert(broadcasts).values({
    accountId: acc(req), inboxId: inbox.id, createdById: req.user!.id, assigneeId, name, filters: filtrosDe(req, v.filters), text, flowId,
    scheduledAt, minIntervalSeconds: minS, maxIntervalSeconds: maxS, dailyLimit: int(v.daily_limit, LIMITE_MAXIMO, 1, LIMITE_MAXIMO),
    startHour: startH, endHour: endH, cooldownDays: int(v.cooldown_days, 0, 0, 365),
  }).returning();
  if (req.file && !flowId) await attach('Broadcast', b.id, 'attachment', req.file.buffer, req.file.originalname, req.file.mimetype);
  const iniciado = await iniciarDisparo(b.id);
  res.status(201).json(await toJson(iniciado ?? b));
});

disparosRouter.get('/broadcasts/:id(\\d+)', async (req, res) => {
  const [b] = await db.select().from(broadcasts).where(and(eq(broadcasts.id, Number(req.params.id)), doUsuario(req)));
  if (!b) return res.status(404).json({ error: 'not_found' });
  const filtro = String(req.query.status || '');
  const rows = await db.select({ r: broadcastRecipients, name: contacts.name, phone: contacts.phone }).from(broadcastRecipients)
    .innerJoin(contacts, eq(contacts.id, broadcastRecipients.contactId))
    .where(and(eq(broadcastRecipients.broadcastId, b.id), filtro === 'replied' ? sql`${broadcastRecipients.repliedAt} IS NOT NULL` : filtro ? eq(broadcastRecipients.status, filtro) : undefined))
    .orderBy(sql`${broadcastRecipients.sentAt} DESC NULLS LAST`, asc(broadcastRecipients.id)).limit(500);
  res.json({
    ...(await toJson(b)),
    recipients: rows.map(x => ({ id: x.r.id, contact_id: x.r.contactId, name: x.name, phone: x.phone, status: x.r.status, error: x.r.error, sent_at: x.r.sentAt, replied_at: x.r.repliedAt })),
  });
});

for (const acao of ['pause', 'resume', 'cancel'] as const) {
  disparosRouter.post(`/broadcasts/:id(\\d+)/${acao}`, async (req: Request, res: Response) => {
    const [b] = await db.select({ id: broadcasts.id }).from(broadcasts).where(and(eq(broadcasts.id, Number(req.params.id)), doUsuario(req)));
    if (!b) return res.status(404).json({ error: 'not_found' });
    if (acao === 'resume') {
      const [cheio] = await db.select({ inboxId: broadcasts.inboxId }).from(broadcasts).where(eq(broadcasts.id, b.id));
      const ativo = cheio?.inboxId ? await disparoAtivoNoNumero(cheio.inboxId, b.id) : null;
      if (ativo) return res.status(422).json({ message: `Esse número já está com o disparo "${ativo.name}" rodando. Pause ou cancele ele antes.` });
      const [ib] = cheio?.inboxId ? await db.select().from(inboxes).where(eq(inboxes.id, cheio.inboxId)) : [];
      if (ib && !(await messagingService(ib).connected())) return res.status(422).json({ message: 'O número está desconectado. Reconecte (e confira se não foi banido) antes de retomar.' });
    }
    const u = await mudarStatusDisparo(b.id, acao);
    res.json(u ? await toJson(u) : null);
  });
}
