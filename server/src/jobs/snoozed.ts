import { and, eq, lte } from 'drizzle-orm';
import { db } from '../db/client.js';
import { conversations, contacts } from '../db/schema.js';
import { broadcastConversations } from '../lib/realtime.js';
import { convStatusValue } from '../lib/conversations.js';

// CheckSnoozedConversationsJob da v1 (a cada minuto): adiamento venceu → reabre e avisa.
export async function reopenExpiredSnoozes() {
  const rows = await db.select({ c: conversations, name: contacts.name, phone: contacts.phone }).from(conversations)
    .leftJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(and(eq(conversations.status, convStatusValue('snoozed')!), lte(conversations.snoozedUntil, new Date())));
  for (const { c, name, phone } of rows) {
    await db.update(conversations).set({ status: 0, snoozedUntil: null, updatedAt: new Date() }).where(eq(conversations.id, c.id));
    broadcastConversations(c.accountId, { event: 'snooze_expired', conversation_id: c.id, contact_name: name || phone || 'Lead' });
    broadcastConversations(c.accountId, { event: 'conversation_updated', conversation: { id: c.id, status: 'open', snoozed_until: null } });
  }
}
