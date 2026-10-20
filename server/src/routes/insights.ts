import { Router, type Request } from 'express';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { requireAuth, requireFullPortfolio, isFullPortfolio } from '../middleware/auth.js';
import { EVENT_LABELS } from '../lib/events.js';

// Insights no padrão do Kommo: Painel (Gerencial), Análise de vendas, Relatório consolidado,
// Relatório de atividades, Relatório de meta e Registro de atividades (lista de eventos).
// Todos aceitam ?period=today|yesterday|week|month|custom (&from=AAAA-MM-DD&to=AAAA-MM-DD) e
// ?user_id= (responsável). Datas no fuso de São Paulo; o banco guarda UTC sem fuso.
export const insightsRouter = Router();
/* eslint-disable @typescript-eslint/no-explicit-any */

const acc = (req: Request) => req.user!.accountId!;
const SP = 3 * 3600_000; // America/Sao_Paulo = UTC-3 (sem horário de verão)
const rows = async <T = any>(q: SQL) => (await db.execute(q)) as unknown as T[];

/** Intervalo [from, to) em UTC para o período pedido, contado no dia de São Paulo. */
export function periodRange(q: any, now = new Date()): { from: string; to: string; label: string } {
  const spMidnight = (d: Date) => { const s = new Date(d.getTime() - SP); s.setUTCHours(0, 0, 0, 0); return new Date(s.getTime() + SP); };
  const day = 86400_000;
  const today = spMidnight(now);
  let from: Date, to: Date;
  switch (String(q.period || 'week')) {
    case 'today': from = today; to = new Date(today.getTime() + day); break;
    case 'yesterday': from = new Date(today.getTime() - day); to = today; break;
    case 'month': { const s = new Date(today.getTime() - SP); from = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1) + SP); to = new Date(today.getTime() + day); break; }
    case 'custom': {
      const f = /^\d{4}-\d{2}-\d{2}$/.test(String(q.from)) ? new Date(`${q.from}T00:00:00Z`) : new Date(today.getTime() - 6 * day - SP);
      const t = /^\d{4}-\d{2}-\d{2}$/.test(String(q.to)) ? new Date(`${q.to}T00:00:00Z`) : new Date(today.getTime() - SP);
      from = new Date(f.getTime() + SP); to = new Date(t.getTime() + SP + day); break;
    }
    default: { // semana corrente (segunda a hoje), como o "Semana" do Kommo
      const s = new Date(today.getTime() - SP); const dow = (s.getUTCDay() + 6) % 7;
      from = new Date(today.getTime() - dow * day); to = new Date(today.getTime() + day);
    }
  }
  return { from: from.toISOString(), to: to.toISOString(), label: String(q.period || 'week') };
}
const ts = (iso: string) => sql`${iso}::timestamptz AT TIME ZONE 'UTC'`;
const userId = (q: any) => (q.user_id && /^\d+$/.test(String(q.user_id)) ? Number(q.user_id) : null);
const userNameSql = sql`TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,''))`;

// --- Painel (Gerencial) -----------------------------------------------------------------------
insightsRouter.get('/insights/painel', requireAuth, requireFullPortfolio, async (req, res) => {
  const a = acc(req); const { from, to } = periodRange(req.query); const uid = userId(req.query);
  const F = ts(from), T = ts(to);
  const convUser = uid ? sql`AND c.user_id = ${uid}` : sql``;
  const leadUser = uid ? sql`AND ct.user_id = ${uid}` : sql``;

  const [msgs] = await rows(sql`SELECT COUNT(*)::int n FROM messages m JOIN conversations c ON c.id = m.conversation_id
    WHERE m.account_id = ${a} AND m.sender_type = 'Contact' AND m.created_at >= ${F} AND m.created_at < ${T} ${convUser}`);
  const porDia = await rows(sql`SELECT to_char((m.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') d, COUNT(*)::int n
    FROM messages m JOIN conversations c ON c.id = m.conversation_id
    WHERE m.account_id = ${a} AND m.sender_type = 'Contact' AND m.created_at >= ${F} AND m.created_at < ${T} ${convUser} GROUP BY 1 ORDER BY 1`);
  const porCanal = await rows(sql`SELECT COALESCE(i.name, 'Sem canal') nome, COUNT(*)::int n FROM messages m JOIN conversations c ON c.id = m.conversation_id
    LEFT JOIN inboxes i ON i.id = c.inbox_id WHERE m.account_id = ${a} AND m.sender_type = 'Contact' AND m.created_at >= ${F} AND m.created_at < ${T} ${convUser} GROUP BY 1 ORDER BY 2 DESC`);

  // conversa aberta cuja última mensagem pública é do cliente = "não respondida"
  const ultimas = sql`SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.sender_type, m.created_at FROM messages m
    WHERE m.account_id = ${a} AND COALESCE(m.is_private, false) = false ORDER BY m.conversation_id, m.created_at DESC`;
  const [conv] = await rows(sql`SELECT COUNT(*)::int andamento,
      COUNT(*) FILTER (WHERE l.sender_type = 'Contact')::int nao_respondidas,
      COALESCE(MAX(EXTRACT(EPOCH FROM (now() AT TIME ZONE 'UTC' - l.created_at))) FILTER (WHERE l.sender_type = 'Contact'), 0)::bigint espera_max
    FROM conversations c LEFT JOIN (${ultimas}) l ON l.conversation_id = c.id WHERE c.account_id = ${a} AND c.status = 0 ${convUser}`);

  // tempo de resposta: da mensagem do cliente até a primeira resposta da equipe depois dela
  const [resp] = await rows(sql`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (r.created_at - m.created_at))), 0)::bigint media, COUNT(*)::int n
    FROM messages m JOIN conversations c ON c.id = m.conversation_id
    JOIN LATERAL (SELECT r.created_at FROM messages r WHERE r.conversation_id = m.conversation_id AND r.sender_type = 'User' AND COALESCE(r.is_private, false) = false AND r.created_at > m.created_at ORDER BY r.created_at LIMIT 1) r ON true
    WHERE m.account_id = ${a} AND m.sender_type = 'Contact' AND m.created_at >= ${F} AND m.created_at < ${T} ${convUser}
      AND NOT EXISTS (SELECT 1 FROM messages p WHERE p.conversation_id = m.conversation_id AND p.sender_type = 'Contact' AND p.created_at < m.created_at AND p.created_at > COALESCE((SELECT MAX(x.created_at) FROM messages x WHERE x.conversation_id = m.conversation_id AND x.sender_type = 'User' AND x.created_at < m.created_at), '-infinity'))`);

  const fontes = await rows(sql`SELECT COALESCE(NULLIF(ct.source, ''), 'Sem origem') fonte, COUNT(*)::int n FROM contacts ct
    WHERE ct.account_id = ${a} AND ct.created_at >= ${F} AND ct.created_at < ${T} ${leadUser} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`);

  const [leads] = await rows(sql`SELECT
      COUNT(*) FILTER (WHERE s.kind = 'won' AND pc.closed_at >= ${F} AND pc.closed_at < ${T})::int ganhos,
      COALESCE(SUM(pc.value) FILTER (WHERE s.kind = 'won' AND pc.closed_at >= ${F} AND pc.closed_at < ${T}), 0)::float ganhos_valor,
      COUNT(*) FILTER (WHERE s.kind = 'lost' AND pc.closed_at >= ${F} AND pc.closed_at < ${T})::int perdidos,
      COALESCE(SUM(pc.value) FILTER (WHERE s.kind = 'lost' AND pc.closed_at >= ${F} AND pc.closed_at < ${T}), 0)::float perdidos_valor,
      COUNT(*) FILTER (WHERE s.kind = 'normal')::int ativos,
      COALESCE(SUM(pc.value) FILTER (WHERE s.kind = 'normal'), 0)::float ativos_valor,
      COUNT(*) FILTER (WHERE s.kind = 'normal' AND NOT EXISTS (SELECT 1 FROM tarefas t WHERE t.contact_id = pc.contact_id AND t.status = 'pendente'))::int sem_tarefa
    FROM pipeline_cards pc JOIN pipeline_stages s ON s.id = pc.pipeline_stage_id JOIN pipelines p ON p.id = pc.pipeline_id JOIN contacts ct ON ct.id = pc.contact_id
    WHERE p.account_id = ${a} ${leadUser}`);

  const tarUser = uid ? sql`AND t.user_id = ${uid}` : sql``;
  const [tar] = await rows(sql`SELECT
      COUNT(*) FILTER (WHERE t.status = 'pendente')::int abertas,
      COUNT(*) FILTER (WHERE t.status = 'pendente' AND t.vencimento_em < now() AT TIME ZONE 'UTC')::int atrasadas,
      COUNT(*) FILTER (WHERE t.status = 'concluida' AND t.concluida_em >= ${F} AND t.concluida_em < ${T})::int concluidas
    FROM tarefas t WHERE t.account_id = ${a} ${tarUser}`);

  res.json({
    from, to,
    mensagens_recebidas: { total: msgs.n, por_dia: porDia, por_canal: porCanal },
    conversas: { em_andamento: conv.andamento, nao_respondidas: conv.nao_respondidas, mais_tempo_esperando_seg: Number(conv.espera_max) },
    tempo_resposta: { media_seg: Number(resp.media), respostas: resp.n },
    fontes_de_lead: fontes,
    leads, tarefas: tar,
  });
});

// --- Análise de vendas ("Ganhos e perdas") ------------------------------------------------------
insightsRouter.get('/insights/vendas', requireAuth, requireFullPortfolio, async (req, res) => {
  const a = acc(req); const { from, to } = periodRange(req.query); const uid = userId(req.query);
  const F = ts(from), T = ts(to);
  const [pip] = req.query.pipeline_id
    ? await rows(sql`SELECT id, name FROM pipelines WHERE account_id = ${a} AND id = ${Number(req.query.pipeline_id)}`)
    : await rows(sql`SELECT id, name FROM pipelines WHERE account_id = ${a} AND system = false ORDER BY position, id LIMIT 1`);
  if (!pip) return res.json({ pipeline: null, stages: [] });
  const leadUser = uid ? sql`AND ct.user_id = ${uid}` : sql``;
  const evUser = uid ? sql`AND EXISTS (SELECT 1 FROM contacts ct WHERE ct.id = e.contact_id AND ct.user_id = ${uid})` : sql``;
  const stages = await rows(sql`SELECT s.id, s.name, s.color, s.kind, s.position,
      (SELECT COUNT(*)::int FROM pipeline_cards pc JOIN contacts ct ON ct.id = pc.contact_id WHERE pc.pipeline_stage_id = s.id ${leadUser}) atual,
      (SELECT COALESCE(SUM(pc.value), 0)::float FROM pipeline_cards pc JOIN contacts ct ON ct.id = pc.contact_id WHERE pc.pipeline_stage_id = s.id ${leadUser}) atual_valor,
      (SELECT COUNT(DISTINCT e.object_id)::int FROM activity_events e WHERE e.account_id = ${a} AND e.event_type IN ('stage_changed','lead_won','lead_lost')
         AND (e.meta->>'to_stage_id')::bigint = s.id AND e.created_at >= ${F} AND e.created_at < ${T} ${evUser}) entraram,
      (SELECT COUNT(DISTINCT e.object_id)::int FROM activity_events e WHERE e.account_id = ${a} AND e.event_type IN ('stage_changed','lead_won','lead_lost')
         AND (e.meta->>'from_stage_id')::bigint = s.id AND e.created_at >= ${F} AND e.created_at < ${T} ${evUser}) sairam
    FROM pipeline_stages s WHERE s.pipeline_id = ${pip.id} ORDER BY s.position, s.id`);
  const [novos] = await rows(sql`SELECT COUNT(*)::int n, COALESCE(SUM(pc.value), 0)::float v FROM pipeline_cards pc JOIN contacts ct ON ct.id = pc.contact_id
    WHERE pc.pipeline_id = ${pip.id} AND pc.created_at >= ${F} AND pc.created_at < ${T} ${leadUser}`);
  const motivos = await rows(sql`SELECT COALESCE(NULLIF(pc.loss_reason, ''), 'Sem motivo') motivo, COUNT(*)::int n FROM pipeline_cards pc
    JOIN pipeline_stages s ON s.id = pc.pipeline_stage_id JOIN contacts ct ON ct.id = pc.contact_id
    WHERE pc.pipeline_id = ${pip.id} AND s.kind = 'lost' AND pc.closed_at >= ${F} AND pc.closed_at < ${T} ${leadUser} GROUP BY 1 ORDER BY 2 DESC`);
  // tempo médio que o lead ficou em cada etapa (saídas no período)
  const tempos = await rows(sql`SELECT (e.meta->>'from_stage_id')::bigint stage_id,
      AVG(EXTRACT(EPOCH FROM (e.created_at - COALESCE((SELECT MAX(p.created_at) FROM activity_events p WHERE p.object_id = e.object_id AND p.object_type = 'lead'
        AND p.event_type IN ('stage_changed','lead_created','lead_won','lead_lost') AND p.created_at < e.created_at), e.created_at))) / 86400)::float dias
    FROM activity_events e WHERE e.account_id = ${a} AND e.event_type IN ('stage_changed','lead_won','lead_lost')
      AND e.created_at >= ${F} AND e.created_at < ${T} AND (e.meta->>'pipeline_id')::bigint = ${pip.id} ${evUser} GROUP BY 1`);
  const tm = new Map(tempos.map(t => [Number(t.stage_id), t.dias]));
  res.json({ pipeline: pip, from, to, novos, motivos, stages: stages.map(s => ({ ...s, dias_medios: tm.get(Number(s.id)) ?? null })) });
});

// --- Relatório consolidado ----------------------------------------------------------------------
insightsRouter.get('/insights/consolidado', requireAuth, requireFullPortfolio, async (req, res) => {
  const a = acc(req); const { from, to } = periodRange(req.query); const uid = userId(req.query);
  const F = ts(from), T = ts(to);
  const g = ['day', 'week', 'month'].includes(String(req.query.group)) ? String(req.query.group) : 'day';
  const fmt = g === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
  const pipe = req.query.pipeline_id ? sql`AND pc.pipeline_id = ${Number(req.query.pipeline_id)}` : sql``;
  const leadUser = uid ? sql`AND ct.user_id = ${uid}` : sql``;
  const bucket = (col: SQL) => sql`to_char(date_trunc(${g}, (${col} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'), ${fmt})`;
  const serie = await rows(sql`SELECT k, SUM(novos)::int novos, SUM(ganhos)::int ganhos, SUM(perdidos)::int perdidos FROM (
      SELECT ${bucket(sql`pc.created_at`)} k, 1 novos, 0 ganhos, 0 perdidos FROM pipeline_cards pc JOIN pipelines p ON p.id = pc.pipeline_id JOIN contacts ct ON ct.id = pc.contact_id
        WHERE p.account_id = ${a} AND pc.created_at >= ${F} AND pc.created_at < ${T} ${pipe} ${leadUser}
      UNION ALL
      SELECT ${bucket(sql`pc.closed_at`)}, 0, (s.kind = 'won')::int, (s.kind = 'lost')::int FROM pipeline_cards pc JOIN pipelines p ON p.id = pc.pipeline_id
        JOIN pipeline_stages s ON s.id = pc.pipeline_stage_id JOIN contacts ct ON ct.id = pc.contact_id
        WHERE p.account_id = ${a} AND s.kind IN ('won','lost') AND pc.closed_at >= ${F} AND pc.closed_at < ${T} ${pipe} ${leadUser}
    ) x GROUP BY k ORDER BY k`);
  const porEtapa = await rows(sql`SELECT s.name, s.color, COUNT(*)::int n, COALESCE(SUM(pc.value), 0)::float v FROM pipeline_cards pc JOIN pipelines p ON p.id = pc.pipeline_id
    JOIN pipeline_stages s ON s.id = pc.pipeline_stage_id JOIN contacts ct ON ct.id = pc.contact_id WHERE p.account_id = ${a} AND s.kind = 'normal' ${pipe} ${leadUser}
    GROUP BY s.id, s.name, s.color, s.position ORDER BY s.position`);
  const porUsuario = await rows(sql`SELECT COALESCE(NULLIF(${userNameSql}, ''), 'Sem responsável') nome, COUNT(*)::int n, COALESCE(SUM(pc.value), 0)::float v FROM pipeline_cards pc
    JOIN pipelines p ON p.id = pc.pipeline_id JOIN pipeline_stages s ON s.id = pc.pipeline_stage_id JOIN contacts ct ON ct.id = pc.contact_id LEFT JOIN users u ON u.id = ct.user_id
    WHERE p.account_id = ${a} AND s.kind = 'normal' ${pipe} ${leadUser} GROUP BY 1 ORDER BY 2 DESC`);
  const [tar] = await rows(sql`SELECT COUNT(*) FILTER (WHERE t.created_at >= ${F} AND t.created_at < ${T})::int criadas,
      COUNT(*) FILTER (WHERE t.concluida_em >= ${F} AND t.concluida_em < ${T})::int concluidas,
      COUNT(*) FILTER (WHERE t.status = 'pendente' AND t.vencimento_em < now() AT TIME ZONE 'UTC')::int atrasadas
    FROM tarefas t WHERE t.account_id = ${a} ${uid ? sql`AND t.user_id = ${uid}` : sql``}`);
  res.json({ from, to, group: g, serie, por_etapa: porEtapa, por_usuario: porUsuario, tarefas: tar });
});

// --- Relatório de atividades (por usuário) -----------------------------------------------------
insightsRouter.get('/insights/atividades', requireAuth, requireFullPortfolio, async (req, res) => {
  const a = acc(req); const { from, to } = periodRange(req.query); const uid = userId(req.query);
  const F = ts(from), T = ts(to);
  const list = await rows(sql`SELECT u.id, ${userNameSql} nome,
      (SELECT COUNT(*)::int FROM pipeline_cards pc JOIN pipeline_stages s ON s.id = pc.pipeline_stage_id JOIN contacts ct ON ct.id = pc.contact_id WHERE ct.user_id = u.id AND s.kind = 'normal') leads_em_processo,
      (SELECT COUNT(*)::int FROM notes n WHERE n.user_id = u.id AND n.created_at >= ${F} AND n.created_at < ${T}) notas,
      (SELECT COUNT(*)::int FROM tarefas t WHERE t.user_id = u.id AND t.created_at >= ${F} AND t.created_at < ${T}) tarefas,
      (SELECT COUNT(*)::int FROM tarefas t WHERE t.concluida_por_id = u.id AND t.concluida_em >= ${F} AND t.concluida_em < ${T}) tarefas_concluidas,
      (SELECT COUNT(*)::int FROM messages m WHERE m.account_id = ${a} AND m.sender_type = 'User' AND m.sender_id = u.id AND m.created_at >= ${F} AND m.created_at < ${T}) mensagens,
      (SELECT COUNT(*)::int FROM pipeline_cards pc JOIN pipeline_stages s ON s.id = pc.pipeline_stage_id JOIN contacts ct ON ct.id = pc.contact_id WHERE ct.user_id = u.id AND s.kind = 'won' AND pc.closed_at >= ${F} AND pc.closed_at < ${T}) vendas,
      (SELECT COALESCE(SUM(pc.value), 0)::float FROM pipeline_cards pc JOIN pipeline_stages s ON s.id = pc.pipeline_stage_id JOIN contacts ct ON ct.id = pc.contact_id WHERE ct.user_id = u.id AND s.kind = 'won' AND pc.closed_at >= ${F} AND pc.closed_at < ${T}) vendas_valor
    FROM users u WHERE u.account_id = ${a} AND COALESCE(u.status, 'active') = 'active' ${uid ? sql`AND u.id = ${uid}` : sql``} ORDER BY nome`);
  res.json({ from, to, usuarios: list });
});

// --- Relatório de meta -------------------------------------------------------------------------
const mes = (v: unknown) => (/^\d{4}-\d{2}$/.test(String(v)) ? String(v) : new Date(Date.now() - SP).toISOString().slice(0, 7));
insightsRouter.get('/insights/metas', requireAuth, requireFullPortfolio, async (req, res) => {
  const a = acc(req); const m = mes(req.query.month);
  const ini = `${m}-01T03:00:00.000Z`;
  const [y, mo] = m.split('-').map(Number);
  const fim = new Date(Date.UTC(mo === 12 ? y + 1 : y, mo === 12 ? 0 : mo, 1) + SP).toISOString();
  const list = await rows(sql`SELECT u.id user_id, ${userNameSql} nome, COALESCE(g.value_goal, 0)::float meta_valor, COALESCE(g.count_goal, 0)::int meta_qtd,
      (SELECT COUNT(*)::int FROM pipeline_cards pc JOIN pipeline_stages s ON s.id = pc.pipeline_stage_id JOIN contacts ct ON ct.id = pc.contact_id
        WHERE ct.user_id = u.id AND s.kind = 'won' AND pc.closed_at >= ${ts(ini)} AND pc.closed_at < ${ts(fim)}) real_qtd,
      (SELECT COALESCE(SUM(pc.value), 0)::float FROM pipeline_cards pc JOIN pipeline_stages s ON s.id = pc.pipeline_stage_id JOIN contacts ct ON ct.id = pc.contact_id
        WHERE ct.user_id = u.id AND s.kind = 'won' AND pc.closed_at >= ${ts(ini)} AND pc.closed_at < ${ts(fim)}) real_valor
    FROM users u LEFT JOIN sales_goals g ON g.user_id = u.id AND g.month = ${m}
    WHERE u.account_id = ${a} AND COALESCE(u.status, 'active') = 'active' ORDER BY nome`);
  res.json({ month: m, usuarios: list });
});

insightsRouter.put('/insights/metas', requireAuth, requireFullPortfolio, async (req, res) => {
  const a = acc(req); const m = mes(req.body?.month);
  const metas = Array.isArray(req.body?.metas) ? req.body.metas : [];
  for (const g of metas) {
    const uid = Number(g.user_id); if (!uid) continue;
    const [ok] = await rows(sql`SELECT 1 FROM users WHERE id = ${uid} AND account_id = ${a}`);
    if (!ok) continue;
    const v = Math.max(0, Number(g.meta_valor) || 0), n = Math.max(0, Math.round(Number(g.meta_qtd) || 0));
    await db.execute(sql`INSERT INTO sales_goals (account_id, user_id, month, value_goal, count_goal) VALUES (${a}, ${uid}, ${m}, ${v}, ${n})
      ON CONFLICT (user_id, month) DO UPDATE SET value_goal = EXCLUDED.value_goal, count_goal = EXCLUDED.count_goal, updated_at = now()`);
  }
  res.status(204).end();
});

// --- Registro de atividades (lista de eventos) --------------------------------------------------
insightsRouter.get('/insights/eventos', requireAuth, async (req, res) => {
  const a = acc(req); const q = req.query;
  const conds: SQL[] = [sql`e.account_id = ${a}`];
  if (q.period) { const { from, to } = periodRange(q); conds.push(sql`e.created_at >= ${ts(from)} AND e.created_at < ${ts(to)}`); }
  // quem não tem carteira cheia só vê os eventos que ele mesmo fez
  const uid = isFullPortfolio(req.user!) ? userId(q) : req.user!.id;
  if (q.user_id === 'robo' && isFullPortfolio(req.user!)) conds.push(sql`e.user_id IS NULL`);
  else if (uid) conds.push(sql`e.user_id = ${uid}`);
  if (q.object_type) conds.push(sql`e.object_type = ${String(q.object_type)}`);
  if (q.event_type) conds.push(sql`e.event_type IN (${sql.join(String(q.event_type).split(',').map(t => sql`${t}`), sql`, `)})`);
  if (q.contact_id) conds.push(sql`e.contact_id = ${Number(q.contact_id)}`);
  if (q.q) { const like = `%${String(q.q)}%`; conds.push(sql`(e.object_name ILIKE ${like} OR e.value_before ILIKE ${like} OR e.value_after ILIKE ${like})`); }
  const per = [10, 25, 50, 100].includes(Number(q.per)) ? Number(q.per) : 50;
  const page = Math.max(1, Number(q.page) || 1);
  const where = sql.join(conds, sql` AND `);
  const list = await rows(sql`SELECT e.id, to_char(e.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') created_at, e.user_id, ${userNameSql} usuario, e.contact_id, e.object_type, e.object_id, e.object_name,
      e.event_type, e.value_before, e.value_after FROM activity_events e LEFT JOIN users u ON u.id = e.user_id
    WHERE ${where} ORDER BY e.created_at DESC, e.id DESC LIMIT ${per + 1} OFFSET ${(page - 1) * per}`);
  res.json({
    page, per, has_more: list.length > per,
    eventos: list.slice(0, per).map(e => ({
      ...e,
      usuario: e.user_id ? e.usuario : 'Robô', evento: EVENT_LABELS[e.event_type] || e.event_type,
    })),
    tipos: Object.entries(EVENT_LABELS).map(([id, label]) => ({ id, label })),
  });
});
