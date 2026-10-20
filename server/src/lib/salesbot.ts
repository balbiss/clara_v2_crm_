import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts, contactTags, conversations, flowRuns, flows, inboxes, messages, notes, notifications, pipelineCards, pipelineStages, pipelines, tags, tarefas, users } from '../db/schema.js';
import { cache } from './cache.js';
import { updateContact } from './contacts.js';
import { createMessage, messageStatusValue } from './messages.js';
import { messagingService } from './waha.js';
import { broadcastConversations } from './realtime.js';
import { logEvent } from './events.js';
import { moveCard, setFlowStarter, taskDeadline } from './pipelines.js';
import { MANUAL_TIPOS, isUniqueViolation } from './tarefas.js';
import { setFlowHooks } from './wahaIngestion.js';

// Salesbot no padrão do Kommo (support.kommo.com › Salesbot). O robô é uma lista de passos
// (flows.definition = { start, steps: { id: Step } }) e cada execução (flow_runs) anda por eles.
// Passos: message (texto + botões + "outra resposta" + "sem resposta em X min" + "falha ao enviar"),
// condition, pause (aguardar resposta / timer), validation, internal_message, action, goto,
// start_bot, round_robin, stop. Quando o passo espera o cliente, a execução fica "waiting" e volta
// pela resposta (continueWithReply) ou pelo job (tickSalesbot) quando o tempo vence.
/* eslint-disable @typescript-eslint/no-explicit-any */

type Run = typeof flowRuns.$inferSelect;
type Flow = typeof flows.$inferSelect;
export type Step = { id: string; type: string; next?: string | null; [k: string]: any };
export type Definition = { start?: string; steps?: Record<string, Step> };

export const STEP_TYPES = ['message', 'condition', 'pause', 'validation', 'internal_message', 'action', 'goto', 'start_bot', 'round_robin', 'stop'] as const;
export const ACTIONS = ['add_note', 'add_task', 'conversation_status', 'move_stage', 'change_owner', 'complete_tasks', 'manage_tags', 'set_field', 'webhook', 'create_lead'] as const;
const MAX_STEPS_PER_RUN = 60; // trava contra laço infinito (goto pra trás sem pausa)
const MAX_BOT_DEPTH = 3;      // robô que inicia robô

// --- variáveis {{contact.name}}, {{lead.campo}}, {{user.name}} ----------------------------------
async function renderText(text: string, contactId: number) {
  if (!text || !text.includes('{{')) return text || '';
  const [c] = await db.select().from(contacts).where(eq(contacts.id, contactId));
  const [u] = c?.userId ? await db.select({ f: users.firstName, l: users.lastName }).from(users).where(eq(users.id, c.userId)) : [];
  const attrs = (c?.customAttributes || {}) as Record<string, any>;
  return text.replace(/\{\{\s*([a-z_]+)\.([a-zA-Z0-9_]+)\s*\}\}/g, (_m, obj, key) => {
    if (obj === 'contact') return String(key === 'name' ? (c?.name || '') : key === 'phone' ? (c?.phone || '') : key === 'first_name' ? (c?.name || '').split(' ')[0] : (c as any)?.[key] ?? '');
    if (obj === 'lead') { const v = attrs[key]; return v == null ? '' : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? v.name || '' : String(v) }
    if (obj === 'user') return key === 'name' ? `${u?.f || ''} ${u?.l || ''}`.trim() : '';
    return '';
  });
}

/** Conversa usada pelo robô: a da execução ou a mais recente do contato. */
async function conversationFor(run: Run) {
  if (run.conversationId) { const [c] = await db.select().from(conversations).where(eq(conversations.id, run.conversationId)); if (c) return c }
  const [c] = await db.select().from(conversations).where(eq(conversations.contactId, run.contactId)).orderBy(desc(conversations.lastActivityAt)).limit(1);
  return c ?? null;
}

/** Envia a mensagem do robô: grava no histórico (aparece na conversa) e manda pelo WhatsApp da caixa.
 *  Devolve false se não conseguiu enviar (caminho "Falha ao enviar mensagem" do Kommo). */
async function sendBotMessage(run: Run, text: string): Promise<boolean> {
  const conv = await conversationFor(run);
  if (!conv) return false;
  const msg = await createMessage({ accountId: conv.accountId, conversationId: conv.id, senderType: 'User', senderId: null, text, status: messageStatusValue('sent') });
  const [inbox] = conv.inboxId ? await db.select().from(inboxes).where(eq(inboxes.id, conv.inboxId)) : [];
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId));
  try {
    if (!inbox) throw new Error('conversa sem caixa');
    if (contact?.jid) cache.write(`sending_from_crm_${inbox.id}_${contact.jid}`, true, 20);
    const externalId = await messagingService(inbox).sendMessage(contact?.jid || contact?.phone || '', text, null);
    if (!externalId) throw new Error('WhatsApp não confirmou o envio');
    await db.update(messages).set({ sourceId: externalId, status: messageStatusValue('delivered') }).where(eq(messages.id, msg.id));
    return true;
  } catch (e) {
    await db.update(messages).set({ status: messageStatusValue('failed') }).where(eq(messages.id, msg.id));
    console.error(`Salesbot: mensagem não enviada (run ${run.id}):`, (e as Error).message);
    return false;
  }
}

// --- condições -----------------------------------------------------------------------------------
async function evalRule(run: Run, r: any): Promise<boolean> {
  const vars = (run.variables || {}) as Record<string, any>;
  const [c] = await db.select().from(contacts).where(eq(contacts.id, run.contactId));
  const attrs = (c?.customAttributes || {}) as Record<string, any>;
  let actual = '';
  switch (r.field) {
    case 'message': actual = String(vars.last_message ?? ''); break;
    case 'conversation_status': { const conv = await conversationFor(run); actual = ['open', 'pending', 'resolved', 'snoozed'][conv?.status ?? 0] || ''; break }
    case 'tag': {
      const has = (await db.select({ id: contactTags.tagId }).from(contactTags).where(and(eq(contactTags.contactId, run.contactId), eq(contactTags.tagId, Number(r.value))))).length > 0;
      return r.op === 'neq' || r.op === 'no_tag' ? !has : has;
    }
    case 'stage': {
      const cards = await db.select({ s: pipelineCards.pipelineStageId }).from(pipelineCards).where(eq(pipelineCards.contactId, run.contactId));
      const inStage = cards.some(k => k.s === Number(r.value)) || (String(r.value).startsWith('status:') && c?.status === String(r.value).slice(7));
      return r.op === 'neq' ? !inStage : inStage;
    }
    case 'responsible': actual = String(c?.userId ?? ''); break;
    default: { const v = attrs[r.field]; actual = v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v) }
  }
  const want = String(r.value ?? '').trim().toLowerCase();
  const a = actual.trim().toLowerCase();
  switch (r.op) {
    case 'empty': return !a;
    case 'not_empty': return !!a;
    case 'neq': return a !== want;
    case 'contains': return a.includes(want);
    case 'not_contains': return !a.includes(want);
    default: return a === want;
  }
}

function validate(step: Step, value: string): boolean {
  const v = (value || '').trim();
  const arg = String(step.value ?? '');
  switch (step.check) {
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    case 'phone': return v.replace(/\D/g, '').length >= 10;
    case 'number': return v !== '' && !Number.isNaN(Number(v.replace(',', '.')));
    case 'range': { const n = Number(v.replace(',', '.')); return !Number.isNaN(n) && n >= Number(step.min ?? -Infinity) && n <= Number(step.max ?? Infinity) }
    case 'length': return v.length === Number(arg);
    case 'contains': return v.toLowerCase().includes(arg.toLowerCase());
    case 'not_contains': return !v.toLowerCase().includes(arg.toLowerCase());
    case 'equals': return v.toLowerCase() === arg.toLowerCase();
    case 'not_equals': return v.toLowerCase() !== arg.toLowerCase();
    case 'regex': try { return new RegExp(arg).test(v) } catch { return false }
    default: return !!v;
  }
}

// --- ações (as do menu "Ação" do Salesbot) ------------------------------------------------------
async function runAction(run: Run, flow: Flow, step: Step) {
  const c = step.config || {};
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, run.contactId));
  if (!contact) return;
  const accountId = contact.accountId;
  const robo = { accountId, contactId: contact.id, objectName: contact.name, meta: { robo: flow.name } };
  switch (step.action) {
    case 'add_note':
      await db.insert(notes).values({ accountId, contactId: contact.id, userId: null, content: await renderText(String(c.text || ''), contact.id) });
      void logEvent({ ...robo, objectType: 'nota', eventType: 'note_added', after: c.text });
      return;
    case 'add_task': {
      const tipo = MANUAL_TIPOS.includes(c.tipo) ? c.tipo : 'manual_acompanhamento';
      const values = { userId: c.user_id ? Number(c.user_id) : contact.userId, titulo: (await renderText(String(c.titulo || 'Tarefa do robô'), contact.id)).slice(0, 120), descricao: c.descricao || null, vencimentoEm: taskDeadline(c) };
      try { await db.insert(tarefas).values({ accountId, contactId: contact.id, tipo, prioridade: 'normal', ...values }) }
      catch (e) { if (!isUniqueViolation(e)) throw e; await db.update(tarefas).set({ ...values, updatedAt: new Date() }).where(and(eq(tarefas.contactId, contact.id), eq(tarefas.tipo, tipo), eq(tarefas.status, 'pendente'))) }
      void logEvent({ ...robo, objectType: 'tarefa', eventType: 'task_created', after: values.titulo });
      return;
    }
    case 'conversation_status': {
      const conv = await conversationFor(run);
      if (!conv) return;
      const status = c.status === 'open' ? 0 : 2; // "fechar" (resolvida) ou reabrir
      await db.update(conversations).set({ status, updatedAt: new Date() }).where(eq(conversations.id, conv.id));
      broadcastConversations(conv.accountId, { event: 'conversation_updated', conversation: { id: conv.id, status: status === 2 ? 'resolved' : 'open' } });
      return;
    }
    case 'move_stage': {
      const ref = String(c.target || '');
      if (ref.startsWith('status:')) { await updateContact(contact, { status: ref.slice(7) }); return }
      const [target] = await db.select({ id: pipelineStages.id, pipelineId: pipelineStages.pipelineId }).from(pipelineStages).innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId)).where(and(eq(pipelineStages.id, Number(ref)), eq(pipelines.accountId, accountId)));
      if (!target) return;
      const [card] = await db.select().from(pipelineCards).where(and(eq(pipelineCards.contactId, contact.id), eq(pipelineCards.pipelineId, target.pipelineId)));
      if (card) { if (card.pipelineStageId !== target.id) await moveCard(card, target.id) }
      else { const [novo] = await db.insert(pipelineCards).values({ pipelineId: target.pipelineId, pipelineStageId: target.id, contactId: contact.id }).returning(); void logEvent({ ...robo, objectType: 'lead', objectId: novo.id, eventType: 'lead_created' }) }
      return;
    }
    case 'change_owner': {
      let userId = Number(c.user_id) || null;
      if (c.mode === 'round_robin') userId = await nextFromRoundRobin(flow, step.id, (c.user_ids || []).map(Number));
      if (!userId || userId === contact.userId) return;
      await updateContact(contact, { userId });
      const conv = await conversationFor(run);
      if (conv) await db.update(conversations).set({ userId, updatedAt: new Date() }).where(eq(conversations.id, conv.id));
      void logEvent({ ...robo, objectType: 'lead', eventType: 'responsible_changed', before: contact.userId, after: userId });
      return;
    }
    case 'complete_tasks': {
      const conds = [eq(tarefas.contactId, contact.id), eq(tarefas.status, 'pendente')];
      if (c.tipo && c.tipo !== 'all') conds.push(eq(tarefas.tipo, String(c.tipo)));
      await db.update(tarefas).set({ status: 'concluida', concluidaEm: new Date(), resultado: c.comment || 'Concluída pelo robô.', updatedAt: new Date() }).where(and(...conds));
      return;
    }
    case 'manage_tags': {
      const ids: number[] = (c.tag_ids || []).map(Number);
      if (!ids.length) return;
      if (c.mode === 'remove') await db.delete(contactTags).where(and(eq(contactTags.contactId, contact.id), inArray(contactTags.tagId, ids)));
      else for (const tagId of (await db.select({ id: tags.id }).from(tags).where(and(eq(tags.accountId, accountId), inArray(tags.id, ids)))).map(r => r.id)) await db.insert(contactTags).values({ contactId: contact.id, tagId }).onConflictDoNothing();
      void logEvent({ ...robo, objectType: 'lead', eventType: c.mode === 'remove' ? 'tags_removed' : 'tags_added', after: ids.join(',') });
      return;
    }
    case 'set_field': {
      // valor fixo ou a última mensagem do cliente (Kommo: "fonte: mensagem do cliente")
      const vars = (run.variables || {}) as Record<string, any>;
      const value = c.source === 'message' ? String(vars.last_message ?? '') : await renderText(String(c.value ?? ''), contact.id);
      const key = String(c.field_key || '');
      if (!key) return;
      if (key === 'name' || key === 'email') { await updateContact(contact, { [key]: value || null } as any); return }
      const next = { ...(contact.customAttributes as object || {}) } as Record<string, any>;
      if (value) next[key] = value; else delete next[key];
      await updateContact(contact, { customAttributes: next });
      void logEvent({ ...robo, objectType: 'lead', eventType: 'field_changed', after: value, meta: { field: key, robo: flow.name } });
      return;
    }
    case 'webhook':
      if (/^https?:\/\//.test(String(c.url || ''))) void fetch(String(c.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000), body: JSON.stringify({ event: 'salesbot', bot: flow.name, contact: { id: contact.id, name: contact.name, phone: contact.phone }, variables: run.variables }) }).catch(e => console.error('Webhook do Salesbot falhou:', e.message));
      return;
    case 'create_lead': {
      const [target] = await db.select({ id: pipelineStages.id, pipelineId: pipelineStages.pipelineId }).from(pipelineStages).where(eq(pipelineStages.id, Number(c.target)));
      if (!target) return;
      const [exists] = await db.select({ id: pipelineCards.id }).from(pipelineCards).where(and(eq(pipelineCards.pipelineId, target.pipelineId), eq(pipelineCards.contactId, contact.id)));
      if (exists) return;
      const [novo] = await db.insert(pipelineCards).values({ pipelineId: target.pipelineId, pipelineStageId: target.id, contactId: contact.id, value: String(Number(c.value) || 0) }).returning();
      void logEvent({ ...robo, objectType: 'lead', objectId: novo.id, eventType: 'lead_created' });
      return;
    }
  }
}

/** Round Robin do Kommo: cada lead novo pega a próxima opção da fila (a fila volta ao início). */
async function nextIndex(flow: Flow, stepId: string, size: number): Promise<number> {
  // contador atômico dentro de flows.settings.rr[stepId] (cria "rr" se ainda não existir — jsonb_set
  // sozinho não cria a chave pai, e o contador ficava sempre em 0)
  const [r] = await db.execute(sql`UPDATE flows SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('rr',
      COALESCE(settings->'rr', '{}'::jsonb) || jsonb_build_object(${stepId}::text, COALESCE((settings->'rr'->>${stepId})::int, -1) + 1))
    WHERE id = ${flow.id} RETURNING (settings->'rr'->>${stepId})::int AS n`) as unknown as { n: number }[];
  return size ? (r?.n ?? 0) % size : 0;
}
async function nextFromRoundRobin(flow: Flow, stepId: string, userIds: number[]) {
  if (!userIds.length) return null;
  const ativos = (await db.select({ id: users.id }).from(users).where(and(inArray(users.id, userIds), eq(users.status, 'active')))).map(u => u.id);
  const fila = userIds.filter(id => ativos.includes(id));
  return fila.length ? fila[await nextIndex(flow, stepId + ':users', fila.length)] : null;
}

// --- execução ------------------------------------------------------------------------------------
async function loadFlow(id: number) { const [f] = await db.select().from(flows).where(eq(flows.id, id)); return f ?? null }
const stepsOf = (flow: Flow) => ((flow.definition || {}) as Definition).steps || {};

async function finish(run: Run, status: 'done' | 'stopped' = 'done') {
  await db.update(flowRuns).set({ status, waitKind: null, resumeAt: null, updatedAt: new Date() }).where(eq(flowRuns.id, run.id));
}
async function log(run: Run, stepId: string, note?: string) {
  await db.update(flowRuns).set({ stepsLog: sql`${flowRuns.stepsLog} || ${JSON.stringify([{ step: stepId, at: new Date().toISOString(), ...(note ? { note } : {}) }])}::jsonb` }).where(eq(flowRuns.id, run.id));
}

/** Anda a partir do passo `stepId` até parar, terminar ou precisar esperar o cliente/tempo. */
export async function runFrom(runId: number, stepId: string | null | undefined, depth = 0) {
  let [run] = await db.select().from(flowRuns).where(eq(flowRuns.id, runId));
  if (!run || run.status === 'done' || run.status === 'stopped') return;
  const flow = await loadFlow(run.flowId);
  if (!flow) return finish(run, 'stopped');
  const steps = stepsOf(flow);
  let cur = stepId;
  for (let i = 0; i < MAX_STEPS_PER_RUN; i++) {
    if (!cur) return finish(run);
    const step = steps[cur];
    if (!step) return finish(run);
    await log(run, cur);
    [run] = await db.select().from(flowRuns).where(eq(flowRuns.id, run.id));
    switch (step.type) {
      case 'message': {
        const ok = await sendBotMessage(run, await renderText(String(step.text || ''), run.contactId));
        if (!ok && step.on_fail) { cur = step.on_fail; continue }
        const waits = (step.buttons || []).length > 0 || step.on_other || step.no_answer?.next;
        if (!waits) { cur = step.next ?? null; continue }
        const minutes = Number(step.no_answer?.minutes) || 0;
        await db.update(flowRuns).set({ status: 'waiting', currentNodeKey: cur, waitKind: 'reply', resumeAt: minutes ? new Date(Date.now() + minutes * 60_000) : null, updatedAt: new Date() }).where(eq(flowRuns.id, run.id));
        return;
      }
      case 'pause': {
        // tempo em minutos e/ou segundos (os robôs da Clara esperam 3–5 s entre mensagens)
        const minutes = (Number(step.minutes) || 0) + (Number(step.seconds) || 0) / 60;
        if (step.mode === 'timer') {
          await db.update(flowRuns).set({ status: 'waiting', currentNodeKey: cur, waitKind: 'timer', resumeAt: new Date(Date.now() + Math.max(minutes, 0) * 60_000), updatedAt: new Date() }).where(eq(flowRuns.id, run.id));
        } else {
          await db.update(flowRuns).set({ status: 'waiting', currentNodeKey: cur, waitKind: 'reply', resumeAt: minutes ? new Date(Date.now() + minutes * 60_000) : null, updatedAt: new Date() }).where(eq(flowRuns.id, run.id));
        }
        return;
      }
      case 'condition': {
        let next: string | null = step.else_next ?? null;
        for (const branch of step.branches || []) {
          const results = await Promise.all((branch.rules || []).map((r: any) => evalRule(run, r)));
          if (results.length && (branch.logic === 'or' ? results.some(Boolean) : results.every(Boolean))) { next = branch.next ?? null; break }
        }
        cur = next; continue;
      }
      case 'validation': {
        const value = String(((run.variables || {}) as any).last_message ?? '');
        const ok = validate(step, value);
        if (ok && step.save_field) {
          const [c] = await db.select().from(contacts).where(eq(contacts.id, run.contactId));
          if (c) await updateContact(c, { customAttributes: { ...(c.customAttributes as object || {}), [step.save_field]: value } });
        }
        cur = ok ? (step.next ?? null) : (step.fail_next ?? null); continue;
      }
      case 'internal_message': {
        const text = await renderText(String(step.text || ''), run.contactId);
        const conv = await conversationFor(run);
        const [c] = await db.select({ accountId: contacts.accountId, name: contacts.name }).from(contacts).where(eq(contacts.id, run.contactId));
        if (conv) await createMessage({ accountId: conv.accountId, conversationId: conv.id, senderType: 'User', senderId: null, text, isPrivate: true, status: messageStatusValue('sent') });
        if (c) await db.insert(notifications).values({ accountId: c.accountId, title: `Robô "${flow.name}" · ${c.name || 'lead'}`, message: text.slice(0, 250), link: conv ? `/conversas` : null });
        cur = step.next ?? null; continue;
      }
      case 'action': await runAction(run, flow, step); cur = step.next ?? null; continue;
      case 'goto': cur = step.target ?? null; continue;
      case 'start_bot': {
        await finish(run);
        if (depth < MAX_BOT_DEPTH && step.flow_id) await startBot(Number(step.flow_id), run.contactId, { conversationId: run.conversationId, trigger: 'robô ' + flow.name, depth: depth + 1 });
        return;
      }
      case 'round_robin': {
        const opts: string[] = (step.options || []).map((o: any) => o.next).filter(Boolean);
        cur = opts.length ? opts[await nextIndex(flow, cur!, opts.length)] : (step.next ?? null); continue;
      }
      case 'stop': return finish(run);
      default: cur = step.next ?? null;
    }
  }
  console.error(`Salesbot: execução ${run.id} passou de ${MAX_STEPS_PER_RUN} passos — parada (laço?)`);
  return finish(run, 'stopped');
}

/** Inicia um robô pra um contato (gatilho, Automatize, "Executar robô" no card, outro robô). */
export async function startBot(flowId: number, contactId: number, opts: { conversationId?: number | null; trigger?: string; depth?: number; force?: boolean } = {}) {
  const flow = await loadFlow(flowId);
  if (!flow || (!flow.active && !opts.force)) return null;
  const def = (flow.definition || {}) as Definition;
  if (!def.start || !def.steps?.[def.start]) return null;
  // o mesmo robô não roda duas vezes ao mesmo tempo no mesmo contato
  await db.update(flowRuns).set({ status: 'stopped', updatedAt: new Date() })
    .where(and(eq(flowRuns.flowId, flowId), eq(flowRuns.contactId, contactId), inArray(flowRuns.status, ['running', 'waiting'])));
  const [run] = await db.insert(flowRuns).values({ flowId, contactId, conversationId: opts.conversationId ?? null, currentNodeKey: def.start, status: 'running', trigger: opts.trigger ?? null, variables: {} }).returning();
  await runFrom(run.id, def.start, opts.depth ?? 0);
  return run.id;
}

/** Cliente respondeu: continua o robô que estava esperando resposta nessa conversa. */
export async function continueWithReply(conversationId: number, contactId: number, text: string): Promise<boolean> {
  const [run] = await db.select().from(flowRuns)
    .where(and(eq(flowRuns.contactId, contactId), eq(flowRuns.status, 'waiting'), eq(flowRuns.waitKind, 'reply')))
    .orderBy(desc(flowRuns.updatedAt)).limit(1);
  if (!run) return false;
  const flow = await loadFlow(run.flowId);
  const step = flow ? stepsOf(flow)[run.currentNodeKey || ''] : null;
  if (!flow || !step) { await finish(run, 'stopped'); return false }
  const vars = { ...(run.variables as object || {}), last_message: text };
  await db.update(flowRuns).set({ status: 'running', waitKind: null, resumeAt: null, conversationId: run.conversationId ?? conversationId, variables: vars, updatedAt: new Date() }).where(eq(flowRuns.id, run.id));
  let next: string | null = null;
  if (step.type === 'message') {
    const t = text.trim().toLowerCase();
    const btns: any[] = step.buttons || [];
    const hit = btns.find((b, i) => String(b.label || '').trim().toLowerCase() === t || String(i + 1) === t || (b.synonyms || []).some((s: string) => s.trim().toLowerCase() === t));
    next = hit ? (hit.next ?? null) : (step.on_other ?? (btns.length ? null : step.next ?? null));
  } else next = step.next ?? null;
  await runFrom(run.id, next);
  return true;
}

/** Job (a cada 30s): timers vencidos e "sem resposta em X minutos". */
export async function tickSalesbot() {
  const due = await db.select().from(flowRuns).where(and(eq(flowRuns.status, 'waiting'), lte(flowRuns.resumeAt, new Date()))).limit(100);
  for (const run of due) {
    const claimed = await db.update(flowRuns).set({ status: 'running', updatedAt: new Date() }).where(and(eq(flowRuns.id, run.id), eq(flowRuns.status, 'waiting'))).returning({ id: flowRuns.id });
    if (!claimed.length) continue;
    const flow = await loadFlow(run.flowId);
    const step = flow ? stepsOf(flow)[run.currentNodeKey || ''] : null;
    if (!step) { await finish(run, 'stopped'); continue }
    const next = run.waitKind === 'timer' ? step.next : step.type === 'message' ? step.no_answer?.next : (step.timeout_next ?? null);
    await db.update(flowRuns).set({ waitKind: null, resumeAt: null }).where(eq(flowRuns.id, run.id));
    await runFrom(run.id, next ?? null);
  }
  await fireNoReplyTriggers();
}

// --- gatilhos -----------------------------------------------------------------------------------
type TriggerCfg = { event?: string; inbox_ids?: number[]; cooldown_minutes?: number; hours?: number; keywords?: string[]; tag_ids?: number[]; no_tag_ids?: number[]; active_hours?: { from: string; to: string } | null };

const nowHHMM = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(11, 16);
async function triggerAllows(flow: Flow, cfg: TriggerCfg, contactId: number, inboxId?: number | null) {
  if (cfg.inbox_ids?.length && (!inboxId || !cfg.inbox_ids.includes(inboxId))) return false;
  if (cfg.active_hours?.from && cfg.active_hours?.to) { const h = nowHHMM(); if (h < cfg.active_hours.from || h > cfg.active_hours.to) return false }
  if (cfg.tag_ids?.length || cfg.no_tag_ids?.length) {
    const mine = (await db.select({ id: contactTags.tagId }).from(contactTags).where(eq(contactTags.contactId, contactId))).map(r => r.id);
    if (cfg.tag_ids?.length && !cfg.tag_ids.some(t => mine.includes(Number(t)))) return false;
    if (cfg.no_tag_ids?.length && cfg.no_tag_ids.some(t => mine.includes(Number(t)))) return false;
  }
  const cooldown = Number(cfg.cooldown_minutes) || 0;
  if (cooldown) {
    const [recent] = await db.select({ id: flowRuns.id }).from(flowRuns).where(and(eq(flowRuns.flowId, flow.id), eq(flowRuns.contactId, contactId), gte(flowRuns.createdAt, new Date(Date.now() - cooldown * 60_000)))).limit(1);
    if (recent) return false;
  }
  return true;
}

/** Mensagem do cliente chegou (e nenhum robô estava esperando): gatilhos "conversa iniciada" e
 *  "mensagem recebida". Devolve true se algum robô assumiu (aí a IA não responde por cima). */
export async function triggerOnIncoming(conversation: typeof conversations.$inferSelect, contactId: number, text: string, isNewConversation: boolean): Promise<boolean> {
  const bots = await db.select().from(flows).where(and(eq(flows.accountId, conversation.accountId), eq(flows.active, true), eq(flows.kind, 'salesbot'))).orderBy(asc(flows.id));
  let started = false;
  for (const flow of bots) {
    const cfg = (flow.triggerConfig || {}) as TriggerCfg;
    const ev = cfg.event;
    if (ev !== 'incoming_message' && !(ev === 'conversation_started' && isNewConversation)) continue;
    if (cfg.keywords?.length && !cfg.keywords.some(k => text.toLowerCase().includes(String(k).toLowerCase()))) continue;
    if (!(await triggerAllows(flow, cfg, contactId, conversation.inboxId))) continue;
    if (await startBot(flow.id, contactId, { conversationId: conversation.id, trigger: ev })) started = true;
  }
  return started;
}

/** Conversa fechada: gatilho "conversa fechada" (ex.: pesquisa de satisfação / NPS). */
export async function triggerOnConversationClosed(conversationId: number) {
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  if (!conv) return;
  const bots = await db.select().from(flows).where(and(eq(flows.accountId, conv.accountId), eq(flows.active, true), eq(flows.kind, 'salesbot')));
  for (const flow of bots) {
    const cfg = (flow.triggerConfig || {}) as TriggerCfg;
    if (cfg.event !== 'conversation_closed') continue;
    if (await triggerAllows(flow, cfg, conv.contactId, conv.inboxId)) await startBot(flow.id, conv.contactId, { conversationId: conv.id, trigger: 'conversation_closed' });
  }
}

/** "X horas depois da última mensagem do cliente" (sem resposta da equipe nem do cliente desde então). */
async function fireNoReplyTriggers() {
  const bots = await db.select().from(flows).where(and(eq(flows.active, true), eq(flows.kind, 'salesbot')));
  for (const flow of bots) {
    const cfg = (flow.triggerConfig || {}) as TriggerCfg;
    const hours = Number(cfg.hours) || 0;
    if (cfg.event !== 'no_reply' || !hours) continue;
    const limite = new Date(Date.now() - hours * 3600_000);
    // conversas abertas cuja última mensagem é do cliente e passou do prazo
    const rows = await db.execute(sql`
      SELECT c.id, c.contact_id, c.inbox_id, m.created_at AS last_at FROM conversations c
      JOIN LATERAL (SELECT sender_type, created_at FROM messages WHERE conversation_id = c.id AND is_private = false ORDER BY created_at DESC LIMIT 1) m ON true
      WHERE c.account_id = ${flow.accountId} AND c.status = 0 AND m.sender_type = 'Contact' AND m.created_at <= ${limite.toISOString()}
        AND m.created_at > ${new Date(limite.getTime() - 24 * 3600_000).toISOString()}`) as unknown as { id: number; contact_id: number; inbox_id: number; last_at: string }[];
    for (const r of rows) {
      const [ja] = await db.select({ id: flowRuns.id }).from(flowRuns).where(and(eq(flowRuns.flowId, flow.id), eq(flowRuns.contactId, r.contact_id), gte(flowRuns.createdAt, new Date(r.last_at)))).limit(1);
      if (ja) continue; // já disparou desde essa última mensagem
      if (await triggerAllows(flow, cfg, r.contact_id, r.inbox_id)) await startBot(flow.id, r.contact_id, { conversationId: r.id, trigger: 'no_reply' });
    }
  }
}

// "Executar robô" do Automatize (lib/pipelines.ts) usa este motor
setFlowStarter(async (flowId, contact) => { await startBot(flowId, contact.id, { trigger: 'automatize' }) });

// mensagem do cliente pelo WhatsApp (lib/wahaIngestion): robô esperando resposta continua; senão os
// gatilhos de conversa disparam. Se algum robô assumiu, a IA não responde por cima.
setFlowHooks({
  continueWithReply: (conv, text) => continueWithReply(conv.id, conv.contactId, text),
  triggerByKeyword: async (_inbox, conv, contact, text) => {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(messages).where(and(eq(messages.conversationId, conv.id), eq(messages.senderType, 'Contact')));
    return triggerOnIncoming(conv, contact.id, text, n <= 1);
  },
});

// --- usado pelo Agente de IA (lib/aiAgent.ts): mesmas ações e mesmo envio do robô -------------------
/** Envia uma mensagem como robô/IA na conversa (grava no histórico e manda pelo WhatsApp). */
export function sendAsBot(conversationId: number, contactId: number, text: string) {
  return sendBotMessage({ id: 0, conversationId, contactId } as Run, text);
}
/** Executa uma ação do Salesbot (nota, tarefa, etapa, responsável, tags, campo…) em nome de `actor`. */
export async function runBotAction(contactId: number, conversationId: number | null, action: string, config: Record<string, unknown>, actor: string, lastMessage = '') {
  const run = { id: 0, contactId, conversationId, variables: { last_message: lastMessage } } as unknown as Run;
  const flow = { id: 0, name: actor, settings: {} } as unknown as Flow;
  await runAction(run, flow, { id: 'ia', type: 'action', action, config });
}
export { renderText };
