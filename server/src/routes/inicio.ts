import { Router } from 'express';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts, conversations, lifecycleEvents, notifications, pedidos, tarefas, users } from '../db/schema.js';
import { requireAuth, isFullPortfolio, visibleContactsWhere } from '../middleware/auth.js';
import { visibleConversationsWhere } from '../lib/conversations.js';
import { visibleTarefasWhere } from './tarefas.js';
import { ACTIVE_STATUSES } from '../lib/contacts.js';
import { hojeSP } from '../lib/pedidos.js';
import { diaSP } from '../lib/tarefas.js';

// Início ("Meu dia"): o painel da v1 no visual da v2, sempre recortado pela carteira de quem entra
// (consultora vê a dela; gerência/diretoria vê o time inteiro e ganha ranking + novidades do Jueri).
export const inicioRouter = Router();
/* eslint-disable @typescript-eslint/no-explicit-any */

const nome = (u: { f: string | null; l: string | null }) => `${u.f || ''} ${u.l || ''}`.trim();
const maisDias = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) };

inicioRouter.get('/inicio', requireAuth, async (req, res) => {
  const u = req.user!;
  const hoje = hojeSP();
  const [, fimHoje] = diaSP(hoje);
  const visC = await visibleContactsWhere(u);
  const visT = await visibleTarefasWhere(u);
  const visConv = await visibleConversationsWhere(u);
  const time = isFullPortfolio(u);

  // 1) tarefas de hoje + atrasadas
  const tRows = await db.select({ t: tarefas, nome: contacts.name, phone: contacts.phone }).from(tarefas).innerJoin(contacts, eq(contacts.id, tarefas.contactId))
    .where(and(visT, eq(tarefas.status, 'pendente'), lte(tarefas.vencimentoEm, fimHoje))).orderBy(asc(tarefas.vencimentoEm)).limit(40);
  const [tCount] = await db.select({
    atrasadas: sql<number>`COUNT(*) FILTER (WHERE ${tarefas.vencimentoEm} < ${diaSP(hoje)[0].toISOString()}::timestamptz AT TIME ZONE 'UTC')::int`,
    hoje: sql<number>`COUNT(*) FILTER (WHERE ${tarefas.vencimentoEm} >= ${diaSP(hoje)[0].toISOString()}::timestamptz AT TIME ZONE 'UTC')::int`,
  }).from(tarefas).where(and(visT, eq(tarefas.status, 'pendente'), lte(tarefas.vencimentoEm, fimHoje)));

  // 2) carteira por status da régua
  const porStatus = await db.select({ status: contacts.status, n: sql<number>`COUNT(*)::int` }).from(contacts).where(and(visC, eq(contacts.desconsiderado, false))).groupBy(contacts.status);
  const carteira: Record<string, number> = {};
  for (const r of porStatus) carteira[r.status || 'sem_status'] = r.n;
  carteira.ativas = ACTIVE_STATUSES.reduce((s, k) => s + (carteira[k] || 0), 0);

  // 3) acertos previstos nos próximos 7 dias (pedido aberto com data de acerto do Jueri)
  const acertos = await db.select({ id: contacts.id, nome: contacts.name, phone: contacts.phone, data: sql<string>`to_char(MIN(${pedidos.dataAcerto}), 'YYYY-MM-DD')`, pecas: contacts.pecasAbertasAtual })
    .from(pedidos).innerJoin(contacts, eq(contacts.id, pedidos.contactId))
    .where(and(visC, eq(pedidos.statusId, 1), sql`${pedidos.dataBaixa} IS NULL`, gte(pedidos.dataAcerto, hoje), lte(pedidos.dataAcerto, maisDias(hoje, 7))))
    .groupBy(contacts.id, contacts.name, contacts.phone, contacts.pecasAbertasAtual).orderBy(sql`MIN(${pedidos.dataAcerto})`).limit(30);

  // 4) conversas abertas cuja última mensagem é da revendedora (esperando resposta)
  // sem apelido nas tabelas: o filtro de carteira (visibleConversationsWhere) usa "conversations"/"contacts"
  const espera = await db.execute(sql`SELECT conversations.id, contacts.id AS contact_id, contacts.name, l.text, l.transcription,
      to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS desde
    FROM conversations JOIN contacts ON contacts.id = conversations.contact_id
    JOIN LATERAL (SELECT sender_type, text, transcription, created_at FROM messages m WHERE m.conversation_id = conversations.id AND COALESCE(m.is_private, false) = false ORDER BY m.created_at DESC LIMIT 1) l ON true
    WHERE conversations.status = 0 AND l.sender_type = 'Contact' AND ${visConv}
    ORDER BY l.created_at ASC LIMIT 15`) as unknown as any[];
  const [esperaN] = await db.execute(sql`SELECT COUNT(*)::int AS n FROM conversations JOIN contacts ON contacts.id = conversations.contact_id
    JOIN LATERAL (SELECT sender_type FROM messages m WHERE m.conversation_id = conversations.id AND COALESCE(m.is_private, false) = false ORDER BY m.created_at DESC LIMIT 1) l ON true
    WHERE conversations.status = 0 AND l.sender_type = 'Contact' AND ${visConv}`) as unknown as any[];

  // 5) aniversariantes dos próximos 7 dias
  const dias = Array.from({ length: 8 }, (_, i) => maisDias(hoje, i).slice(5));
  const aniversarios = await db.select({ id: contacts.id, nome: contacts.name, phone: contacts.phone, dia: sql<string>`to_char(${contacts.birthDate}, 'MM-DD')` }).from(contacts)
    .where(and(visC, sql`${contacts.birthDate} IS NOT NULL`, inArray(sql`to_char(${contacts.birthDate}, 'MM-DD')`, dias))).limit(30);
  aniversarios.sort((a, b) => dias.indexOf(a.dia) - dias.indexOf(b.dia));

  const out: any = {
    usuario: { nome: u.firstName || '', time }, hoje,
    tarefas: { lista: tRows.map(r => ({ id: r.t.id, titulo: r.t.titulo, tipo: r.t.tipo, prioridade: r.t.prioridade, vencimento: r.t.vencimentoEm ? new Date(r.t.vencimentoEm).toISOString() : null, contact_id: r.t.contactId, contato: r.nome || r.phone })), ...tCount },
    carteira, acertos, aniversarios,
    esperando: { total: esperaN?.n ?? 0, lista: espera.map(e => ({ conversation_id: Number(e.id), contact_id: Number(e.contact_id), nome: e.name, texto: (e.text && !String(e.text).startsWith('📎') ? e.text : e.transcription) || 'Mídia', desde: e.desde })) },
  };

  if (time) {
    // ranking por pessoa da equipe
    const equipe = await db.select({ id: users.id, f: users.firstName, l: users.lastName }).from(users).where(and(eq(users.accountId, u.accountId!), sql`COALESCE(${users.status}, 'active') = 'active'`, inArray(users.role, [0, 1])));
    const ativas = await db.select({ uid: contacts.userId, n: sql<number>`COUNT(*)::int` }).from(contacts).where(and(eq(contacts.accountId, u.accountId!), inArray(contacts.status, ACTIVE_STATUSES), eq(contacts.desconsiderado, false))).groupBy(contacts.userId);
    const atrasadas = await db.select({ uid: tarefas.userId, n: sql<number>`COUNT(*)::int` }).from(tarefas).where(and(eq(tarefas.accountId, u.accountId!), eq(tarefas.status, 'pendente'), sql`${tarefas.vencimentoEm} < ${diaSP(hoje)[0].toISOString()}::timestamptz AT TIME ZONE 'UTC'`)).groupBy(tarefas.userId);
    const esperaPor = await db.execute(sql`SELECT c.user_id AS uid, COUNT(*)::int AS n FROM conversations c
      JOIN LATERAL (SELECT sender_type FROM messages m WHERE m.conversation_id = c.id AND COALESCE(m.is_private, false) = false ORDER BY m.created_at DESC LIMIT 1) l ON true
      WHERE c.account_id = ${u.accountId} AND c.status = 0 AND l.sender_type = 'Contact' GROUP BY c.user_id`) as unknown as any[];
    const mapa = (rows: any[]) => new Map(rows.map(r => [Number(r.uid), Number(r.n)]));
    const mA = mapa(ativas), mT = mapa(atrasadas), mE = mapa(esperaPor);
    out.ranking = equipe.map(e => ({ id: e.id, nome: nome(e), ativas: mA.get(e.id) || 0, tarefas_atrasadas: mT.get(e.id) || 0, esperando: mE.get(e.id) || 0 }))
      .sort((a, b) => b.ativas - a.ativas);
    const [semDono] = await db.select({ n: sql<number>`COUNT(*)::int` }).from(contacts).where(and(eq(contacts.accountId, u.accountId!), inArray(contacts.status, ACTIVE_STATUSES), sql`${contacts.userId} IS NULL`));
    out.sem_responsavel = semDono.n;

    // novidades do Jueri de hoje: ativações, reativações, ciclos novos, sem maleta e cadastros novos
    const [ini] = diaSP(hoje);
    const marcos = await db.select({ tipo: lifecycleEvents.eventType, contact_id: lifecycleEvents.contactId, nome: contacts.name, em: lifecycleEvents.occurredAt }).from(lifecycleEvents)
      .innerJoin(contacts, eq(contacts.id, lifecycleEvents.contactId)).where(and(eq(lifecycleEvents.accountId, u.accountId!), gte(lifecycleEvents.occurredAt, ini))).orderBy(desc(lifecycleEvents.occurredAt)).limit(40);
    const cadastros = await db.select({ titulo: notifications.message, em: notifications.createdAt }).from(notifications)
      .where(and(eq(notifications.accountId, u.accountId!), eq(notifications.title, 'Novo cadastro no Jueri'), gte(notifications.createdAt, ini))).orderBy(desc(notifications.createdAt)).limit(20);
    out.novidades = {
      marcos: marcos.map(m => ({ tipo: m.tipo, contact_id: m.contact_id, nome: m.nome, em: new Date(m.em!).toISOString() })),
      cadastros: cadastros.map(c => ({ texto: c.titulo, em: c.em.toISOString() })),
    };
  }
  res.json(out);
});
