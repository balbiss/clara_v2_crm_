import { and, asc, eq, gte, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { activeStorageAttachments, broadcastRecipients, broadcasts, contactTags, contacts, conversations, inboxes, tags, users } from '../db/schema.js';
import { messagingService } from './waha.js';
import { blobFor, downloadBlob } from './storage.js';
import { createMessage, messageStatusValue, rebroadcast } from './messages.js';
import { convStatusValue, findOrCreateConversation, findOrCreateTag } from './conversations.js';
import { setJidIfFree } from './contacts.js';
import { startBot } from './salesbot.js';
import { cache } from './cache.js';
import { broadcastConversations } from './realtime.js';
import { setBroadcastReplyHook } from './wahaIngestion.js';

// Disparo em massa (Comunicações › Disparos). A lista é congelada ao iniciar (broadcast_recipients) e
// um job manda UM de cada vez por número: intervalo aleatório entre min/max segundos, limite diário por
// número, só dentro do horário (Brasília). Antes de cada envio confere na WAHA se o número tem WhatsApp
// e qual o chatId certo (com/sem o 9). Quem responde "parar/sair" ganha a etiqueta OPT_OUT_TAG e sai
// dos próximos. Conversa nova criada pelo disparo nasce fechada (não lota a fila) e reabre quando a
// pessoa responde. Número caído ou WAHA instável: espera e tenta de novo sozinho.
/* eslint-disable @typescript-eslint/no-explicit-any */

export const OPT_OUT_TAG = 'NÃO RECEBER DISPAROS';
const OPT_OUT_RE = /^\s*(parar|pare|sair|stop|cancelar|descadastrar|não quero mais|nao quero mais)\s*[.!]*\s*$/i;

export type Filtros = {
  stage_ids?: number[]; statuses?: string[]; tag_ids?: number[]; sem_tag_ids?: number[];
  user_ids?: number[]; cidade?: string; aniversario_mes?: boolean; contact_ids?: number[];
};

const nums = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter(n => Number.isFinite(n) && n > 0) : []);
const strs = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

export function cleanFiltros(f: any): Filtros {
  return {
    stage_ids: nums(f?.stage_ids), statuses: strs(f?.statuses), tag_ids: nums(f?.tag_ids), sem_tag_ids: nums(f?.sem_tag_ids),
    user_ids: nums(f?.user_ids), cidade: f?.cidade ? String(f.cidade).trim() : undefined, aniversario_mes: !!f?.aniversario_mes, contact_ids: nums(f?.contact_ids),
  };
}

/** Quem recebe: todos os filtros juntos (E). Nunca grupo, bloqueado, sem telefone ou quem pediu pra sair. */
export async function audienceWhere(accountId: number, f: Filtros, cooldownDays = 0): Promise<SQL> {
  const c: SQL[] = [
    eq(contacts.accountId, accountId),
    sql`(${contacts.phone} IS NOT NULL OR ${contacts.jid} IS NOT NULL)`,
    sql`coalesce(${contacts.status}, '') NOT IN ('blocked', 'grupo')`,
    sql`coalesce(${contacts.jid}, '') NOT LIKE '%@g.us'`,
    sql`NOT EXISTS (SELECT 1 FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.contact_id = ${contacts.id} AND upper(t.name) = ${OPT_OUT_TAG})`,
  ];
  const lista = (ids: number[]) => sql.join(ids.map(i => sql`${i}`), sql`, `);
  if (f.stage_ids?.length) c.push(sql`EXISTS (SELECT 1 FROM pipeline_cards pc WHERE pc.contact_id = ${contacts.id} AND pc.pipeline_stage_id IN (${lista(f.stage_ids)}))`);
  if (f.statuses?.length) c.push(inArray(contacts.status, f.statuses));
  if (f.tag_ids?.length) c.push(sql`EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = ${contacts.id} AND ct.tag_id IN (${lista(f.tag_ids)}))`);
  if (f.sem_tag_ids?.length) c.push(sql`NOT EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = ${contacts.id} AND ct.tag_id IN (${lista(f.sem_tag_ids)}))`);
  if (f.user_ids?.length) c.push(inArray(contacts.userId, f.user_ids));
  if (f.cidade) c.push(sql`${contacts.customAttributes} ->> 'cf_cidade' ILIKE ${'%' + f.cidade.replace(/[%_]/g, '') + '%'}`);
  if (f.aniversario_mes) c.push(sql`extract(month from ${contacts.birthDate}) = extract(month from (now() AT TIME ZONE 'America/Sao_Paulo'))`);
  if (f.contact_ids?.length) c.push(inArray(contacts.id, f.contact_ids));
  if (cooldownDays > 0) {
    const desde = new Date(Date.now() - cooldownDays * 86400e3).toISOString();
    c.push(sql`NOT EXISTS (SELECT 1 FROM broadcast_recipients br WHERE br.contact_id = ${contacts.id} AND br.status = 'sent' AND br.sent_at > ${desde})`);
  }
  return and(...c)!;
}

// --- texto: variações {Oi|Olá} e campos {primeiro_nome}, {nome}, {consultora}, {data_agendamento}… ---

const fmtData = (v: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); return m ? `${m[3]}/${m[2]}/${m[1]}` : v; };

export function renderTexto(texto: string, contact: Pick<typeof contacts.$inferSelect, 'name' | 'phone' | 'customAttributes'>, consultora = '', sorteio = Math.random) {
  const ca = (contact.customAttributes || {}) as Record<string, unknown>;
  const nome = (contact.name && !/^\+?\d[\d\s()-]+$/.test(contact.name) ? contact.name : '').trim();
  const vars: Record<string, string> = {
    nome, primeiro_nome: nome.split(/\s+/)[0] || '', consultora, telefone: contact.phone || '',
    data_agendamento: ca.data_agendamento ? fmtData(String(ca.data_agendamento)) : '',
  };
  return texto
    .replace(/\{([^{}|]*\|[^{}]*)\}/g, (_, opts: string) => { const o = opts.split('|'); return o[Math.floor(sorteio() * o.length)] ?? '' })
    .replace(/\{([a-z0-9_]+)\}/gi, (_, k: string) => {
      const key = k.toLowerCase();
      if (key in vars) return vars[key];
      const v = ca[key] ?? ca['cf_' + key];
      return v == null ? '' : (typeof v === 'string' ? fmtData(v) : String(v));
    })
    .replace(/[ \t]+([,.!?])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();
}

// --- horário (Brasília) ---------------------------------------------------------------------------

const spAgora = () => new Date(Date.now() - 3 * 3600_000);
const horaSP = () => spAgora().getUTCHours();
/** Início do dia em Brasília daqui a `plus` dias, às `hora` horas. */
function diaSP(plus = 0, hora = 0) {
  const n = spAgora();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + plus, hora) + 3 * 3600_000);
}

// --- iniciar / pausar / cancelar ------------------------------------------------------------------

/** Congela a lista e põe pra rodar (ou agendado). */
export async function iniciarDisparo(id: number) {
  const [b] = await db.select().from(broadcasts).where(eq(broadcasts.id, id));
  if (!b || b.status !== 'draft') return null;
  const where = await audienceWhere(b.accountId, cleanFiltros(b.filters), b.cooldownDays);
  const ids = (await db.select({ id: contacts.id }).from(contacts).where(where).orderBy(asc(contacts.id))).map(r => r.id);
  for (let i = 0; i < ids.length; i += 500) {
    await db.insert(broadcastRecipients).values(ids.slice(i, i + 500).map(contactId => ({ broadcastId: b.id, contactId }))).onConflictDoNothing();
  }
  const agora = new Date();
  const agendado = b.scheduledAt && b.scheduledAt > agora;
  const [u] = await db.update(broadcasts).set({
    status: ids.length ? (agendado ? 'scheduled' : 'running') : 'done', nextSendAt: agendado ? b.scheduledAt : agora,
    startedAt: agendado ? null : agora, finishedAt: ids.length ? null : agora, updatedAt: agora,
  }).where(eq(broadcasts.id, b.id)).returning();
  return u;
}

export async function mudarStatusDisparo(id: number, acao: 'pause' | 'resume' | 'cancel') {
  const [b] = await db.select().from(broadcasts).where(eq(broadcasts.id, id));
  if (!b) return null;
  const agora = new Date();
  if (acao === 'pause' && ['running', 'scheduled'].includes(b.status)) {
    return (await db.update(broadcasts).set({ status: 'paused', pauseReason: 'manual', updatedAt: agora }).where(eq(broadcasts.id, id)).returning())[0];
  }
  if (acao === 'resume' && b.status === 'paused') {
    return (await db.update(broadcasts).set({ status: 'running', pauseReason: null, nextSendAt: agora, updatedAt: agora }).where(eq(broadcasts.id, id)).returning())[0];
  }
  if (acao === 'cancel' && !['done', 'cancelled'].includes(b.status)) {
    await db.update(broadcastRecipients).set({ status: 'cancelled', updatedAt: agora }).where(and(eq(broadcastRecipients.broadcastId, id), eq(broadcastRecipients.status, 'pending')));
    return (await db.update(broadcasts).set({ status: 'cancelled', finishedAt: agora, updatedAt: agora }).where(eq(broadcasts.id, id)).returning())[0];
  }
  return b;
}

// --- job ------------------------------------------------------------------------------------------

let rodando = false;
export async function tickDisparos() {
  if (rodando) return;
  rodando = true;
  try {
    const agora = new Date();
    const vencidos = await db.select().from(broadcasts)
      .where(and(inArray(broadcasts.status, ['scheduled', 'running']), sql`coalesce(${broadcasts.nextSendAt}, ${broadcasts.scheduledAt}, ${broadcasts.createdAt}) <= ${agora.toISOString()}`))
      .orderBy(asc(broadcasts.id));
    const numerosUsados = new Set<number>();
    for (const b of vencidos) {
      // um envio por número por rodada, mesmo com 2 disparos no mesmo número
      if (b.inboxId && numerosUsados.has(b.inboxId)) continue;
      try { if (await passo(b) && b.inboxId) numerosUsados.add(b.inboxId) }
      catch (e) { console.error(`[Disparo #${b.id}]`, (e as Error).message) }
    }
  } finally {
    rodando = false;
  }
}

const esperar = (b: typeof broadcasts.$inferSelect, ate: Date, motivo: string | null) =>
  db.update(broadcasts).set({ nextSendAt: ate, pauseReason: motivo, updatedAt: new Date() }).where(eq(broadcasts.id, b.id));

/** Um envio do disparo. Retorna true se usou o número nessa rodada. */
async function passo(b: typeof broadcasts.$inferSelect): Promise<boolean> {
  const agora = new Date();
  if (b.status === 'scheduled') await db.update(broadcasts).set({ status: 'running', startedAt: agora }).where(eq(broadcasts.id, b.id));

  // horário: fora da janela, espera até a próxima abertura
  const h = horaSP();
  if (h < b.startHour || h >= b.endHour) { await esperar(b, h < b.startHour ? diaSP(0, b.startHour) : diaSP(1, b.startHour), 'fora_do_horario'); return false; }

  const [inbox] = b.inboxId ? await db.select().from(inboxes).where(eq(inboxes.id, b.inboxId)) : [];
  if (!inbox) { await db.update(broadcasts).set({ status: 'paused', pauseReason: 'sem_numero', updatedAt: agora }).where(eq(broadcasts.id, b.id)); return false; }
  const service = messagingService(inbox);
  if (!(await service.connected())) { await esperar(b, new Date(Date.now() + 5 * 60_000), 'numero_desconectado'); return false; }

  // limite diário e intervalo mínimo valem por NÚMERO (somando todos os disparos dele)
  const [{ hoje, ultimo }] = await db.select({
    hoje: sql<number>`count(*) FILTER (WHERE ${broadcastRecipients.sentAt} >= ${diaSP(0).toISOString()})::int`,
    ultimo: sql<string | null>`max(${broadcastRecipients.sentAt})`,
  }).from(broadcastRecipients).innerJoin(broadcasts, eq(broadcasts.id, broadcastRecipients.broadcastId))
    .where(and(eq(broadcasts.inboxId, inbox.id), eq(broadcastRecipients.status, 'sent')));
  if (hoje >= b.dailyLimit) { await esperar(b, diaSP(1, b.startHour), 'limite_diario'); return false; }
  if (ultimo && Date.now() - new Date(ultimo).getTime() < b.minIntervalSeconds * 1000) {
    await esperar(b, new Date(new Date(ultimo).getTime() + b.minIntervalSeconds * 1000), b.pauseReason); return false;
  }

  // próxima pessoa da lista (trava otimista)
  const [prox] = await db.select({ id: broadcastRecipients.id }).from(broadcastRecipients)
    .where(and(eq(broadcastRecipients.broadcastId, b.id), eq(broadcastRecipients.status, 'pending'))).orderBy(asc(broadcastRecipients.id)).limit(1);
  if (!prox) {
    await db.update(broadcasts).set({ status: 'done', finishedAt: agora, pauseReason: null, updatedAt: agora }).where(eq(broadcasts.id, b.id));
    return false;
  }
  const [r] = await db.update(broadcastRecipients).set({ status: 'sending', updatedAt: agora })
    .where(and(eq(broadcastRecipients.id, prox.id), eq(broadcastRecipients.status, 'pending'))).returning();
  if (!r) return false;
  const marcar = (status: string, extra: Partial<typeof broadcastRecipients.$inferInsert> = {}) =>
    db.update(broadcastRecipients).set({ status, updatedAt: new Date(), ...extra }).where(eq(broadcastRecipients.id, r.id));
  const proximoEnvio = () => esperar(b, new Date(Date.now() + (b.minIntervalSeconds + Math.random() * Math.max(0, b.maxIntervalSeconds - b.minIntervalSeconds)) * 1000), null);

  let [contact] = await db.select().from(contacts).where(eq(contacts.id, r.contactId));
  if (!contact || contact.status === 'blocked') { await marcar('skipped', { error: 'contato_bloqueado' }); return false; }
  const optOut = await db.select({ id: tags.id }).from(contactTags).innerJoin(tags, eq(tags.id, contactTags.tagId))
    .where(and(eq(contactTags.contactId, contact.id), sql`upper(${tags.name}) = ${OPT_OUT_TAG}`)).limit(1);
  if (optOut.length) { await marcar('skipped', { error: 'pediu_para_sair' }); return false; }

  // confere na WAHA se o número tem WhatsApp e pega o chatId certo (com ou sem o 9)
  let chatId: string | null = null;
  if (contact.phone) {
    const chk = await service.checkNumber(contact.phone);
    if (chk.exists === null) { await marcar('pending'); await esperar(b, new Date(Date.now() + 60_000), 'whatsapp_instavel'); return false; }
    if (!chk.exists) { await marcar('skipped', { error: 'sem_whatsapp' }); return false; }
    chatId = chk.chatId;
  } else if (contact.jid?.endsWith('@lid') || contact.jid?.endsWith('@c.us')) {
    chatId = contact.jid;
  }
  if (!chatId) { await marcar('skipped', { error: 'sem_whatsapp' }); return false; }
  if (!contact.jid && chatId.endsWith('@c.us')) contact = await setJidIfFree(contact, chatId);

  // conversa: a que já existe nesse número; nova nasce fechada (reabre quando a pessoa responder)
  const conv = await findOrCreateConversation(contact.id, inbox.id, { accountId: b.accountId, status: convStatusValue('resolved') ?? 2, userId: contact.userId, source: 'whatsapp' });

  if (b.flowId) {
    const run = await startBot(b.flowId, contact.id, { conversationId: conv.id, trigger: 'disparo', force: true });
    if (!run) { await marcar('failed', { error: 'robo_nao_rodou' }); await proximoEnvio(); return true; }
    await marcar('sent', { sentAt: new Date() });
    await proximoEnvio();
    return true;
  }

  const [criador] = b.createdById ? await db.select({ firstName: users.firstName }).from(users).where(eq(users.id, b.createdById)) : [];
  const [resp] = contact.userId ? await db.select({ firstName: users.firstName }).from(users).where(eq(users.id, contact.userId)) : [];
  const texto = renderTexto(b.text || '', contact, resp?.firstName || criador?.firstName || '');
  const blob = await blobFor('Broadcast', b.id, 'attachment');
  const file = blob ? { data: await downloadBlob(blob), filename: blob.filename, contentType: blob.contentType || 'application/octet-stream' } : null;
  cache.write(`sending_from_crm_${inbox.id}_${chatId}`, true, 20); // o eco (fromMe) não vira mensagem duplicada
  const externalId = await service.sendMessage(chatId, texto || null, file);
  if (!externalId) { await marcar('failed', { error: 'envio_falhou' }); await proximoEnvio(); return true; }

  const msg = await createMessage({
    accountId: b.accountId, conversationId: conv.id, text: texto, senderType: 'User', senderId: b.createdById,
    sourceId: externalId, status: messageStatusValue('delivered'), broadcastId: b.id,
  }, { skipBroadcast: !!blob });
  if (blob) {
    await db.insert(activeStorageAttachments).values({ name: 'attachment', recordType: 'Message', recordId: msg.id, blobId: blob.id });
    await rebroadcast(msg.id);
  }
  await marcar('sent', { sentAt: new Date(), messageId: msg.id });
  await proximoEnvio();
  return true;
}

// --- resposta de quem recebeu ---------------------------------------------------------------------

/** Cliente escreveu: marca "respondeu" no disparo, reabre a conversa fechada e trata o "parar". */
export async function onRespostaDisparo(contactId: number, conversationId: number, texto: string) {
  const desde = new Date(Date.now() - 7 * 86400e3);
  const recebidos = await db.update(broadcastRecipients).set({ repliedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(broadcastRecipients.contactId, contactId), eq(broadcastRecipients.status, 'sent'), sql`${broadcastRecipients.repliedAt} IS NULL`, gte(broadcastRecipients.sentAt, desde)))
    .returning({ id: broadcastRecipients.id });
  if (!recebidos.length) return;
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  if (conv && conv.status === convStatusValue('resolved')) {
    await db.update(conversations).set({ status: 0 }).where(eq(conversations.id, conv.id));
    broadcastConversations(conv.accountId, { event: 'conversation_updated', conversation: { id: conv.id, status: 'open', snoozed_until: null } });
  }
  if (OPT_OUT_RE.test(texto || '') && conv) {
    const tag = await findOrCreateTag(conv.accountId, OPT_OUT_TAG, '#6b7280');
    await db.insert(contactTags).values({ contactId, tagId: tag.id }).onConflictDoNothing();
  }
}
setBroadcastReplyHook(onRespostaDisparo);
