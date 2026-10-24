import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts, conversations, teamChatMembers, teamChatMessages, teamChats, users } from '../db/schema.js';
import { requireAuth, roleName } from '../middleware/auth.js';
import { attach, blobsFor, blobUrl, type Blob } from '../lib/storage.js';
import { broadcastInternalChat } from '../lib/realtime.js';
import { createMessage, messageStatusValue } from '../lib/messages.js';

// "Chats da equipe" no modelo do Kommo (support.kommo.com/docs/manage-team-chat): conversa
// particular com um colega, grupo (nome + colegas) e menção — quando alguém marca um colega numa
// conversa com cliente, vira um tópico com o nome do cliente; dali dá pra responder ou abrir a
// conversa. Filtros Todos / Não lidos / Hoje / Destaque + período e busca; ordenar por mais
// recentes ou não lidos primeiro; ações múltiplas (ler, destacar, silenciar); cada pessoa tem o
// seu "lido até", destaque e silenciar. Tempo real pelo mesmo canal 'internal_chat'.
export const teamChatRouter = Router();
teamChatRouter.use('/team_chats', requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
/* eslint-disable @typescript-eslint/no-explicit-any */

const nome = (u: any) => `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || 'Colega';
const rotulo = (m: { text: string | null } | null | undefined, att?: Blob | null) => {
  if (m?.text) return m.text;
  if (!att) return '';
  const t = att.contentType || '';
  return t.startsWith('image/') ? 'Foto' : t.startsWith('audio/') ? 'Áudio' : t.startsWith('video/') ? 'Vídeo' : att.filename;
};
const ts = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

async function membership(req: Request, res: Response, chatId: number) {
  const [r] = await db.select({ c: teamChats, m: teamChatMembers }).from(teamChats)
    .innerJoin(teamChatMembers, and(eq(teamChatMembers.chatId, teamChats.id), eq(teamChatMembers.userId, req.user!.id)))
    .where(and(eq(teamChats.id, chatId), eq(teamChats.accountId, req.user!.accountId!)));
  if (!r) res.status(404).json({ error: 'Conversa não encontrada.' });
  return r ?? null;
}

/** Resumo de uma ou mais conversas do ponto de vista de quem pediu. */
async function resumir(userId: number, chatIds: number[]) {
  if (!chatIds.length) return [];
  const chats = await db.select().from(teamChats).where(inArray(teamChats.id, chatIds));
  const membros = await db.select({ chatId: teamChatMembers.chatId, userId: teamChatMembers.userId, lastReadAt: teamChatMembers.lastReadAt, starred: teamChatMembers.starred, muted: teamChatMembers.muted, f: users.firstName, l: users.lastName, role: users.role })
    .from(teamChatMembers).innerJoin(users, eq(users.id, teamChatMembers.userId)).where(inArray(teamChatMembers.chatId, chatIds));
  const ultimas = await db.execute(sql`SELECT DISTINCT ON (chat_id) id, chat_id, sender_id, kind, text, created_at FROM team_chat_messages WHERE chat_id IN (${sql.join(chatIds.map(i => sql`${i}`), sql`, `)}) ORDER BY chat_id, created_at DESC, id DESC`) as unknown as any[];
  const atts = await blobsFor('TeamChatMessage', ultimas.map(u => Number(u.id)), 'attachment');
  const naoLidas = await db.execute(sql`SELECT m.chat_id, COUNT(*)::int AS n FROM team_chat_messages m JOIN team_chat_members me ON me.chat_id = m.chat_id AND me.user_id = ${userId}
    WHERE m.chat_id IN (${sql.join(chatIds.map(i => sql`${i}`), sql`, `)}) AND m.sender_id IS DISTINCT FROM ${userId} AND m.kind = 'text' AND (me.last_read_at IS NULL OR m.created_at > me.last_read_at) GROUP BY m.chat_id`) as unknown as any[];
  const contatoIds = chats.map(c => c.contactId).filter((x): x is number => !!x);
  const cts = contatoIds.length ? await db.select({ id: contacts.id, name: contacts.name, phone: contacts.phone, avatarUrl: contacts.avatarUrl }).from(contacts).where(inArray(contacts.id, contatoIds)) : [];
  const userIds = [...new Set(membros.map(m => m.userId))];
  const avatares = await blobsFor('User', userIds, 'avatar');
  const nomes = new Map(membros.map(m => [m.userId, `${m.f || ''} ${m.l || ''}`.trim()]));
  return chats.map(c => {
    const ms = membros.filter(m => m.chatId === c.id);
    const eu = ms.find(m => m.userId === userId);
    const outro = c.kind === 'direct' ? ms.find(m => m.userId !== userId) : undefined;
    const ct = cts.find(x => x.id === c.contactId);
    const u = ultimas.find(x => Number(x.chat_id) === c.id);
    const av = outro ? avatares.get(outro.userId)?.[0] : undefined;
    return {
      id: c.id, kind: c.kind,
      name: c.kind === 'direct' ? (outro ? `${outro.f || ''} ${outro.l || ''}`.trim() : 'Conversa') : c.kind === 'mention' ? (ct?.name || ct?.phone || c.name || 'Cliente') : (c.name || 'Grupo'),
      other_user_id: outro?.userId ?? null, role: outro ? roleName(outro.role) : null,
      avatar_url: c.kind === 'mention' ? ct?.avatarUrl ?? null : av ? blobUrl(av) : null,
      contact_id: c.contactId, conversation_id: c.conversationId, created_by_id: c.createdById,
      members: ms.map(m => ({ id: m.userId, name: `${m.f || ''} ${m.l || ''}`.trim() })),
      starred: !!eu?.starred, muted: !!eu?.muted,
      unread_count: Number(naoLidas.find(n => Number(n.chat_id) === c.id)?.n || 0),
      last_message: u ? { text: rotulo(u, atts.get(Number(u.id))?.[0]), kind: u.kind, sender_id: u.sender_id == null ? null : Number(u.sender_id), sender_name: u.sender_id == null ? null : nomes.get(Number(u.sender_id)) || null, created_at: ts(u.created_at) } : null,
      last_message_at: ts(c.lastMessageAt || c.createdAt),
    };
  });
}

/** Avisa os membros em tempo real (o front filtra pelos ids). */
async function avisar(accountId: number, chatId: number, extra: Record<string, unknown>) {
  const ms = await db.select({ userId: teamChatMembers.userId }).from(teamChatMembers).where(eq(teamChatMembers.chatId, chatId));
  broadcastInternalChat(accountId, { event: 'team_chat', chat_id: chatId, member_ids: ms.map(m => m.userId), ...extra });
}

async function serializar(m: typeof teamChatMessages.$inferSelect, att?: Blob | null, nomeRemetente?: string | null) {
  return { id: m.id, chat_id: m.chatId, sender_id: m.senderId, sender_name: nomeRemetente ?? null, kind: m.kind, text: m.text, created_at: ts(m.createdAt),
    attachment_url: att ? blobUrl(att) : null, attachment_type: att?.contentType ?? null, attachment_name: att?.filename ?? null };
}

async function postar(accountId: number, chatId: number, senderId: number | null, text: string | null, kind = 'text', file?: Express.Multer.File) {
  const [m] = await db.insert(teamChatMessages).values({ chatId, senderId, text: text || null, kind }).returning();
  const att = file ? await attach('TeamChatMessage', m.id, 'attachment', file.buffer, Buffer.from(file.originalname, 'latin1').toString('utf8'), file.mimetype) : null;
  await db.update(teamChats).set({ lastMessageAt: m.createdAt, updatedAt: new Date() }).where(eq(teamChats.id, chatId));
  if (senderId) await db.update(teamChatMembers).set({ lastReadAt: m.createdAt }).where(and(eq(teamChatMembers.chatId, chatId), eq(teamChatMembers.userId, senderId)));
  const [s] = senderId ? await db.select({ f: users.firstName, l: users.lastName }).from(users).where(eq(users.id, senderId)) : [];
  const payload = await serializar(m, att, s ? `${s.f || ''} ${s.l || ''}`.trim() : null);
  await avisar(accountId, chatId, { message: payload });
  return payload;
}

// --- lista ----------------------------------------------------------------------------------------
teamChatRouter.get('/team_chats', async (req, res) => {
  const me = req.user!;
  const q = String(req.query.q || '').trim();
  const filtro = String(req.query.filter || 'all');
  const minhas = (await db.select({ id: teamChatMembers.chatId }).from(teamChatMembers).innerJoin(teamChats, eq(teamChats.id, teamChatMembers.chatId))
    .where(and(eq(teamChatMembers.userId, me.id), eq(teamChats.accountId, me.accountId!)))).map(r => r.id);
  let lista = await resumir(me.id, minhas);
  // colegas sem conversa ainda aparecem na lista (clicar começa a conversa particular)
  const comConversa = new Set(lista.filter(c => c.kind === 'direct').map(c => c.other_user_id));
  const colegas = await db.select().from(users).where(and(eq(users.accountId, me.accountId!), sql`${users.id} <> ${me.id}`, sql`COALESCE(${users.status}, 'active') = 'active'`));
  const avs = await blobsFor('User', colegas.map(c => c.id), 'avatar');
  const virtuais = colegas.filter(u => !comConversa.has(u.id)).map(u => ({ id: null, kind: 'direct', name: nome(u), other_user_id: u.id, role: roleName(u.role), avatar_url: avs.get(u.id)?.[0] ? blobUrl(avs.get(u.id)![0]) : null, contact_id: null, conversation_id: null, created_by_id: null, members: [], starred: false, muted: false, unread_count: 0, last_message: null, last_message_at: null }));

  if (q) {
    const like = `%${q}%`;
    const porTexto = minhas.length ? (await db.execute(sql`SELECT DISTINCT chat_id FROM team_chat_messages WHERE chat_id IN (${sql.join(minhas.map(i => sql`${i}`), sql`, `)}) AND text ILIKE ${like}`) as unknown as any[]).map(r => Number(r.chat_id)) : [];
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    lista = lista.filter(c => norm(c.name).includes(norm(q)) || porTexto.includes(c.id));
  }
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const diaSP = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso)) : '');
  if (filtro === 'unread') lista = lista.filter(c => c.unread_count > 0);
  else if (filtro === 'today') lista = lista.filter(c => diaSP(c.last_message?.created_at ?? null) === hoje);
  else if (filtro === 'starred') lista = lista.filter(c => c.starred);
  const de = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from)) ? String(req.query.from) : null;
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to)) ? String(req.query.to) : null;
  if (de || ate) lista = lista.filter(c => { const d = diaSP(c.last_message?.created_at ?? null); return !!d && (!de || d >= de) && (!ate || d <= ate) });

  const data = (c: any) => (c.last_message?.created_at ? +new Date(c.last_message.created_at) : c.last_message_at ? +new Date(c.last_message_at) : 0);
  lista.sort(String(req.query.sort) === 'unread' ? (a, b) => (b.unread_count > 0 ? 1 : 0) - (a.unread_count > 0 ? 1 : 0) || data(b) - data(a) : (a, b) => data(b) - data(a));
  const mostrarVirtuais = filtro === 'all' && !de && !ate;
  const filtrados = mostrarVirtuais ? virtuais.filter(v => !q || v.name.toLowerCase().includes(q.toLowerCase())) : [];
  res.json([...lista, ...filtrados]);
});

// --- abrir / criar ---------------------------------------------------------------------------------
teamChatRouter.post('/team_chats/direct', async (req, res) => {
  const me = req.user!;
  const outro = Number(req.body?.user_id);
  const [u] = await db.select().from(users).where(and(eq(users.id, outro), eq(users.accountId, me.accountId!)));
  if (!u || u.id === me.id) return res.status(422).json({ error: 'Colega inválido.' });
  const key = `${Math.min(me.id, outro)}:${Math.max(me.id, outro)}`;
  let [c] = await db.select().from(teamChats).where(and(eq(teamChats.accountId, me.accountId!), eq(teamChats.directKey, key)));
  if (!c) {
    [c] = await db.insert(teamChats).values({ accountId: me.accountId!, kind: 'direct', directKey: key, createdById: me.id }).onConflictDoNothing().returning();
    if (!c) [c] = await db.select().from(teamChats).where(and(eq(teamChats.accountId, me.accountId!), eq(teamChats.directKey, key)));
    await db.insert(teamChatMembers).values([{ chatId: c.id, userId: me.id, lastReadAt: new Date() }, { chatId: c.id, userId: outro }]).onConflictDoNothing();
  }
  res.json((await resumir(me.id, [c.id]))[0]);
});

teamChatRouter.post('/team_chats/group', async (req, res) => {
  const me = req.user!;
  const name = String(req.body?.name || '').trim();
  const ids = [...new Set((Array.isArray(req.body?.member_ids) ? req.body.member_ids : []).map(Number).filter((n: number) => n && n !== me.id))] as number[];
  if (!name) return res.status(422).json({ error: 'Dê um nome ao grupo.' });
  if (!ids.length) return res.status(422).json({ error: 'Escolha pelo menos um colega.' });
  const validos = (await db.select({ id: users.id }).from(users).where(and(eq(users.accountId, me.accountId!), inArray(users.id, ids)))).map(u => u.id);
  const [c] = await db.insert(teamChats).values({ accountId: me.accountId!, kind: 'group', name: name.slice(0, 80), createdById: me.id }).returning();
  await db.insert(teamChatMembers).values([{ chatId: c.id, userId: me.id, lastReadAt: new Date() }, ...validos.map(id => ({ chatId: c.id, userId: id }))]);
  await postar(me.accountId!, c.id, null, `${me.firstName || 'Alguém'} criou o grupo "${c.name}"`, 'system');
  res.status(201).json((await resumir(me.id, [c.id]))[0]);
});

// configurações do grupo: renomear, adicionar e tirar colegas
teamChatRouter.put('/team_chats/:id(\\d+)', async (req, res) => {
  const r = await membership(req, res, Number(req.params.id)); if (!r) return;
  if (r.c.kind !== 'group') return res.status(422).json({ error: 'Só grupos podem ser editados.' });
  const me = req.user!;
  if (req.body?.name !== undefined) {
    const n = String(req.body.name).trim(); if (!n) return res.status(422).json({ error: 'Dê um nome ao grupo.' });
    if (n !== r.c.name) { await db.update(teamChats).set({ name: n.slice(0, 80), updatedAt: new Date() }).where(eq(teamChats.id, r.c.id)); await postar(me.accountId!, r.c.id, null, `${me.firstName || 'Alguém'} mudou o nome do grupo para "${n}"`, 'system') }
  }
  const add = ((req.body?.add_ids || []) as any[]).map(Number).filter(Boolean);
  const rem = ((req.body?.remove_ids || []) as any[]).map(Number).filter(n => n && n !== me.id);
  if (add.length) {
    const val = await db.select({ id: users.id, f: users.firstName, l: users.lastName }).from(users).where(and(eq(users.accountId, me.accountId!), inArray(users.id, add)));
    if (val.length) { await db.insert(teamChatMembers).values(val.map(u => ({ chatId: r.c.id, userId: u.id }))).onConflictDoNothing(); await postar(me.accountId!, r.c.id, null, `${me.firstName || 'Alguém'} adicionou ${val.map(nome).join(', ')}`, 'system') }
  }
  if (rem.length) {
    const val = await db.select({ id: users.id, f: users.firstName, l: users.lastName }).from(users).where(inArray(users.id, rem));
    await db.delete(teamChatMembers).where(and(eq(teamChatMembers.chatId, r.c.id), inArray(teamChatMembers.userId, rem)));
    if (val.length) await postar(me.accountId!, r.c.id, null, `${me.firstName || 'Alguém'} removeu ${val.map(nome).join(', ')}`, 'system');
    broadcastInternalChat(me.accountId!, { event: 'team_chat_removed', chat_id: r.c.id, member_ids: rem });
  }
  res.json((await resumir(me.id, [r.c.id]))[0]);
});

teamChatRouter.post('/team_chats/:id(\\d+)/leave', async (req, res) => {
  const r = await membership(req, res, Number(req.params.id)); if (!r) return;
  if (r.c.kind === 'direct') return res.status(422).json({ error: 'Não dá pra sair de uma conversa particular.' });
  await db.delete(teamChatMembers).where(eq(teamChatMembers.id, r.m.id));
  await postar(req.user!.accountId!, r.c.id, null, `${req.user!.firstName || 'Alguém'} saiu`, 'system');
  res.status(204).end();
});

// destaque / silenciar (só pra mim)
teamChatRouter.patch('/team_chats/:id(\\d+)/member', async (req, res) => {
  const r = await membership(req, res, Number(req.params.id)); if (!r) return;
  const v: Record<string, boolean> = {};
  if (typeof req.body?.starred === 'boolean') v.starred = req.body.starred;
  if (typeof req.body?.muted === 'boolean') v.muted = req.body.muted;
  if (Object.keys(v).length) await db.update(teamChatMembers).set(v).where(eq(teamChatMembers.id, r.m.id));
  res.json((await resumir(req.user!.id, [r.c.id]))[0]);
});

// ações múltiplas: ler / destacar / tirar destaque / silenciar / tirar silêncio
teamChatRouter.post('/team_chats/bulk', async (req, res) => {
  const me = req.user!;
  const ids = ((req.body?.ids || []) as any[]).map(Number).filter(Boolean);
  const acao = String(req.body?.action || '');
  const set: Record<string, any> | null = acao === 'read' ? { lastReadAt: new Date() } : acao === 'star' ? { starred: true } : acao === 'unstar' ? { starred: false } : acao === 'mute' ? { muted: true } : acao === 'unmute' ? { muted: false } : null;
  if (!set || !ids.length) return res.status(422).json({ error: 'Ação inválida.' });
  await db.update(teamChatMembers).set(set).where(and(eq(teamChatMembers.userId, me.id), inArray(teamChatMembers.chatId, ids)));
  res.status(204).end();
});

// --- mensagens ---------------------------------------------------------------------------------------
teamChatRouter.get('/team_chats/:id(\\d+)/messages', async (req, res) => {
  const r = await membership(req, res, Number(req.params.id)); if (!r) return;
  const msgs = await db.select({ m: teamChatMessages, f: users.firstName, l: users.lastName }).from(teamChatMessages).leftJoin(users, eq(users.id, teamChatMessages.senderId))
    .where(eq(teamChatMessages.chatId, r.c.id)).orderBy(asc(teamChatMessages.createdAt), asc(teamChatMessages.id));
  await db.update(teamChatMembers).set({ lastReadAt: new Date() }).where(eq(teamChatMembers.id, r.m.id));
  const atts = await blobsFor('TeamChatMessage', msgs.map(x => x.m.id), 'attachment');
  res.json(await Promise.all(msgs.map(x => serializar(x.m, atts.get(x.m.id)?.[0], x.f || x.l ? `${x.f || ''} ${x.l || ''}`.trim() : null))));
});

teamChatRouter.post('/team_chats/:id(\\d+)/messages', upload.single('attachment'), async (req, res) => {
  const r = await membership(req, res, Number(req.params.id)); if (!r) return;
  const text = String(req.body?.text ?? '').trim();
  if (!text && !req.file) return res.status(422).json({ error: 'Escreva uma mensagem ou anexe um arquivo.' });
  res.status(201).json(await postar(req.user!.accountId!, r.c.id, req.user!.id, text, 'text', req.file));
});

teamChatRouter.post('/team_chats/:id(\\d+)/read', async (req, res) => {
  const r = await membership(req, res, Number(req.params.id)); if (!r) return;
  await db.update(teamChatMembers).set({ lastReadAt: new Date() }).where(eq(teamChatMembers.id, r.m.id));
  res.status(204).end();
});

// --- menção: marcar colega(s) numa conversa com cliente (o cliente não vê) ----------------------------
teamChatRouter.post('/team_chats/mention', async (req, res) => {
  const me = req.user!;
  const convId = Number(req.body?.conversation_id);
  const ids = [...new Set(((req.body?.user_ids || []) as any[]).map(Number).filter(n => n && n !== me.id))];
  const text = String(req.body?.text || '').trim();
  if (!ids.length || !text) return res.status(422).json({ error: 'Escolha o colega e escreva a mensagem.' });
  const [conv] = await db.select().from(conversations).where(and(eq(conversations.id, convId), eq(conversations.accountId, me.accountId!)));
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada.' });
  const marcados = await db.select({ id: users.id, f: users.firstName, l: users.lastName }).from(users).where(and(eq(users.accountId, me.accountId!), inArray(users.id, ids)));
  if (!marcados.length) return res.status(422).json({ error: 'Colega inválido.' });
  let [c] = await db.select().from(teamChats).where(and(eq(teamChats.kind, 'mention'), eq(teamChats.conversationId, conv.id)));
  if (!c) {
    [c] = await db.insert(teamChats).values({ accountId: me.accountId!, kind: 'mention', contactId: conv.contactId, conversationId: conv.id, createdById: me.id }).onConflictDoNothing().returning();
    if (!c) [c] = await db.select().from(teamChats).where(and(eq(teamChats.kind, 'mention'), eq(teamChats.conversationId, conv.id)));
  }
  await db.insert(teamChatMembers).values([{ chatId: c.id, userId: me.id }, ...marcados.map(u => ({ chatId: c.id, userId: u.id }))]).onConflictDoNothing();
  const arroba = marcados.map(u => `@${(u.f || '').trim() || nome(u)}`).join(' ');
  const msg = await postar(me.accountId!, c.id, me.id, `${arroba} ${text}`);
  // também fica registrado na conversa do cliente como nota interna (o cliente não vê)
  await createMessage({ accountId: me.accountId!, conversationId: conv.id, senderType: 'User', senderId: me.id, text: `${arroba} ${text}`, isPrivate: true, status: messageStatusValue('sent') });
  res.status(201).json({ chat: (await resumir(me.id, [c.id]))[0], message: msg });
});
