import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { and, asc, desc, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { internalMessages, users } from '../db/schema.js';
import { requireAuth, roleName } from '../middleware/auth.js';
import { attach, blobsFor, blobUrl, type Blob } from '../lib/storage.js';
import { broadcastInternalChat } from '../lib/realtime.js';

// InternalMessagesController da v1: chat interno da equipe (sem relação com WhatsApp).
export const internalMessagesRouter = Router();
internalMessagesRouter.use('/internal_messages', requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
type Msg = typeof internalMessages.$inferSelect;

const serialize = (m: Msg, att?: Blob | null) => ({
  id: m.id, sender_id: m.senderId, recipient_id: m.recipientId, text: m.text || null, created_at: m.createdAt, read_at: m.readAt,
  attachment_url: att ? blobUrl(att) : null, attachment_type: att?.contentType ?? null, attachment_name: att?.filename ?? null,
});

function preview(m: Msg, att?: Blob | null) {
  if (m.text) return m.text;
  if (!att) return null;
  const t = att.contentType || '';
  return t.startsWith('image/') ? 'Foto' : t.startsWith('audio/') ? 'Áudio' : att.filename;
}

async function colleague(req: Request, res: Response, id: unknown) {
  const [u] = await db.select().from(users).where(and(eq(users.accountId, req.user!.accountId!), eq(users.id, Number(id))));
  if (!u) res.status(404).json({ error: 'not_found', message: 'Usuário não encontrado.' });
  return u ?? null;
}

internalMessagesRouter.get('/internal_messages/threads', async (req, res) => {
  const me = req.user!;
  const colleagues = await db.select().from(users).where(and(eq(users.accountId, me.accountId!), ne(users.id, me.id)));
  const mine = await db.select().from(internalMessages)
    .where(and(eq(internalMessages.accountId, me.accountId!), or(eq(internalMessages.senderId, me.id), eq(internalMessages.recipientId, me.id))))
    .orderBy(desc(internalMessages.createdAt));
  const last = new Map<number, Msg>();
  for (const m of mine) { const other = m.senderId === me.id ? m.recipientId : m.senderId; if (!last.has(other)) last.set(other, m); }
  const unread = await db.select({ senderId: internalMessages.senderId, n: sql<number>`count(*)::int` }).from(internalMessages)
    .where(and(eq(internalMessages.accountId, me.accountId!), eq(internalMessages.recipientId, me.id), isNull(internalMessages.readAt))).groupBy(internalMessages.senderId);
  const unreadMap = new Map(unread.map(u => [u.senderId, u.n]));
  const lastAtts = await blobsFor('InternalMessage', [...last.values()].map(m => m.id), 'attachment');
  const avatars = await blobsFor('User', colleagues.map(c => c.id), 'avatar');
  const threads = colleagues.map(u => {
    const l = last.get(u.id);
    const av = avatars.get(u.id)?.[0];
    return {
      id: u.id, first_name: u.firstName, last_name: u.lastName, role: roleName(u.role), avatar_url: av ? blobUrl(av) : null,
      last_message: l ? preview(l, lastAtts.get(l.id)?.[0]) : null, last_message_at: l?.createdAt ?? null, unread_count: unreadMap.get(u.id) ?? 0,
    };
  });
  threads.sort((a, b) => (b.last_message_at ? new Date(b.last_message_at).getTime() : 0) - (a.last_message_at ? new Date(a.last_message_at).getTime() : 0));
  res.json(threads);
});

internalMessagesRouter.get('/internal_messages', async (req, res) => {
  const me = req.user!;
  const other = await colleague(req, res, req.query.with);
  if (!other) return;
  const msgs = await db.select().from(internalMessages).where(or(
    and(eq(internalMessages.senderId, me.id), eq(internalMessages.recipientId, other.id)),
    and(eq(internalMessages.senderId, other.id), eq(internalMessages.recipientId, me.id)))).orderBy(asc(internalMessages.createdAt));
  await db.update(internalMessages).set({ readAt: new Date() }).where(and(eq(internalMessages.accountId, me.accountId!), eq(internalMessages.senderId, other.id), eq(internalMessages.recipientId, me.id), isNull(internalMessages.readAt)));
  const atts = await blobsFor('InternalMessage', msgs.map(m => m.id), 'attachment');
  res.json(msgs.map(m => serialize(m, atts.get(m.id)?.[0])));
});

internalMessagesRouter.post('/internal_messages', upload.single('attachment'), async (req, res) => {
  const me = req.user!;
  const recipient = await colleague(req, res, req.body.recipient_id);
  if (!recipient) return;
  const text = String(req.body.text ?? '').trim();
  if (!text && !req.file) return res.status(422).json({ error: 'Text não pode ficar em branco' });
  const [m] = await db.insert(internalMessages).values({ accountId: me.accountId!, senderId: me.id, recipientId: recipient.id, text }).returning();
  const att = req.file ? await attach('InternalMessage', m.id, 'attachment', req.file.buffer, Buffer.from(req.file.originalname, 'latin1').toString('utf8'), req.file.mimetype) : null;
  const payload = serialize(m, att);
  broadcastInternalChat(me.accountId!, { event: 'internal_message_created', message: payload });
  res.status(201).json(payload);
});
