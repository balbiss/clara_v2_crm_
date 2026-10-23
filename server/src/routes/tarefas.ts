import { Router, type Request, type Response } from 'express';
import { and, asc, between, eq, gte, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tarefas, agendamentos, contacts, users } from '../db/schema.js';
import { requireAuth, requireFullPortfolio, isFullPortfolio, isFinance, hasPermission, accessibleJueriLiderIds, type User } from '../middleware/auth.js';
import { railsJson } from '../lib/serialize.js';
import { MANUAL_TIPOS, MANUAL_TIPO_LABELS, PRIORIDADES, diaSP, isUniqueViolation } from '../lib/tarefas.js';
import { hojeSP } from '../lib/pedidos.js';
import { logEvent } from '../lib/events.js';

// TarefasController + AgendamentosController da v1.
export const tarefasRouter = Router();
const acc = (req: Request) => req.user!.accountId!;
const nf = (res: Response, message: string) => res.status(404).json({ error: 'not_found', message });

/** Consultor só vê tarefas da própria carteira (+ times); gerência/financeiro/view_all vê tudo. */
export async function visibleTarefasWhere(u: User): Promise<SQL> {
  const base = eq(tarefas.accountId, u.accountId!);
  if (isFullPortfolio(u) || isFinance(u) || hasPermission(u, 'view_all_contacts')) return base;
  const liderIds = await accessibleJueriLiderIds(u.id);
  if (!liderIds.length) return and(base, eq(tarefas.userId, u.id))!;
  const doTime = sql`EXISTS (SELECT 1 FROM contacts c WHERE c.id = ${tarefas.contactId} AND c.custom_attributes ->> 'gerente_jueri_id' IN (${sql.join(liderIds.map(l => sql`${l}`), sql`, `)}))`;
  return and(base, or(eq(tarefas.userId, u.id), doTime))!;
}

tarefasRouter.get('/tarefas', requireAuth, async (req, res) => {
  const conds: SQL[] = [await visibleTarefasWhere(req.user!)];
  const q = req.query;
  if (q.status) conds.push(eq(tarefas.status, String(q.status)));
  if (q.tipo) conds.push(eq(tarefas.tipo, String(q.tipo)));
  if (q.user_id) conds.push(eq(tarefas.userId, Number(q.user_id)));
  if (q.contact_id) conds.push(eq(tarefas.contactId, Number(q.contact_id))); // histórico do card do lead (visual Kommo)
  if (q.vencidas === 'true') conds.push(eq(tarefas.status, 'pendente'), lt(tarefas.vencimentoEm, new Date()));
  if (q.do_dia === 'true') { const [a, b] = diaSP(); conds.push(eq(tarefas.status, 'pendente'), between(tarefas.vencimentoEm, a, b)); }
  const rows = await db.select().from(tarefas).where(and(...conds))
    .orderBy(sql`CASE ${tarefas.prioridade} WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 ELSE 2 END`, asc(tarefas.vencimentoEm));
  if (!rows.length) return res.json([]);
  const cs = await db.select({ id: contacts.id, name: contacts.name, phone: contacts.phone, status: contacts.status, userId: contacts.userId, customAttributes: contacts.customAttributes }).from(contacts).where(inArray(contacts.id, [...new Set(rows.map(r => r.contactId))]));
  const uids = [...new Set(rows.map(r => r.userId).filter((x): x is number => !!x))];
  const us = uids.length ? await db.select({ id: users.id, first_name: users.firstName, last_name: users.lastName }).from(users).where(inArray(users.id, uids)) : [];
  const cm = new Map(cs.map(c => [c.id, c])), um = new Map(us.map(u => [u.id, u]));
  res.json(rows.map(t => {
    const c = cm.get(t.contactId);
    return { ...railsJson(t), contact: c ? { id: c.id, name: c.name, phone: c.phone, status: c.status, user_id: c.userId, custom_attributes: c.customAttributes } : null, user: (t.userId && um.get(t.userId)) || null };
  }));
});

async function loadTarefa(req: Request, res: Response) {
  const [t] = await db.select().from(tarefas).where(and(await visibleTarefasWhere(req.user!), eq(tarefas.id, Number(req.params.id)))).limit(1);
  if (!t) { nf(res, 'Tarefa não encontrada ou fora da sua carteira.'); return null; }
  return t;
}

const TAREFA_FIELDS: Record<string, keyof typeof tarefas.$inferInsert> = { user_id: 'userId', titulo: 'titulo', descricao: 'descricao', prioridade: 'prioridade', vencimento_em: 'vencimentoEm' };

// concluir: registra o resultado e, se vier proxima_tarefa, já cria o follow-up
tarefasRouter.patch('/tarefas/:id(\\d+)/complete', requireAuth, async (req, res) => {
  const t = await loadTarefa(req, res);
  if (!t) return;
  const [done] = await db.update(tarefas).set({ status: 'concluida', concluidaEm: new Date(), concluidaPorId: req.user!.id, resultado: req.body.resultado || null, updatedAt: new Date() }).where(eq(tarefas.id, t.id)).returning();
  const [cn] = await db.select({ n: contacts.name }).from(contacts).where(eq(contacts.id, t.contactId));
  void logEvent({ accountId: acc(req), userId: req.user!.id, contactId: t.contactId, objectType: 'tarefa', objectId: t.id, objectName: cn?.n, eventType: 'task_completed', before: t.titulo, after: req.body.resultado || null });
  let proxima = null;
  const pt = req.body.proxima_tarefa;
  if (pt) {
    const tipo = MANUAL_TIPOS.includes(pt.tipo) ? pt.tipo : 'manual_outro';
    try {
      [proxima] = await db.insert(tarefas).values({
        accountId: acc(req), contactId: t.contactId, userId: pt.user_id ? Number(pt.user_id) : t.userId, tipo,
        titulo: pt.titulo || MANUAL_TIPO_LABELS[tipo], descricao: pt.descricao ?? null,
        prioridade: PRIORIDADES.includes(pt.prioridade) ? pt.prioridade : 'normal', vencimentoEm: pt.vencimento_em ? new Date(pt.vencimento_em) : new Date(),
      }).returning();
    } catch (e) { if (!isUniqueViolation(e)) throw e; } // já existe pendente do mesmo tipo: não duplica
  }
  res.json({ ...railsJson(done), proxima_tarefa: proxima ? railsJson(proxima) : null });
});

tarefasRouter.post('/tarefas', requireAuth, requireFullPortfolio, async (req, res) => {
  const p = req.body.tarefa ?? {};
  const [c] = await db.select().from(contacts).where(and(eq(contacts.accountId, acc(req)), eq(contacts.id, Number(p.contact_id))));
  if (!c) return nf(res, 'Revendedora não encontrada.');
  if (!String(p.titulo ?? '').trim()) return res.status(422).json({ error: 'Título não pode ficar em branco' });
  if (p.prioridade && !PRIORIDADES.includes(p.prioridade)) return res.status(422).json({ error: 'Prioridade não está incluído na lista' });
  try {
    const [t] = await db.insert(tarefas).values({
      accountId: acc(req), contactId: c.id, userId: p.user_id ? Number(p.user_id) : null, tipo: MANUAL_TIPOS.includes(p.tipo) ? p.tipo : 'manual_outro',
      titulo: p.titulo, descricao: p.descricao ?? null, prioridade: p.prioridade || 'normal', vencimentoEm: p.vencimento_em ? new Date(p.vencimento_em) : new Date(),
    }).returning();
    res.status(201).json(railsJson(t));
  } catch (e) {
    if (isUniqueViolation(e)) return res.status(422).json({ error: 'ja_existe', message: 'Já existe uma tarefa desse tipo pendente para essa revendedora.' });
    throw e;
  }
});

async function updateTarefa(req: Request, res: Response) {
  const t = await loadTarefa(req, res);
  if (!t) return;
  const p = req.body.tarefa ?? {};
  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, col] of Object.entries(TAREFA_FIELDS)) if (k in p) set[col] = k === 'vencimento_em' && p[k] ? new Date(p[k]) : k === 'user_id' ? (p[k] ? Number(p[k]) : null) : p[k];
  if ('tipo' in p && TIPOS_OK(p.tipo)) set.tipo = p.tipo;
  if (set.titulo !== undefined && !String(set.titulo ?? '').trim()) return res.status(422).json({ error: 'Título não pode ficar em branco' });
  try {
    const [u] = await db.update(tarefas).set(set).where(eq(tarefas.id, t.id)).returning();
    res.json(railsJson(u));
  } catch (e) {
    if (isUniqueViolation(e)) return res.status(422).json({ error: 'Já existe uma tarefa desse tipo pendente para essa revendedora.' });
    throw e;
  }
}
const TIPOS_OK = (t: unknown) => typeof t === 'string' && (MANUAL_TIPOS.includes(t) || ['terceiro_dia', 'decimo_dia', 'vigesimo_dia', 'atrasada'].includes(t));
tarefasRouter.put('/tarefas/:id(\\d+)', requireAuth, requireFullPortfolio, updateTarefa);
tarefasRouter.patch('/tarefas/:id(\\d+)', requireAuth, requireFullPortfolio, updateTarefa);
tarefasRouter.delete('/tarefas/:id(\\d+)', requireAuth, requireFullPortfolio, async (req, res) => {
  const t = await loadTarefa(req, res);
  if (!t) return;
  await db.delete(tarefas).where(eq(tarefas.id, t.id));
  res.status(204).end();
});

// ---- agendamentos (calendário) -------------------------------------------------------------------
const AG_TIPOS = ['reuniao', 'entrega_maleta', 'acerto', 'outro'];
const visibleAg = (u: User) => (isFullPortfolio(u) ? eq(agendamentos.accountId, u.accountId!) : and(eq(agendamentos.accountId, u.accountId!), eq(agendamentos.userId, u.id))!);
const noPeriodo = (de: Date, ate: Date) => sql`${agendamentos.inicioEm} <= ${ate.toISOString()} AND COALESCE(${agendamentos.fimEm}, ${agendamentos.inicioEm}) >= ${de.toISOString()}`; // ISO: o driver não aceita Date cru em sql``

async function agJson(list: (typeof agendamentos.$inferSelect)[]) {
  if (!list.length) return [];
  const uids = [...new Set(list.map(a => a.userId))], cids = [...new Set(list.map(a => a.contactId).filter((x): x is number => !!x))];
  const us = await db.select({ id: users.id, first_name: users.firstName, last_name: users.lastName }).from(users).where(inArray(users.id, uids));
  const cs = cids.length ? await db.select({ id: contacts.id, name: contacts.name, phone: contacts.phone }).from(contacts).where(inArray(contacts.id, cids)) : [];
  const um = new Map(us.map(u => [u.id, u])), cm = new Map(cs.map(c => [c.id, c]));
  return list.map(a => ({ ...railsJson(a), user: um.get(a.userId) ?? null, contact: (a.contactId && cm.get(a.contactId)) || null }));
}

/** mês corrente em SP: primeiro e último dia */
function mesSP(): [string, string] {
  const [y, m] = hojeSP().split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${y}-${String(m).padStart(2, '0')}-01`, `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`];
}
const validDate = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) && !isNaN(Date.parse(s)) ? s.slice(0, 10) : null);

tarefasRouter.get('/agendamentos', requireAuth, async (req, res) => {
  const u = req.user!;
  const [m1, m2] = mesSP();
  const [de] = diaSP(validDate(req.query.de) ?? m1), [, ate] = diaSP(validDate(req.query.ate) ?? m2);
  const conds: SQL[] = [visibleAg(u), noPeriodo(de, ate)];
  if (req.query.user_id && isFullPortfolio(u)) conds.push(eq(agendamentos.userId, Number(req.query.user_id)));
  res.json(await agJson(await db.select().from(agendamentos).where(and(...conds)).orderBy(asc(agendamentos.inicioEm))));
});

tarefasRouter.get('/agendamentos/resumo', requireAuth, async (req, res) => {
  const u = req.user!;
  const conds: SQL[] = [visibleAg(u)];
  if (req.query.user_id && isFullPortfolio(u)) conds.push(eq(agendamentos.userId, Number(req.query.user_id)));
  const base = and(...conds)!;
  const n = async (w: SQL) => (await db.select({ n: sql<number>`count(*)::int` }).from(agendamentos).where(and(base, w)))[0].n;
  const hoje = hojeSP();
  const [h1, h2] = diaSP(hoje);
  const dow = new Date(`${hoje}T12:00:00-03:00`).getUTCDay(); // 0 = domingo (semana começa no domingo, como na v1)
  const ini = new Date(`${hoje}T12:00:00-03:00`); ini.setUTCDate(ini.getUTCDate() - dow);
  const fim = new Date(ini); fim.setUTCDate(fim.getUTCDate() + 6);
  const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
  const [s1] = diaSP(fmt(ini)), [, s2] = diaSP(fmt(fim));
  res.json({
    hoje: await n(noPeriodo(h1, h2)), semana: await n(noPeriodo(s1, s2)),
    atrasados: await n(and(lt(agendamentos.inicioEm, new Date()), gte(agendamentos.inicioEm, new Date(Date.now() - 7 * 86400000)))!),
  });
});

const AG_FIELDS: Record<string, keyof typeof agendamentos.$inferInsert> = { titulo: 'titulo', descricao: 'descricao', inicio_em: 'inicioEm', fim_em: 'fimEm', contact_id: 'contactId', valor: 'valor', tipo: 'tipo' };
async function agValues(req: Request, res: Response, partial: boolean) {
  const p = req.body.agendamento ?? {};
  const out: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(AG_FIELDS)) {
    if (!(k in p)) continue;
    const v = p[k];
    out[col] = (k === 'inicio_em' || k === 'fim_em') ? (v ? new Date(v) : null) : (k === 'contact_id' ? (v ? Number(v) : null) : (v === '' ? null : v));
  }
  if (!partial || 'titulo' in out) if (!String(out.titulo ?? '').trim()) { res.status(422).json({ error: 'Título não pode ficar em branco' }); return null; }
  if (!partial && !out.inicioEm) { res.status(422).json({ error: 'Início em não pode ficar em branco' }); return null; }
  if (out.tipo !== undefined && !AG_TIPOS.includes(String(out.tipo))) { res.status(422).json({ error: 'Tipo não está incluído na lista' }); return null; }
  if (out.contactId) {
    const [c] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, out.contactId as number), eq(contacts.accountId, acc(req))));
    if (!c) { res.status(422).json({ error: 'Contact não pertence a esta conta' }); return null; }
  }
  return { out, userId: p.user_id as unknown };
}

tarefasRouter.post('/agendamentos', requireAuth, async (req, res) => {
  const u = req.user!;
  const v = await agValues(req, res, false);
  if (!v) return;
  const fim = v.out.fimEm as Date | null | undefined, ini = v.out.inicioEm as Date;
  if (fim && fim < ini) return res.status(422).json({ error: 'Fim em não pode ser antes do início' });
  // só gerente/diretoria cria compromisso em nome de outra pessoa
  const userId = isFullPortfolio(u) ? (v.userId ? Number(v.userId) : u.id) : u.id;
  const [a] = await db.insert(agendamentos).values({ ...v.out, accountId: acc(req), userId, tipo: (v.out.tipo as string) || 'outro' } as typeof agendamentos.$inferInsert).returning();
  res.status(201).json((await agJson([a]))[0]);
});

async function updateAg(req: Request, res: Response) {
  const [a] = await db.select().from(agendamentos).where(and(visibleAg(req.user!), eq(agendamentos.id, Number(req.params.id))));
  if (!a) return nf(res, 'Agendamento não encontrado ou não é seu.');
  const v = await agValues(req, res, true);
  if (!v) return;
  const ini = (v.out.inicioEm as Date | undefined) ?? a.inicioEm, fim = 'fimEm' in v.out ? (v.out.fimEm as Date | null) : a.fimEm;
  if (fim && fim < ini) return res.status(422).json({ error: 'Fim em não pode ser antes do início' });
  const set: Record<string, unknown> = { ...v.out, updatedAt: new Date() };
  if (isFullPortfolio(req.user!) && v.userId) set.userId = Number(v.userId);
  const [u] = await db.update(agendamentos).set(set).where(eq(agendamentos.id, a.id)).returning();
  res.json((await agJson([u]))[0]);
}
tarefasRouter.put('/agendamentos/:id(\\d+)', requireAuth, updateAg);
tarefasRouter.patch('/agendamentos/:id(\\d+)', requireAuth, updateAg);
tarefasRouter.delete('/agendamentos/:id(\\d+)', requireAuth, async (req, res) => {
  const [a] = await db.select().from(agendamentos).where(and(visibleAg(req.user!), eq(agendamentos.id, Number(req.params.id))));
  if (!a) return nf(res, 'Agendamento não encontrado ou não é seu.');
  await db.delete(agendamentos).where(eq(agendamentos.id, a.id));
  res.status(204).end();
});
