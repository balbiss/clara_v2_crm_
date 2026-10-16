import { and, eq, lte } from 'drizzle-orm';
import { db } from '../db/client.js';
import { scheduledMessages, conversations, contacts, inboxes, activeStorageAttachments } from '../db/schema.js';
import { messagingService } from '../lib/waha.js';
import { blobFor, downloadBlob } from '../lib/storage.js';
import { createMessage, messageStatusValue, rebroadcast } from '../lib/messages.js';

// SendScheduledMessageJob da v1. Lá cada agendamento virava um job com wait_until; aqui uma
// varredura a cada 30s pega o que já venceu — sobrevive a restart sem perder envio.
let running = false;

export async function sendDueScheduledMessages() {
  if (running) return;
  running = true;
  try {
    const due = await db.select().from(scheduledMessages).where(and(eq(scheduledMessages.status, 'pending'), lte(scheduledMessages.sendAt, new Date())));
    for (const sm of due) await sendOne(sm.id);
  } finally {
    running = false;
  }
}

async function sendOne(id: number) {
  // trava otimista: só um processo pega o agendamento
  const [sm] = await db.update(scheduledMessages).set({ status: 'sending', updatedAt: new Date() })
    .where(and(eq(scheduledMessages.id, id), eq(scheduledMessages.status, 'pending'))).returning();
  if (!sm) return;
  const fail = () => db.update(scheduledMessages).set({ status: 'failed', updatedAt: new Date() }).where(eq(scheduledMessages.id, id));
  try {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, sm.conversationId));
    const [inbox] = conv?.inboxId ? await db.select().from(inboxes).where(eq(inboxes.id, conv.inboxId)) : [];
    if (!conv || !inbox) return void (await fail());
    if (inbox.provider === 'instagram') return void (await fail()); // envio proativo não permitido
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId));
    const blob = await blobFor('ScheduledMessage', sm.id, 'attachment');
    const file = blob ? { data: await downloadBlob(blob), filename: blob.filename, contentType: blob.contentType || 'application/octet-stream' } : null;
    const externalId = await messagingService(inbox).sendMessage(contact.jid || contact.phone || '', sm.text, file);
    if (!externalId) return void (await fail());

    const msg = await createMessage({
      accountId: conv.accountId, conversationId: conv.id, text: sm.text, senderType: 'User', senderId: conv.userId,
      sourceId: externalId, status: messageStatusValue('delivered'),
    }, { skipBroadcast: !!blob });
    if (blob) {
      // mesmo blob do agendamento (attach(blob) da v1)
      await db.insert(activeStorageAttachments).values({ name: 'attachment', recordType: 'Message', recordId: msg.id, blobId: blob.id });
      await rebroadcast(msg.id);
    }
    await db.update(scheduledMessages).set({ status: 'sent', updatedAt: new Date() }).where(eq(scheduledMessages.id, id));
  } catch (e) {
    console.error(`Error sending scheduled message ${id}:`, (e as Error).message);
    await fail();
  }
}
