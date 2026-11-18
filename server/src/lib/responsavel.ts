import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { conversations, inboxMembers, type contacts, type inboxes } from '../db/schema.js';
import { updateContact } from './contacts.js';

type Contact = typeof contacts.$inferSelect;
type Inbox = typeof inboxes.$inferSelect;
type Conversation = typeof conversations.$inferSelect;

/**
 * Regra "quem chama a cliente é a responsável pela conversa" (Bel, 18/11).
 * - Número sem carteira (Prospecção etc.): a conversa fica com quem chamou.
 * - Número com carteira (Consultoras Comerciais): se a dona da carteira atende por esse número, continua com ela;
 *   se a dona é de outro setor (ex.: prospectora que trouxe a cliente) ou não tem dona, a carteira passa pra quem chamou.
 * Devolve o contato (talvez atualizado) e o responsável que a conversa deve ter.
 */
export async function responsavelAoChamar(inbox: Inbox, contact: Contact, quemChamou: number | null | undefined): Promise<{ contact: Contact; userId: number | null }> {
  if (!quemChamou) return { contact, userId: contact.userId ?? null };
  if (!inbox.restrictByPortfolio) return { contact, userId: quemChamou };
  if (contact.userId && contact.userId !== quemChamou) {
    const [membro] = await db.select({ id: inboxMembers.id }).from(inboxMembers)
      .where(and(eq(inboxMembers.inboxId, inbox.id), eq(inboxMembers.userId, contact.userId))).limit(1);
    if (membro) return { contact, userId: contact.userId };
  }
  if (contact.userId !== quemChamou) contact = await updateContact(contact, { userId: quemChamou });
  return { contact, userId: quemChamou };
}

/** Conversa que já existia: assume quem chamou quando está sem responsável ou estava fechada (nova chamada).
 *  Conversa aberta com outra pessoa no meio do atendimento não é tomada. Na caixa com carteira o sync do contato já ajusta. */
export async function assumirConversaAoChamar(conv: Conversation, userId: number | null): Promise<Conversation> {
  if (!userId || conv.userId === userId) return conv;
  if (conv.userId && conv.status === 0) return conv;
  const [c] = await db.update(conversations).set({ userId, updatedAt: new Date() }).where(eq(conversations.id, conv.id)).returning();
  return c ?? conv;
}
