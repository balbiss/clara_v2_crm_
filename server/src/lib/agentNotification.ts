import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts, inboxes } from '../db/schema.js';
import { messagingService } from './waha.js';
import { notifyUser } from './push.js';
import type { UserRow } from './users.js';
import type { Conversation } from './conversations.js';

// AgentNotificationService da v1: avisa o atendente por WhatsApp (pelo número dele) e por push
// quando recebe uma conversa.
export async function notifyAssignment(agent: UserRow, conversation: Conversation, assignedBy: 'manual' | 'rodizio' | 'ia' | 'sistema' = 'sistema') {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, conversation.contactId));
  if (!contact) return;
  const name = contact.name || `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || 'Novo lead';
  const byLabel = assignedBy === 'rodizio' ? 'Rodízio automático' : assignedBy === 'ia' ? 'Encaminhado pela IA' : 'Atribuição manual';

  if (agent.phone) {
    try {
      const [inbox] = await db.select().from(inboxes).where(and(eq(inboxes.accountId, conversation.accountId), eq(inboxes.provider, 'waha'))).orderBy(asc(inboxes.id)).limit(1);
      if (inbox) {
        const wa = messagingService(inbox);
        const jid = (await wa.resolveJid(agent.phone)) || agent.phone;
        await wa.sendMessage(jid, buildMessage(agent, contact, byLabel));
      }
    } catch (e) { console.error('AgentNotificationService whatsapp error:', (e as Error).message); }
  }
  await notifyUser(agent.id, { title: 'Novo lead atribuído', body: `${name} — ${byLabel}`, url: '/conversas', tag: `lead-${conversation.id}` })
    .catch(e => console.error('AgentNotificationService push error:', e.message));
}

function buildMessage(agent: UserRow, contact: typeof contacts.$inferSelect, byLabel: string) {
  const name = contact.name || `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || 'Lead';
  const crmUrl = process.env.FRONTEND_URL || 'http://localhost:5183';
  const dept = agent.department || 'corretor';
  const lines = [dept === 'corretor' ? '*Nova revendedora atribuída para você!*' : '*Nova solicitação atribuída para você!*', '', `*Nome:* ${name}`];
  if (contact.intention) lines.push(`*Interesse:* ${contact.intention}`);
  if (contact.source) lines.push(`*Origem:* ${contact.source}`);
  if (contact.temperature && dept === 'corretor') lines.push(`*Temperatura:* ${contact.temperature[0].toUpperCase()}${contact.temperature.slice(1)}`);
  lines.push(`_${byLabel}_`, '', 'Acesse o CRM para atender:', `${crmUrl}/conversas`, '', '_Atenda pelo sistema para registrar o histórico._');
  return lines.join('\n');
}
