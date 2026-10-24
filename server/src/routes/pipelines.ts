import { Router, type Request, type Response } from 'express';
import { and, asc, eq, inArray, max, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts, contactTags, flows, lossReasons, pipelineCards, pipelineStages, pipelineTriggers, pipelines, tags, tarefas, users } from '../db/schema.js';
import { requireAuth, requireOwner, isFullPortfolio, hasPermission, type User } from '../middleware/auth.js';
import { railsJson } from '../lib/serialize.js';
import { createContact } from '../lib/contacts.js';
import { execute, moveCard, runEnterTriggers, validateTrigger } from '../lib/pipelines.js';
import { logEvent } from '../lib/events.js';
import { missingRequired } from '../lib/customFields.js';

// PipelinesController + PipelineStages/Triggers/Cards da v1, com o que o Kommo tem a mais
// (ganho/perdido + motivo, valor do lead, gatilhos por agenda/data/condição — lib/pipelines.ts).
// Ver/mover cards: qualquer agente logado. Criar/editar funil, etapa e gatilho: só diretoria.
export const pipelinesRouter = Router();
pipelinesRouter.use(['/pipelines', '/pipeline_stages', '/pipeline_triggers', '/pipeline_cards', '/loss_reasons', '/flows_options'], requireAuth);
const acc = (req: Request) => req.user!.accountId!;
const nf = (res: Response) => res.status(404).json({ error: 'not_found' });
/* eslint-disable @typescript-eslint/no-explicit-any */

const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'funil';

async function ownPipeline(req: Request, id: number) {
  const [p] = await db.select().from(pipelines).where(and(eq(pipelines.id, id), eq(pipelines.accountId, acc(req))));
  return p ?? null;
}
async function ownStage(req: Request, id: number) {
  const [r] = await db.select({ s: pipelineStages }).from(pipelineStages).innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId))
    .where(and(eq(pipelineStages.id, id), eq(pipelines.accountId, acc(req))));
  return r?.s ?? null;
}
async function ownCard(req: Request, id: number) {
  const [r] = await db.select({ c: pipelineCards }).from(pipelineCards).innerJoin(pipelines, eq(pipelines.id, pipelineCards.pipelineId))
    .where(and(eq(pipelineCards.id, id), eq(pipelines.accountId, acc(req))));
  return r?.c ?? null;
}

const triggerJson = (t: typeof pipelineTriggers.$inferSelect) => railsJson(t);

// --- funis ---------------------------------------------------------------------------------------

pipelinesRouter.get('/pipelines', async (req, res) => {
  const ps = await db.select().from(pipelines).where(eq(pipelines.accountId, acc(req))).orderBy(asc(pipelines.position), asc(pipelines.id));
  if (!ps.length) return res.json([]);
  const ss = await db.select().from(pipelineStages).where(inArray(pipelineStages.pipelineId, ps.map(p => p.id))).orderBy(asc(pipelineStages.position), asc(pipelineStages.id));
  const ts = ss.length ? await db.select().from(pipelineTriggers).where(inArray(pipelineTriggers.pipelineStageId, ss.map(s => s.id))).orderBy(asc(pipelineTriggers.position), asc(pipelineTriggers.id)) : [];
  const counts = await db.select({ stageId: pipelineCards.pipelineStageId, n: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${pipelineCards.value}),0)` })
    .from(pipelineCards).where(inArray(pipelineCards.pipelineId, ps.map(p => p.id))).groupBy(pipelineCards.pipelineStageId);
  const cm = new Map(counts.map(c => [c.stageId, c]));
  res.json(ps.map(p => ({
    ...railsJson(p),
    pipeline_stages: ss.filter(s => s.pipelineId === p.id).map(s => ({
      ...railsJson(s), cards_count: cm.get(s.id)?.n ?? 0, cards_total: Number(cm.get(s.id)?.total ?? 0),
      pipeline_triggers: ts.filter(t => t.pipelineStageId === s.id).map(triggerJson),
    })),
  })));
});

pipelinesRouter.post('/pipelines', requireOwner, async (req, res) => {
  const name = String(req.body.pipeline?.name ?? req.body.name ?? '').trim();
  if (!name) return res.status(422).json({ message: 'Dê um nome pro funil.' });
  const existing = (await db.select({ slug: pipelines.slug }).from(pipelines).where(eq(pipelines.accountId, acc(req)))).map(r => r.slug);
  let slug = slugify(name);
  for (let n = 2; existing.includes(slug); n++) slug = `${slugify(name)}-${n}`;
  const [{ m }] = await db.select({ m: max(pipelines.position) }).from(pipelines).where(eq(pipelines.accountId, acc(req)));
  const [p] = await db.insert(pipelines).values({ accountId: acc(req), name, slug, position: (m ?? 0) + 1 }).returning();
  await db.insert(pipelineStages).values([
    { pipelineId: p.id, name: 'Novo lead', position: 0, color: '#99ccff' },
    { pipelineId: p.id, name: 'Venda ganha', position: 1000, color: '#ccff66', kind: 'won' },
    { pipelineId: p.id, name: 'Venda perdida', position: 1001, color: '#d5d8db', kind: 'lost' },
  ]);
  res.status(201).json(railsJson(p));
});

pipelinesRouter.put('/pipelines/:id', requireOwner, async (req, res) => {
  const p = await ownPipeline(req, Number(req.params.id));
  if (!p) return nf(res);
  const v = req.body.pipeline ?? req.body;
  const [u] = await db.update(pipelines).set({ ...(v.name ? { name: String(v.name).trim() } : {}), ...(v.position !== undefined ? { position: Number(v.position) } : {}), updatedAt: new Date() }).where(eq(pipelines.id, p.id)).returning();
  res.json(railsJson(u));
});

pipelinesRouter.delete('/pipelines/:id', requireOwner, async (req, res) => {
  const p = await ownPipeline(req, Number(req.params.id));
  if (!p) return nf(res);
  if (p.system) return res.status(403).json({ error: 'Este funil não pode ser removido.' });
  const stageIds = (await db.select({ id: pipelineStages.id }).from(pipelineStages).where(eq(pipelineStages.pipelineId, p.id))).map(s => s.id);
  await db.delete(pipelineCards).where(eq(pipelineCards.pipelineId, p.id));
  if (stageIds.length) await db.delete(pipelineTriggers).where(inArray(pipelineTriggers.pipelineStageId, stageIds));
  await db.delete(pipelineStages).where(eq(pipelineStages.pipelineId, p.id));
  await db.delete(pipelines).where(eq(pipelines.id, p.id));
  res.status(204).end();
});

// --- etapas --------------------------------------------------------------------------------------

const stageValues = (v: any) => ({
  ...(v.name !== undefined ? { name: String(v.name).trim() } : {}),
  ...(v.color ? { color: String(v.color) } : {}),
  ...(v.position !== undefined ? { position: Number(v.position) } : {}),
  ...(v.description !== undefined ? { description: v.description ? String(v.description) : null } : {}),
});

pipelinesRouter.post('/pipelines/:id/pipeline_stages', requireOwner, async (req, res) => {
  const p = await ownPipeline(req, Number(req.params.id));
  if (!p) return nf(res);
  if (p.system) return res.status(422).json({ message: 'As etapas do Consignado são os status da revendedora — não dá pra criar ou apagar.' });
  const v = req.body.pipeline_stage ?? req.body;
  if (!String(v.name || '').trim()) return res.status(422).json({ message: 'Dê um nome pra etapa.' });
  const [{ m }] = await db.select({ m: sql<number>`max(${pipelineStages.position}) filter (where ${pipelineStages.kind} = 'normal')` }).from(pipelineStages).where(eq(pipelineStages.pipelineId, p.id));
  const [s] = await db.insert(pipelineStages).values({ pipelineId: p.id, color: '#99ccff', ...stageValues(v), name: String(v.name).trim(), position: v.position ?? (m ?? -1) + 1 }).returning();
  res.status(201).json(railsJson(s));
});

pipelinesRouter.put('/pipeline_stages/:id', requireOwner, async (req, res) => {
  const s = await ownStage(req, Number(req.params.id));
  if (!s) return nf(res);
  const [u] = await db.update(pipelineStages).set({ ...stageValues(req.body.pipeline_stage ?? req.body), updatedAt: new Date() }).where(eq(pipelineStages.id, s.id)).returning();
  res.json(railsJson(u));
});

/** Reordena as etapas normais de um funil (arrastar no Automatize). */
pipelinesRouter.put('/pipelines/:id/stage_order', requireOwner, async (req, res) => {
  const p = await ownPipeline(req, Number(req.params.id));
  if (!p) return nf(res);
  const ids: number[] = (req.body.stage_ids || []).map(Number);
  for (const [i, id] of ids.entries()) await db.update(pipelineStages).set({ position: i }).where(and(eq(pipelineStages.id, id), eq(pipelineStages.pipelineId, p.id), eq(pipelineStages.kind, 'normal')));
  res.json({ ok: true });
});

// Não apaga a última etapa nem as de ganho/perda; os cards da etapa apagada vão pra outra (igual v1).
pipelinesRouter.delete('/pipeline_stages/:id', requireOwner, async (req, res) => {
  const s = await ownStage(req, Number(req.params.id));
  if (!s) return nf(res);
  if (s.kind !== 'normal') return res.status(422).json({ error: 'As etapas de venda ganha/perdida não podem ser apagadas.' });
  if (s.statusKey) return res.status(422).json({ error: 'As etapas do Consignado são os status da revendedora — não dá pra apagar.' });
  const [fallback] = await db.select().from(pipelineStages).where(and(eq(pipelineStages.pipelineId, s.pipelineId), eq(pipelineStages.kind, 'normal'), sql`${pipelineStages.id} <> ${s.id}`)).orderBy(asc(pipelineStages.position)).limit(1);
  if (!fallback) return res.status(422).json({ error: 'O funil precisa de pelo menos uma etapa.' });
  await db.update(pipelineCards).set({ pipelineStageId: fallback.id, stageEnteredAt: new Date() }).where(eq(pipelineCards.pipelineStageId, s.id));
  await db.delete(pipelineTriggers).where(eq(pipelineTriggers.pipelineStageId, s.id));
  await db.delete(pipelineStages).where(eq(pipelineStages.id, s.id));
  res.status(204).end();
});

// --- gatilhos (Automatize) -----------------------------------------------------------------------

const triggerValues = (v: any) => ({
  ...(v.action_type !== undefined ? { actionType: String(v.action_type) } : {}),
  ...(v.event !== undefined ? { event: String(v.event) } : {}),
  ...(v.active !== undefined ? { active: !!v.active } : {}),
  ...(v.delay_minutes !== undefined ? { delayMinutes: Math.max(0, Number(v.delay_minutes) || 0) } : {}),
  ...(v.config !== undefined ? { config: v.config || {} } : {}),
  ...(v.conditions !== undefined ? { conditions: Array.isArray(v.conditions) ? v.conditions : [] } : {}),
  ...(v.schedule !== undefined ? { schedule: v.schedule || {} } : {}),
});

pipelinesRouter.post('/pipeline_stages/:id/pipeline_triggers', requireOwner, async (req, res) => {
  const s = await ownStage(req, Number(req.params.id));
  if (!s) return nf(res);
  const v = triggerValues(req.body.pipeline_trigger ?? req.body);
  const err = validateTrigger(v);
  if (err) return res.status(422).json({ message: err });
  const [{ m }] = await db.select({ m: max(pipelineTriggers.position) }).from(pipelineTriggers).where(eq(pipelineTriggers.pipelineStageId, s.id));
  const [t] = await db.insert(pipelineTriggers).values({ pipelineStageId: s.id, actionType: v.actionType!, ...v, position: (m ?? -1) + 1 }).returning();
  // Kommo: "Aplicar a todos os leads que já estão nesta etapa"
  if ((req.body.pipeline_trigger ?? req.body).apply_existing && t.event === 'enter') {
    for (const card of await db.select().from(pipelineCards).where(eq(pipelineCards.pipelineStageId, s.id))) await execute(t, card, 0);
  }
  res.status(201).json(triggerJson(t));
});

async function ownTrigger(req: Request) {
  const [r] = await db.select({ t: pipelineTriggers }).from(pipelineTriggers)
    .innerJoin(pipelineStages, eq(pipelineStages.id, pipelineTriggers.pipelineStageId)).innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId))
    .where(and(eq(pipelineTriggers.id, Number(req.params.id)), eq(pipelines.accountId, acc(req))));
  return r?.t ?? null;
}

pipelinesRouter.put('/pipeline_triggers/:id', requireOwner, async (req, res) => {
  const t = await ownTrigger(req);
  if (!t) return nf(res);
  const v = triggerValues(req.body.pipeline_trigger ?? req.body);
  const err = validateTrigger({ actionType: t.actionType, event: t.event, config: t.config, schedule: t.schedule, ...v });
  if (err) return res.status(422).json({ message: err });
  const [u] = await db.update(pipelineTriggers).set({ ...v, updatedAt: new Date() }).where(eq(pipelineTriggers.id, t.id)).returning();
  res.json(triggerJson(u));
});

pipelinesRouter.delete('/pipeline_triggers/:id', requireOwner, async (req, res) => {
  const t = await ownTrigger(req);
  if (!t) return nf(res);
  await db.delete(pipelineTriggers).where(eq(pipelineTriggers.id, t.id));
  res.status(204).end();
});

// --- cards (leads) -------------------------------------------------------------------------------

/** Consultor vê só os leads da própria carteira (Kommo: "ver só os seus"); gerência/diretoria/view_all vê tudo. */
const seesAll = (u: User) => isFullPortfolio(u) || hasPermission(u, 'view_all_contacts');

async function serializeCards(rows: (typeof pipelineCards.$inferSelect)[]) {
  if (!rows.length) return [];
  const cids = [...new Set(rows.map(r => r.contactId))];
  const cs = await db.select({ id: contacts.id, name: contacts.name, phone: contacts.phone, avatarUrl: contacts.avatarUrl, userId: contacts.userId, customAttributes: contacts.customAttributes })
    .from(contacts).where(inArray(contacts.id, cids));
  const tg = await db.select({ contactId: contactTags.contactId, id: tags.id, name: tags.name, color: tags.color }).from(contactTags).innerJoin(tags, eq(tags.id, contactTags.tagId)).where(inArray(contactTags.contactId, cids));
  const uids = [...new Set(cs.map(c => c.userId).filter((x): x is number => !!x))];
  const us = uids.length ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(inArray(users.id, uids)) : [];
  // tarefa pendente mais próxima de cada contato (ponto laranja / vermelho com "Xd" de atraso no card)
  const tk = await db.select({ contactId: tarefas.contactId, venc: sql<Date>`min(${tarefas.vencimentoEm})` }).from(tarefas)
    .where(and(inArray(tarefas.contactId, cids), eq(tarefas.status, 'pendente'))).groupBy(tarefas.contactId);
  const cm = new Map(cs.map(c => [c.id, c])), um = new Map(us.map(u => [u.id, u])), tm = new Map(tk.map(t => [t.contactId, t.venc]));
  return rows.map(r => {
    const c = cm.get(r.contactId);
    const u = c?.userId ? um.get(c.userId) : null;
    const venc = tm.get(r.contactId);
    return {
      ...railsJson(r), value: Number(r.value),
      next_task_at: venc ? new Date(venc).toISOString() : null,
      contact: c ? { id: c.id, name: c.name, phone: c.phone, avatar_url: c.avatarUrl, user_id: c.userId, custom_attributes: c.customAttributes, tags: tg.filter(t => t.contactId === c.id).map(({ contactId: _, ...t }) => t) } : null,
      user: u ? { id: u.id, name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() } : null,
    };
  });
}

async function cardsWhere(req: Request, extra: SQL[]) {
  const conds = [eq(pipelines.accountId, acc(req)), ...extra];
  if (!seesAll(req.user!)) conds.push(eq(contacts.userId, req.user!.id));
  if (req.query.q) {
    const q = `%${String(req.query.q).replace(/[%_]/g, '')}%`;
    conds.push(sql`(${contacts.name} ILIKE ${q} OR ${contacts.phone} ILIKE ${q})`);
  }
  return db.select({ c: pipelineCards }).from(pipelineCards)
    .innerJoin(pipelines, eq(pipelines.id, pipelineCards.pipelineId)).innerJoin(contacts, eq(contacts.id, pipelineCards.contactId))
    .where(and(...conds)).orderBy(sql`${pipelineCards.stageEnteredAt} desc`, asc(pipelineCards.id));
}

pipelinesRouter.get('/pipelines/:id/pipeline_cards', async (req, res) => {
  const p = await ownPipeline(req, Number(req.params.id));
  if (!p) return nf(res);
  res.json(await serializeCards((await cardsWhere(req, [eq(pipelineCards.pipelineId, p.id)])).map(r => r.c)));
});
pipelinesRouter.get('/pipeline_cards', async (req, res) => {
  const extra: SQL[] = req.query.contact_id ? [eq(pipelineCards.contactId, Number(req.query.contact_id))] : [];
  res.json(await serializeCards((await cardsWhere(req, extra)).map(r => r.c)));
});

/** Novo lead: contato existente (contact_id) ou contato novo (name + phone), já na etapa escolhida. */
pipelinesRouter.post('/pipelines/:id/pipeline_cards', async (req, res) => {
  const p = await ownPipeline(req, Number(req.params.id));
  if (!p) return nf(res);
  if (p.system) return res.status(422).json({ message: 'No Consignado a revendedora entra pelo status (régua), não por lead novo.' });
  const v = req.body.pipeline_card ?? req.body;
  const stages = await db.select().from(pipelineStages).where(eq(pipelineStages.pipelineId, p.id)).orderBy(asc(pipelineStages.position));
  const stage = stages.find(s => s.id === Number(v.pipeline_stage_id)) ?? stages.find(s => s.kind === 'normal');
  if (!stage) return res.status(422).json({ message: 'Esse funil não tem etapas.' });
  let contactId = Number(v.contact_id) || null;
  if (!contactId) {
    const name = String(v.name || '').trim();
    if (!name && !v.phone) return res.status(422).json({ message: 'Informe o nome ou o telefone do lead.' });
    const c = await createContact({ accountId: acc(req), name: name || null, phone: v.phone ? String(v.phone) : null, userId: req.user!.id } as any);
    contactId = c.id;
  } else {
    const [c] = await db.select({ id: contacts.id, userId: contacts.userId }).from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.accountId, acc(req))));
    if (!c || (!seesAll(req.user!) && c.userId !== req.user!.id)) return res.status(422).json({ message: 'Contato não encontrado.' });
  }
  const [dup] = await db.select({ id: pipelineCards.id }).from(pipelineCards).where(and(eq(pipelineCards.pipelineId, p.id), eq(pipelineCards.contactId, contactId)));
  if (dup) return res.status(422).json({ message: 'Esse contato já está neste funil.' });
  const [card] = await db.insert(pipelineCards).values({ pipelineId: p.id, pipelineStageId: stage.id, contactId, value: String(Number(v.value) || 0) }).returning();
  const [cn] = await db.select({ n: contacts.name, p: contacts.phone }).from(contacts).where(eq(contacts.id, contactId));
  void logEvent({ accountId: acc(req), userId: req.user!.id, contactId, objectType: 'lead', objectId: card.id, objectName: cn?.n || cn?.p, eventType: 'lead_created', after: `${p.name} › ${stage.name}` });
  await runEnterTriggers(card);
  res.status(201).json((await serializeCards([card]))[0]);
});

/** Card que o usuário pode mexer: consultor só nos leads da própria carteira (igual à lista). */
async function visibleCard(req: Request, id: number) {
  const card = await ownCard(req, id);
  if (!card || seesAll(req.user!)) return card;
  const [c] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, card.contactId), eq(contacts.userId, req.user!.id)));
  return c ? card : null;
}

pipelinesRouter.put('/pipeline_cards/:id', async (req, res) => {
  const card = await visibleCard(req, Number(req.params.id));
  if (!card) return nf(res);
  const v = req.body.pipeline_card ?? req.body;
  let cur = card;
  if (v.value !== undefined || v.loss_reason !== undefined) {
    [cur] = await db.update(pipelineCards).set({
      ...(v.value !== undefined ? { value: String(Number(v.value) || 0) } : {}),
      ...(v.loss_reason !== undefined ? { lossReason: v.loss_reason ? String(v.loss_reason) : null } : {}),
      updatedAt: new Date(),
    }).where(eq(pipelineCards.id, card.id)).returning();
  }
  const to = Number(v.pipeline_stage_id);
  if (to && to !== cur.pipelineStageId) {
    const stage = await ownStage(req, to);
    if (!stage) return res.status(422).json({ message: 'Etapa inválida.' });
    const [ct] = await db.select({ a: contacts.customAttributes }).from(contacts).where(eq(contacts.id, cur.contactId));
    const faltam = await missingRequired(acc(req), ct?.a as Record<string, unknown>, 'stage:' + stage.id);
    if (faltam.length) return res.status(422).json({ error: 'required_fields', message: 'Preencha antes de mudar de etapa: ' + faltam.join(', '), fields: faltam });
    if (stage.pipelineId !== cur.pipelineId) {
      const [dup] = await db.select({ id: pipelineCards.id }).from(pipelineCards).where(and(eq(pipelineCards.pipelineId, stage.pipelineId), eq(pipelineCards.contactId, cur.contactId)));
      if (dup) return res.status(422).json({ message: 'Esse contato já está no funil de destino.' });
    }
    cur = await moveCard(cur, stage.id, 0, stage.pipelineId, req.user!.id);
  }
  const [fresh] = await db.select().from(pipelineCards).where(eq(pipelineCards.id, cur.id));
  res.json(fresh ? (await serializeCards([fresh]))[0] : null);
});

// Kommo: consultor não exclui lead (perfil sem "Excluir") — só gerência/diretoria
pipelinesRouter.delete('/pipeline_cards/:id', async (req, res) => {
  if (!isFullPortfolio(req.user!)) return res.status(403).json({ error: 'forbidden', message: 'Só gerência e diretoria podem excluir leads.' });
  const card = await ownCard(req, Number(req.params.id));
  if (!card) return nf(res);
  await db.delete(pipelineCards).where(eq(pipelineCards.id, card.id));
  const [cn] = await db.select({ n: contacts.name }).from(contacts).where(eq(contacts.id, card.contactId));
  void logEvent({ accountId: acc(req), userId: req.user!.id, contactId: card.contactId, objectType: 'lead', objectId: card.id, objectName: cn?.n, eventType: 'lead_deleted' });
  res.status(204).end();
});

// --- motivos de perda e opções pro formulário de gatilho ------------------------------------------

pipelinesRouter.get('/loss_reasons', async (req, res) => {
  res.json((await db.select().from(lossReasons).where(eq(lossReasons.accountId, acc(req))).orderBy(asc(lossReasons.position), asc(lossReasons.id))).map(r => railsJson(r)));
});
pipelinesRouter.post('/loss_reasons', requireOwner, async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(422).json({ message: 'Dê um nome pro motivo.' });
  const [{ m }] = await db.select({ m: max(lossReasons.position) }).from(lossReasons).where(eq(lossReasons.accountId, acc(req)));
  const [r] = await db.insert(lossReasons).values({ accountId: acc(req), name, position: (m ?? -1) + 1 }).returning();
  res.status(201).json(railsJson(r));
});
pipelinesRouter.delete('/loss_reasons/:id', requireOwner, async (req, res) => {
  await db.delete(lossReasons).where(and(eq(lossReasons.id, Number(req.params.id)), eq(lossReasons.accountId, acc(req))));
  res.status(204).end();
});

pipelinesRouter.get('/flows_options', async (req, res) => {
  res.json(await db.select({ id: flows.id, name: flows.name, active: flows.active }).from(flows).where(and(eq(flows.accountId, acc(req)), eq(flows.kind, 'salesbot'))).orderBy(asc(flows.name)));
});
