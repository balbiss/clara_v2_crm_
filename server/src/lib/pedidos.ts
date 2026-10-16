import { and, desc, eq, gt, inArray, notInArray, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts, pedidos, accounts } from '../db/schema.js';
import { visibleContactsWhere, type User } from '../middleware/auth.js';
import { STATUS_OVERRIDE_PERMANENTE } from './contacts.js';

// Regras do model Pedido da v1 (regras do Jueri), em SQL.
export const STATUS_ABERTO = 1, STATUS_BAIXADO = 2, STATUS_CANCELADO = 3, STATUS_PERDIDO = 4;
export const STATUS_TERMINAIS_EXCLUIDOS = [STATUS_CANCELADO, STATUS_PERDIDO];
export const CUTOFF_LEGADO = '2025-05-01';
export const QUANTIDADE_SENTINELA_LEGADO = 999;

/** "Hoje" no fuso de Brasília, como yyyy-mm-dd (Date.current da v1). */
export const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

/** Qtd. a contar pra regra de ativação: Qtd. Inicial quando disponível, senão quantidade; sentinela pros baixados legados. */
export const QUANTIDADE_EFETIVA_SQL = sql`CASE
  WHEN ${pedidos.quantidadeAntesBaixa} > 0 THEN ${pedidos.quantidadeAntesBaixa}
  WHEN ${pedidos.dataBaixa} IS NOT NULL AND ${pedidos.dataCriacao} < ${CUTOFF_LEGADO}::date AND COALESCE(${pedidos.quantidadeAntesBaixa}, 0) = 0 THEN ${QUANTIDADE_SENTINELA_LEGADO}
  ELSE ${pedidos.quantidade} END`;

/** Pedido.open_at(date): criado até D, não baixado/cancelado até D, status não terminal. */
export const pedidoOpenAt = (date: string): SQL => and(
  sql`${pedidos.dataCriacao} <= ${date}::date`,
  sql`(${pedidos.dataBaixa} IS NULL OR ${pedidos.dataBaixa} > ${date}::date)`,
  sql`(${pedidos.dataCancelamento} IS NULL OR ${pedidos.dataCancelamento} > ${date}::date)`,
  notInArray(pedidos.statusId, STATUS_TERMINAIS_EXCLUIDOS),
)!;
export const pedidoOpenNow = () => pedidoOpenAt(hojeSP());

/** Contact.not_blacklisted + sem override permanente (Resgate/Negativado/Descadastrada). */
const elegiveis = (base: SQL) => and(base, eq(contacts.desconsiderado, false), notInArray(contacts.status, STATUS_OVERRIDE_PERMANENTE))!;

type Linha = { id: number; name: string | null; phone: string | null; status: string | null; user_id: number | null; pecas_abertas: number; pedidos_abertos_count: number; data_referencia: string };

/**
 * AtivasSnapshotService (Time Travel): quem está Ativa em qualquer data D.
 * Hoje: lê as colunas pré-calculadas pelo sync (pecas_abertas_atual). Passado: reconstrói
 * via pedidos.open_at(D) agregado numa query só.
 */
export async function ativasSnapshot(u: User, data?: string): Promise<{ data_referencia: string; total: number; revendedoras: Linha[] }> {
  const [acc] = await db.select({ min: accounts.minPecasAtiva }).from(accounts).where(eq(accounts.id, u.accountId!));
  const min = acc?.min ?? 25;
  const ref = data || hojeSP();
  const base = await visibleContactsWhere(u);
  let rows: Linha[];

  if (ref === hojeSP()) {
    const list = await db.select().from(contacts).where(and(elegiveis(base), gt(contacts.pecasAbertasAtual, min))).orderBy(desc(contacts.pecasAbertasAtual));
    rows = list.map(c => ({ id: c.id, name: c.name, phone: c.phone, status: c.status, user_id: c.userId, pecas_abertas: c.pecasAbertasAtual, pedidos_abertos_count: c.pedidosAbertosCount, data_referencia: ref }));
  } else {
    const agg = await db.select({ contactId: pedidos.contactId, pecas: sql<number>`SUM(${QUANTIDADE_EFETIVA_SQL})::integer`, n: sql<number>`COUNT(*)::integer` })
      .from(pedidos).innerJoin(contacts, eq(contacts.id, pedidos.contactId))
      .where(and(elegiveis(base), pedidoOpenAt(ref)))
      .groupBy(pedidos.contactId)
      .having(sql`SUM(${QUANTIDADE_EFETIVA_SQL}) > ${min}`);
    if (!agg.length) return { data_referencia: ref, total: 0, revendedoras: [] };
    const byId = new Map(agg.map(a => [a.contactId, a]));
    const list = await db.select().from(contacts).where(inArray(contacts.id, agg.map(a => a.contactId)));
    rows = list.sort((a, b) => byId.get(b.id)!.pecas - byId.get(a.id)!.pecas)
      .map(c => ({ id: c.id, name: c.name, phone: c.phone, status: c.status, user_id: c.userId, pecas_abertas: byId.get(c.id)!.pecas, pedidos_abertos_count: byId.get(c.id)!.n, data_referencia: ref }));
  }
  return { data_referencia: ref, total: rows.length, revendedoras: rows };
}
