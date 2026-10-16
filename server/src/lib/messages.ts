import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { messages, conversations, contacts, users } from '../db/schema.js';
import { blobFor, blobUrl, type Blob } from './storage.js';
import { broadcastConversations } from './realtime.js';
import { notifyUser } from './push.js';
import { iso8601 } from './serialize.js';
import { avatarUrl } from './users.js';

export type Message = typeof messages.$inferSelect;
type NewMessage = typeof messages.$inferInsert;

// enum :status da v1
export const MESSAGE_STATUS = ['sent', 'delivered', 'read', 'failed'] as const;
export const messageStatusName = (n: number | null) => MESSAGE_STATUS[n ?? 0] ?? 'sent';
export const messageStatusValue = (s: typeof MESSAGE_STATUS[number]) => MESSAGE_STATUS.indexOf(s);

/** Payload do broadcast 'message_created' (Message#broadcast_to_conversation da v1). */
export async function messagePayload(m: Message, attachment?: Blob | null) {
  const att = attachment === undefined ? await blobFor('Message', m.id, 'attachment') : attachment;
  let agentName: string | null = null;
  let agentAvatarUrl: string | null = null;
  if (m.senderType === 'User' && m.senderId) {
    const [u] = await db.select({ firstName: users.firstName }).from(users).where(eq(users.id, m.senderId));
    agentName = u?.firstName ?? null;
    agentAvatarUrl = await avatarUrl(m.senderId);
  }
  return {
    id: m.id,
    senderType: m.senderType.toLowerCase() === 'user' ? 'agent' : 'contact',
    text: m.text,
    timestamp: iso8601(m.createdAt),
    status: messageStatusName(m.status),
    agentName,
    agentAvatarUrl,
    isPrivate: m.isPrivate,
    attachmentUrl: att ? blobUrl(att) : null,
    attachmentType: att ? att.contentType : null,
  };
}

export async function broadcastMessage(m: Message) {
  broadcastConversations(m.accountId, { event: 'message_created', conversation_id: m.conversationId, message: await messagePayload(m) });
}

/** Message#rebroadcast — reenvia depois que anexo/texto terminaram de ser processados. */
export async function rebroadcast(messageId: number) {
  const [m] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (m) await broadcastMessage(m);
}

/**
 * Message.create! com todos os after_create_commit da v1:
 * broadcast (exceto histórico), last_activity_at, unread_count (só msg do cliente, não privada,
 * e no histórico só se for das últimas 24h) e push pro atendente.
 * `historical` = importação do histórico da WAHA.
 */
export async function createMessage(attrs: NewMessage, opts: { historical?: boolean; skipBroadcast?: boolean } = {}): Promise<Message> {
  const [m] = await db.insert(messages).values(attrs).returning();
  const historical = !!opts.historical;

  if (historical) {
    await db.update(conversations).set({ lastActivityAt: m.createdAt })
      .where(sql`${conversations.id} = ${m.conversationId} AND (${conversations.lastActivityAt} IS NULL OR ${conversations.lastActivityAt} < ${m.createdAt})`);
  } else {
    await db.update(conversations).set({ lastActivityAt: new Date() }).where(eq(conversations.id, m.conversationId));
  }

  const recent = !historical || m.createdAt.getTime() >= Date.now() - 24 * 3600 * 1000;
  if (m.senderType === 'Contact' && !m.isPrivate && recent) {
    await db.update(conversations).set({ unreadCount: sql`coalesce(${conversations.unreadCount}, 0) + 1` }).where(eq(conversations.id, m.conversationId));
  }

  if (!historical && !opts.skipBroadcast) await broadcastMessage(m);
  if (!historical) notifyAgentOfNewMessage(m).catch(e => console.error('Message push notification error:', e.message));
  return m;
}

async function notifyAgentOfNewMessage(m: Message) {
  if (m.senderType !== 'Contact' || m.isPrivate) return;
  const [conv] = await db.select({ userId: conversations.userId, contactId: conversations.contactId }).from(conversations).where(eq(conversations.id, m.conversationId));
  if (!conv?.userId) return;
  const [c] = await db.select({ name: contacts.name, phone: contacts.phone }).from(contacts).where(eq(contacts.id, conv.contactId));
  const name = c?.name || c?.phone || 'Novo contato';
  const att = await blobFor('Message', m.id, 'attachment');
  const body = m.text || (att ? 'Enviou um anexo' : 'Nova mensagem');
  await notifyUser(conv.userId, { title: `Nova mensagem de ${name}`, body: body.length > 120 ? body.slice(0, 117) + '...' : body, url: '/conversas', tag: `conversation-${m.conversationId}` });
}
