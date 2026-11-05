import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts, pipelineCards, pipelineStages } from '../db/schema.js';
import { entrarNoFunilDaCaixa } from './pipelines.js';

/** Funil de entrada de QUALQUER caixa que tenha "etapa de entrada" configurada (não é fixo por caixa).
 *  Cada número é de um setor e a mesma cliente pode estar em vários funis, um por setor (Bel, 05/11):
 *  entra no funil DESTA caixa quem ainda não está nele — contato novo, já cadastrado, revendedora.
 *  Antes só contato recém-criado entrava e quem já existia ficava "Sem funil" (Clara, 05/11, Gabriela #6401).
 *  Devolve true quando o card nasceu agora — quem chama pula os gatilhos de mensagem DESSA mensagem,
 *  pra ela cair na etapa de entrada (ex.: Novo Lead) e só a próxima interação mover. */
export async function entrarSeSemFunil(inbox: { entryStageId: number | null; accountId: number | null }, contactId: number): Promise<boolean> {
  if (!inbox.entryStageId || !inbox.accountId) return false;
  const [c] = await db.select({ status: contacts.status, jid: contacts.jid }).from(contacts).where(eq(contacts.id, contactId));
  if (!c || c.status === 'grupo' || c.jid?.endsWith('@g.us')) return false;
  const [st] = await db.select({ pipelineId: pipelineStages.pipelineId }).from(pipelineStages).where(eq(pipelineStages.id, inbox.entryStageId));
  if (!st) return false;
  const noFunil = async () => (await db.select({ id: pipelineCards.id }).from(pipelineCards)
    .where(and(eq(pipelineCards.contactId, contactId), eq(pipelineCards.pipelineId, st.pipelineId))).limit(1)).length > 0;
  if (await noFunil()) return false;
  await entrarNoFunilDaCaixa(inbox, contactId);
  return noFunil();
}
