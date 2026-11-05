import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts, pipelineCards, pipelines } from '../db/schema.js';
import { ACTIVE_STATUSES, INACTIVE_STATUSES } from './contacts.js';
import { entrarNoFunilDaCaixa } from './pipelines.js';

/** Funil de entrada de QUALQUER caixa que tenha "etapa de entrada" configurada (não é fixo por caixa).
 *  Antes só entrava contato recém-criado; quem já tinha cadastro (Jueri/v1/outra caixa) ficava "Sem funil"
 *  pra sempre e os gatilhos (respondeu / equipe mandou → Em atendimento) não tinham card pra mover
 *  (Clara, 05/11 — Gabriela #6401 na Prospecção).
 *  Entra quem: não está em nenhum funil comum (Consignado é de sistema) e não é revendedora (Jueri/régua).
 *  Devolve true quando o card nasceu agora — quem chama pula os gatilhos de mensagem DESSA mensagem,
 *  pra ela cair em Novo Lead e só a próxima interação mover. */
export async function entrarSeSemFunil(inbox: { entryStageId: number | null; accountId: number | null }, contactId: number): Promise<boolean> {
  if (!inbox.entryStageId || !inbox.accountId) return false;
  const [c] = await db.select({ idJueri: contacts.idJueri, status: contacts.status, jid: contacts.jid }).from(contacts).where(eq(contacts.id, contactId));
  if (!c || c.status === 'grupo' || c.jid?.endsWith('@g.us')) return false;
  if (c.idJueri || ACTIVE_STATUSES.includes(c.status || '') || INACTIVE_STATUSES.includes(c.status || '')) return false;
  const temFunil = async () => (await db.select({ id: pipelineCards.id }).from(pipelineCards)
    .innerJoin(pipelines, eq(pipelines.id, pipelineCards.pipelineId))
    .where(and(eq(pipelineCards.contactId, contactId), sql`${pipelines.system} = false`)).limit(1)).length > 0;
  if (await temFunil()) return false;
  await entrarNoFunilDaCaixa(inbox, contactId);
  return temFunil();
}
