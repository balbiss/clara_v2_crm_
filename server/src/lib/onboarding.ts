import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accounts, pipelineStages, pipelines } from '../db/schema.js';
import { CUTOFF_LEGADO, QUANTIDADE_EFETIVA_SQL } from './pedidos.js';
import { entrarNoFunilDaCaixa } from './pipelines.js';

// Funil Onboarding (Bel, 28/10 — "Critérios de Revendedoras Iniciadas"): a revendedora é INICIADA no mês
// em que criou o PRIMEIRO pedido, se a carga inicial (todos os pedidos criados nesse mês: maleta,
// principal, edição limitada…) somar 20 produtos ou mais. Assim que a carga fecha os 20, o card entra em
// Onboarding › "Iniciou na loja" e as automações da etapa rodam (tarefa "Revendedora iniciou!").
// Fora: pedidos legados (antes de 2025-05-01), desconsideradas, contas internas do Jueri ("PEDIDO EM
// ESPERA …", "Conferência …") e quem já está no Onboarding.
// Só quem fez o 1º pedido nos últimos 30 dias (revendedora antiga não volta pro Onboarding).
export const MIN_PRODUTOS_CARGA_INICIAL = 20;

export async function cardsDeIniciadas() {
  let n = 0;
  for (const acc of await db.select({ id: accounts.id }).from(accounts)) {
    const [onb] = await db.select({ id: pipelines.id }).from(pipelines).where(and(eq(pipelines.accountId, acc.id), eq(pipelines.slug, 'onboarding')));
    if (!onb) continue;
    const etapas = await db.select().from(pipelineStages).where(eq(pipelineStages.pipelineId, onb.id)).orderBy(pipelineStages.position);
    const etapa = etapas.find(s => /^inici/i.test(s.name || '')) ?? etapas.find(s => s.kind === 'normal');
    if (!etapa) continue;
    const rows = await db.execute(sql`
      WITH primeiro AS (SELECT contact_id, min(data_criacao) AS d FROM pedidos GROUP BY contact_id)
      SELECT c.id FROM contacts c JOIN primeiro p ON p.contact_id = c.id
      WHERE c.account_id = ${acc.id} AND c.id_jueri IS NOT NULL AND c.desconsiderado = false
        AND coalesce(c.name, '') !~* '^\\s*(pedido em espera|confer[eê]ncia)'
        AND p.d >= ${CUTOFF_LEGADO}::date
        AND p.d >= ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 30)
        AND (SELECT COALESCE(SUM(${QUANTIDADE_EFETIVA_SQL}), 0) FROM pedidos
             WHERE pedidos.contact_id = c.id AND date_trunc('month', pedidos.data_criacao) = date_trunc('month', p.d)) >= ${MIN_PRODUTOS_CARGA_INICIAL}
        AND NOT EXISTS (SELECT 1 FROM pipeline_cards pc WHERE pc.contact_id = c.id AND pc.pipeline_id = ${onb.id})`) as unknown as { id: number }[];
    for (const r of rows) {
      try { await entrarNoFunilDaCaixa({ entryStageId: etapa.id, accountId: acc.id }, Number(r.id)); n++ }
      catch (e) { console.error('[Onboarding]', r.id, (e as Error).message) }
    }
  }
  if (n) console.log(`[Onboarding] ${n} revendedora(s) iniciada(s) entraram em "Iniciou na loja"`);
  return n;
}
