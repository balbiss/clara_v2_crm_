import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accounts, contacts, lifecycleEvents, pedidos } from '../db/schema.js';
import { updateContact } from '../lib/contacts.js';
import { criarTarefaParaTransicao } from '../lib/tarefas.js';
import { QUANTIDADE_EFETIVA_SQL, hojeSP, pedidoOpenAt, pedidoOpenNow } from '../lib/pedidos.js';

// Régua da maleta (ReguaAutoAdvanceJob da v1, com os critérios da Bel de 26/10 — "Critérios de
// Revendedoras Ativas"): avança pelos dias do ciclo (3 → 3º dia, 10 → 10º dia, 20 → 20º dia) e o
// atraso segue a DATA DE ACERTO do Jueri da maleta (pedido aberto com mais de min_pecas_ativa peças):
// passou a data → Atrasada; virou o mês depois da data sem acerto → Suspensa por atraso. Atrasada e
// Suspensa continuam ATIVAS (só deixa de ser ativa quem cai pra ≤ 25 peças — Sem maleta/churn).
// Sem data de acerto no Jueri, vale a regra antiga (35 dias; mês virou → suspensa). Roda de hora em hora.
const AVANCAVEIS = ['revendedor_ativo', 'terceiro_dia', 'decimo_dia', 'vigesimo_dia'];
const ATRASO = ['atrasada', 'suspensa_atraso'];

export function proximoStatus(status: string, dias: number): string | null {
  if (dias >= 35) return 'atrasada';
  if (dias >= 20 && status !== 'vigesimo_dia') return 'vigesimo_dia';
  if (dias >= 10 && status === 'terceiro_dia') return 'decimo_dia';
  if (dias >= 3 && status === 'revendedor_ativo') return 'terceiro_dia';
  return null;
}

const mesSP = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(d);

/** Data de acerto (yyyy-mm-dd) da maleta aberta mais antiga; sem maleta acima do limiar, a de qualquer pedido aberto. */
async function acertoDaMaleta(contactId: number, min: number): Promise<string | null> {
  const [r] = await db.select({
    maleta: sql<string | null>`min(${pedidos.dataAcerto}) FILTER (WHERE ${QUANTIDADE_EFETIVA_SQL} > ${min})`,
    qualquer: sql<string | null>`min(${pedidos.dataAcerto})`,
  }).from(pedidos).where(and(eq(pedidos.contactId, contactId), pedidoOpenNow()));
  const d = r?.maleta ?? r?.qualquer ?? null;
  return d ? String(d).slice(0, 10) : null;
}

/** Status que a régua espera pra essa revendedora agora (null = fica como está). */
export function statusEsperado(status: string, dias: number, acerto: string | null, hoje: string, mesAtual: string, mesInicio: string): string | null {
  if (acerto) {
    if (hoje > acerto) return mesAtual > acerto.slice(0, 7) ? 'suspensa_atraso' : 'atrasada';
    if (!AVANCAVEIS.includes(status)) return null; // atrasada só volta com maleta nova (ciclo reinicia no sync)
    const p = proximoStatus(status, dias);
    return p === 'atrasada' ? (status === 'vigesimo_dia' ? null : 'vigesimo_dia') : p;
  }
  if (AVANCAVEIS.includes(status)) return proximoStatus(status, dias);
  if (status === 'atrasada' && mesAtual > mesInicio) return 'suspensa_atraso';
  return null;
}

export async function avancarRegua(agora = new Date()) {
  let mudou = 0;
  const hoje = hojeSP(), mesAtual = mesSP(agora);
  const mins = new Map((await db.select({ id: accounts.id, min: accounts.minPecasAtiva }).from(accounts)).map(a => [a.id, a.min]));
  for (const c of await db.select().from(contacts).where(inArray(contacts.status, [...AVANCAVEIS, ...ATRASO]))) {
    const inicio = c.cycleStartedAt || c.createdAt;
    const dias = Math.floor((+agora - +inicio) / 86400e3);
    const acerto = await acertoDaMaleta(c.id, mins.get(c.accountId) ?? 25);
    const novo = statusEsperado(c.status || '', dias, acerto, hoje, mesAtual, mesSP(inicio));
    if (!novo || novo === c.status) continue;
    await updateContact(c, { status: novo });
    if (novo !== 'suspensa_atraso' && !ATRASO.includes(c.status || '')) {
      await criarTarefaParaTransicao(c.id, novo).catch(e => console.error('[Régua] tarefa', c.id, (e as Error).message));
    }
    mudou++;
  }
  if (mudou) console.log(`[Régua] ${mudou} revendedora(s) mudaram de etapa`);
  await registrarChurns(agora).catch(e => console.error('[Régua] churn', (e as Error).message));
}

/**
 * Marco "Churn" (critérios da Bel): no FIM de um mês em que teve baixa, quem estava ativa (último marco
 * Iniciada/Reativação — ou, sem marco nenhum, com mais de min_pecas no começo do mês) e terminou o mês
 * com ≤ min_pecas peças abertas. Registrado com a data do último dia do mês. Idempotente.
 */
export async function registrarChurns(agora = new Date()) {
  // mês anterior (fechado), no fuso de Brasília
  const [y, m] = mesSP(agora).split('-').map(Number);
  const iniMes = new Date(Date.UTC(y, m - 2, 1)), fimMes = new Date(Date.UTC(y, m - 1, 0));
  const ini = iniMes.toISOString().slice(0, 10), fim = fimMes.toISOString().slice(0, 10);
  const vespera = new Date(Date.UTC(y, m - 2, 0)).toISOString().slice(0, 10);
  const quando = `${fim}T23:59:59-03:00`;
  // limites do mês no horário de Brasília: o churn é gravado 23:59 -03 do último dia, que em UTC já é o
  // dia 1º seguinte — comparar com a data "pura" deixava o churn de fora e ele era gravado de novo toda hora
  const desde = sql`(${ini}::date)::timestamp AT TIME ZONE 'America/Sao_Paulo'`;
  const ate = sql`(${fim}::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'`;
  let n = 0;
  for (const acc of await db.select({ id: accounts.id, min: accounts.minPecasAtiva }).from(accounts)) {
    const pecasEm = (d: string) => sql`(SELECT COALESCE(SUM(${QUANTIDADE_EFETIVA_SQL}), 0) FROM pedidos WHERE pedidos.contact_id = c.id AND ${pedidoOpenAt(d)})`;
    const rows = await db.execute(sql`
      SELECT c.id, ${pecasEm(fim)} AS pecas_fim FROM contacts c
      WHERE c.account_id = ${acc.id} AND c.id_jueri IS NOT NULL AND c.desconsiderado = false
        AND EXISTS (SELECT 1 FROM pedidos p WHERE p.contact_id = c.id AND p.data_baixa BETWEEN ${ini}::date AND ${fim}::date)
        AND ${pecasEm(fim)} <= ${acc.min}
        AND NOT EXISTS (SELECT 1 FROM lifecycle_events e WHERE e.contact_id = c.id AND e.event_type = 'churn' AND e.occurred_at >= ${desde} AND e.occurred_at < ${ate})
        AND COALESCE(
          (SELECT e.event_type IN ('iniciada', 'reativacao') FROM lifecycle_events e WHERE e.contact_id = c.id AND e.event_type IN ('iniciada', 'churn', 'reativacao') AND e.occurred_at < ${ate} ORDER BY e.occurred_at DESC LIMIT 1),
          ${pecasEm(vespera)} > ${acc.min})`) as unknown as { id: number; pecas_fim: number }[];
    for (const r of rows) {
      await db.insert(lifecycleEvents).values({ accountId: acc.id, contactId: Number(r.id), eventType: 'churn', occurredAt: new Date(quando), metadata: { pecas_abertas: Number(r.pecas_fim), mes: ini.slice(0, 7) } });
      n++;
    }
  }
  if (n) console.log(`[Régua] ${n} churn(s) registrados em ${ini.slice(0, 7)}`);
}
