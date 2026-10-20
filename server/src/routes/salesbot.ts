import { Router, type Request, type Response } from 'express';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts, flowRuns, flows } from '../db/schema.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { railsJson } from '../lib/serialize.js';
import { ACTIONS, STEP_TYPES, startBot, type Definition } from '../lib/salesbot.js';

// Salesbot (Automações › Robôs) no padrão do Kommo: lista com Gatilhos, Taxa de conversão, Total
// lançado e Sessões ativas; editor salva a definição (passos) e os gatilhos. Só diretoria edita;
// qualquer usuário pode executar um robô num lead (como o "Executar robô" do chat do Kommo).
export const salesbotRouter = Router();
salesbotRouter.use('/salesbots', requireAuth);
const acc = (req: Request) => req.user!.accountId!;
/* eslint-disable @typescript-eslint/no-explicit-any */

const TRIGGER_EVENTS = ['manual', 'conversation_started', 'incoming_message', 'conversation_closed', 'no_reply'];

/** Confere a definição: tipos conhecidos e "próximo passo" apontando pra passos que existem. */
export function validateDefinition(def: Definition): string | null {
  const steps = def.steps || {};
  const ids = new Set(Object.keys(steps));
  if (def.start && !ids.has(def.start)) return 'O passo inicial não existe.';
  const refs = (s: any): (string | null | undefined)[] => [s.next, s.on_fail, s.on_other, s.no_answer?.next, s.timeout_next, s.else_next, s.fail_next, s.target,
    ...(s.buttons || []).map((b: any) => b.next), ...(s.branches || []).map((b: any) => b.next), ...(s.options || []).map((o: any) => o.next)];
  for (const [id, s] of Object.entries(steps)) {
    if (!(STEP_TYPES as readonly string[]).includes(s.type)) return `Passo ${id}: tipo "${s.type}" desconhecido.`;
    if (s.type === 'action' && !(ACTIONS as readonly string[]).includes(s.action)) return `Passo ${id}: escolha a ação.`;
    if (s.type === 'message' && !String(s.text || '').trim()) return `Passo ${id}: escreva a mensagem.`;
    if (s.type === 'round_robin' && (s.options || []).length < 2) return `Passo ${id}: o Round Robin precisa de pelo menos 2 opções.`;
    for (const r of refs(s)) if (r && !ids.has(r)) return `Passo ${id} aponta para um passo que não existe (${r}).`;
  }
  return null;
}

async function withStats(rows: (typeof flows.$inferSelect)[]) {
  if (!rows.length) return [];
  const st = await db.select({
    flowId: flowRuns.flowId,
    total: sql<number>`count(*)::int`,
    ativos: sql<number>`count(*) filter (where ${flowRuns.status} in ('running','waiting'))::int`,
    concluidos: sql<number>`count(*) filter (where ${flowRuns.status} = 'done')::int`,
  }).from(flowRuns).where(inArray(flowRuns.flowId, rows.map(r => r.id))).groupBy(flowRuns.flowId);
  const m = new Map(st.map(s => [s.flowId, s]));
  return rows.map(r => {
    const s = m.get(r.id);
    return { ...railsJson(r, ['settings']), total_launched: s?.total ?? 0, active_sessions: s?.ativos ?? 0, conversion: s?.total ? Math.round((s.concluidos / s.total) * 100) : null };
  });
}

async function own(req: Request, res: Response) {
  const [f] = await db.select().from(flows).where(and(eq(flows.id, Number(req.params.id)), eq(flows.accountId, acc(req))));
  if (!f) { res.status(404).json({ error: 'not_found' }); return null }
  return f;
}

salesbotRouter.get('/salesbots', async (req, res) => {
  res.json(await withStats(await db.select().from(flows).where(and(eq(flows.accountId, acc(req)), eq(flows.kind, 'salesbot'))).orderBy(desc(flows.id))));
});

salesbotRouter.get('/salesbots/:id(\\d+)', async (req, res) => {
  const f = await own(req, res);
  if (f) res.json((await withStats([f]))[0]);
});

function botValues(v: any) {
  const out: Record<string, unknown> = {};
  if (v.name !== undefined) out.name = String(v.name).trim();
  if (v.active !== undefined) out.active = !!v.active;
  if (v.description !== undefined) out.description = v.description || null;
  if (v.definition !== undefined) out.definition = v.definition || {};
  if (v.trigger_config !== undefined) out.triggerConfig = v.trigger_config || {};
  return out;
}

salesbotRouter.post('/salesbots', requireOwner, async (req, res) => {
  const v = botValues(req.body.salesbot ?? req.body);
  if (!v.name) return res.status(422).json({ message: 'Dê um nome pro robô.' });
  const def = (v.definition as Definition) || {};
  const err = validateDefinition(def);
  if (err) return res.status(422).json({ message: err });
  const [f] = await db.insert(flows).values({ accountId: acc(req), kind: 'salesbot', active: false, name: String(v.name), definition: def, triggerConfig: (v.triggerConfig as object) || { event: 'manual' } }).returning();
  res.status(201).json((await withStats([f]))[0]);
});

salesbotRouter.put('/salesbots/:id(\\d+)', requireOwner, async (req, res) => {
  const f = await own(req, res);
  if (!f) return;
  const v = botValues(req.body.salesbot ?? req.body);
  if (v.name === '') return res.status(422).json({ message: 'Dê um nome pro robô.' });
  if (v.definition) { const err = validateDefinition(v.definition as Definition); if (err) return res.status(422).json({ message: err }) }
  if (v.triggerConfig && !TRIGGER_EVENTS.includes(String((v.triggerConfig as any).event || 'manual'))) return res.status(422).json({ message: 'Gatilho inválido.' });
  const [u] = await db.update(flows).set({ ...v, updatedAt: new Date() }).where(eq(flows.id, f.id)).returning();
  res.json((await withStats([u]))[0]);
});

salesbotRouter.post('/salesbots/:id(\\d+)/duplicate', requireOwner, async (req, res) => {
  const f = await own(req, res);
  if (!f) return;
  const [n] = await db.insert(flows).values({ accountId: f.accountId, kind: 'salesbot', active: false, name: `${f.name} (cópia)`, definition: f.definition, triggerConfig: f.triggerConfig }).returning();
  res.status(201).json((await withStats([n]))[0]);
});

salesbotRouter.delete('/salesbots/:id(\\d+)', requireOwner, async (req, res) => {
  const f = await own(req, res);
  if (!f) return;
  await db.delete(flowRuns).where(eq(flowRuns.flowId, f.id));
  await db.delete(flows).where(eq(flows.id, f.id));
  res.status(204).end();
});

/** Executar o robô num lead agora (botão do card / teste). Funciona mesmo com o robô desligado. */
salesbotRouter.post('/salesbots/:id(\\d+)/run', async (req, res) => {
  const f = await own(req, res);
  if (!f) return;
  const [c] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, Number(req.body.contact_id)), eq(contacts.accountId, acc(req))));
  if (!c) return res.status(422).json({ message: 'Lead não encontrado.' });
  const runId = await startBot(f.id, c.id, { conversationId: req.body.conversation_id ? Number(req.body.conversation_id) : null, trigger: 'manual', force: true });
  if (!runId) return res.status(422).json({ message: 'O robô está vazio — adicione o primeiro passo.' });
  const [run] = await db.select().from(flowRuns).where(eq(flowRuns.id, runId));
  res.status(201).json(railsJson(run));
});

/** Sessões (execuções) recentes do robô, com o caminho percorrido. */
salesbotRouter.get('/salesbots/:id(\\d+)/runs', async (req, res) => {
  const f = await own(req, res);
  if (!f) return;
  const rows = await db.select({ r: flowRuns, name: contacts.name }).from(flowRuns).leftJoin(contacts, eq(contacts.id, flowRuns.contactId))
    .where(eq(flowRuns.flowId, f.id)).orderBy(desc(flowRuns.id)).limit(50);
  res.json(rows.map(x => ({ ...railsJson(x.r), contact_name: x.name })));
});

salesbotRouter.get('/salesbots/options', async (req, res) => {
  res.json(await db.select({ id: flows.id, name: flows.name, active: flows.active }).from(flows).where(and(eq(flows.accountId, acc(req)), eq(flows.kind, 'salesbot'))).orderBy(asc(flows.name)));
});
