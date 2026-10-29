import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts, contactTags, conversations, messages, notes, pipelineCards, pipelineStages, pipelineTriggerRuns, pipelineTriggers, pipelines, tags, tarefas, users } from '../db/schema.js';
import { cache } from './cache.js';
import { setReguaTriggerRunner, updateContact } from './contacts.js';
import { MANUAL_TIPOS, PRIORIDADES, isUniqueViolation } from './tarefas.js';
import { logEvent } from './events.js';

// Motor do "Automatize" (Funil Digital do Kommo) — porta do PipelineTriggerRunnerService da v1
// + o que o Kommo tem a mais (docs/KOMMO_PARIDADE.md):
//   eventos: enter (entrar/ser criado na etapa, com atraso opcional), client_reply,
//            schedule (diário/semanal/data fixa), date_field (X min antes/depois de um campo de data)
//   condições: só executa se os campos/etiquetas do contato baterem
//   ações: mover etapa (inclusive pra outro funil), responsável, nota, tarefa, concluir tarefas,
//          alterar/limpar campo, add/remover etiquetas, IA liga/pausa, webhook, iniciar robô
// Gatilho com atraso vira uma linha em pipeline_trigger_runs (sobrevive a reinício do servidor);
// o job `pipeline_triggers` roda a cada minuto e executa o que venceu.
/* eslint-disable @typescript-eslint/no-explicit-any */

type Card = typeof pipelineCards.$inferSelect;
type Trigger = typeof pipelineTriggers.$inferSelect;
type Contact = typeof contacts.$inferSelect;

export const MAX_CHAIN = 5;
export const EVENTS = ['enter', 'client_reply', 'agent_message', 'schedule', 'date_field'] as const;
// ganchos do Agente de IA (lib/aiAgent registra; evita import circular)
const aiHooks: { start: (contactId: number, agentId: number | null) => Promise<unknown>; stop: (contactId: number, agentId: number | null) => Promise<unknown> } = { start: async () => {}, stop: async () => {} };
export function setAiAgentHooks(h: typeof aiHooks) { Object.assign(aiHooks, h); }

export const ACTION_TYPES = ['move_stage', 'copy_lead', 'change_owner', 'create_note', 'create_task', 'complete_tasks', 'set_field', 'add_tags', 'remove_tags', 'ai_start', 'ai_stop', 'send_webhook', 'start_flow', 'advance_field'] as const;
// funil de sistema do Consignado: etapas = status da régua (pipeline_stages.status_key)
export const CONSIGNADO_SLUG = 'consignado';

export type Condition = { field: string; op: 'eq' | 'neq' | 'empty' | 'not_empty' | 'contains' | 'has_tag' | 'no_tag'; value?: string };
export type Schedule = { kind?: 'daily' | 'weekly' | 'once'; time?: string; weekday?: number; at?: string };

/** O que cada ação exige no config — mesma validação do PipelineTrigger da v1. */
export function validateTrigger(t: { actionType?: string; event?: string; config?: any; schedule?: any }): string | null {
  if (!ACTION_TYPES.includes(t.actionType as any)) return 'Ação inválida.';
  if (!EVENTS.includes((t.event || 'enter') as any)) return 'Evento inválido.';
  const c = t.config || {};
  switch (t.actionType) {
    case 'move_stage': case 'copy_lead': if (!c.target_stage_id) return 'Escolha a etapa de destino.'; break;
    case 'change_owner': if (!c.user_id) return 'Escolha o responsável.'; break;
    case 'create_note': if (!String(c.content || '').trim()) return 'Escreva o texto da nota.'; break;
    case 'create_task': if (!String(c.titulo || '').trim()) return 'Escreva o título da tarefa.'; break;
    case 'set_field': if (!c.field_key) return 'Escolha o campo.'; break;
    case 'advance_field': if (!c.field_key || !Array.isArray(c.steps) || c.steps.length < 2) return 'Escolha o campo e a sequência de valores.'; break;
    case 'add_tags': case 'remove_tags': if (!Array.isArray(c.tag_ids) || !c.tag_ids.length) return 'Escolha pelo menos uma etiqueta.'; break;
    case 'send_webhook': if (!/^https?:\/\//.test(String(c.url || ''))) return 'Informe uma URL http(s).'; break;
    case 'start_flow': if (!c.flow_id) return 'Escolha o robô.'; break;
  }
  if (t.event === 'schedule') {
    const s = t.schedule || {};
    if (s.kind === 'once' ? !s.at : !/^\d{2}:\d{2}$/.test(String(s.time || ''))) return 'Informe quando o gatilho roda.';
    if (s.kind === 'weekly' && !(Number(s.weekday) >= 0 && Number(s.weekday) <= 6)) return 'Escolha o dia da semana.';
  }
  if (t.event === 'date_field' && !c.date_field) return 'Escolha o campo de data.';
  return null;
}

// --- leitura de campos / condições ----------------------------------------------------------------

const attrs = (c: Contact) => (c.customAttributes || {}) as Record<string, any>;

/** Lê um campo do contato: colunas fixas (name, phone, email, status) ou custom_attributes. */
export function fieldValue(c: Contact, key: string): string {
  if (key === 'name') return c.name || '';
  if (key === 'phone') return c.phone || '';
  if (key === 'email') return (c as any).email || '';
  if (key === 'status') return c.status || '';
  const v = attrs(c)[key];
  return v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v);
}

async function tagIdsOf(contactId: number) {
  return (await db.select({ id: contactTags.tagId }).from(contactTags).where(eq(contactTags.contactId, contactId))).map(r => r.id);
}

export async function conditionsMatch(contact: Contact, conds: Condition[]): Promise<boolean> {
  if (!Array.isArray(conds) || !conds.length) return true;
  let tagIds: number[] | null = null;
  for (const k of conds) {
    if (k.op === 'has_tag' || k.op === 'no_tag') {
      tagIds ??= await tagIdsOf(contact.id);
      const has = tagIds.includes(Number(k.value));
      if (k.op === 'has_tag' ? !has : has) return false;
      continue;
    }
    const v = fieldValue(contact, k.field).trim();
    const want = String(k.value ?? '').trim();
    const ok = k.op === 'empty' ? !v
      : k.op === 'not_empty' ? !!v
      : k.op === 'neq' ? v.toLowerCase() !== want.toLowerCase()
      : k.op === 'contains' ? v.toLowerCase().includes(want.toLowerCase())
      : v.toLowerCase() === want.toLowerCase();
    if (!ok) return false;
  }
  return true;
}

/** Data de um campo de texto: aceita ISO (2026-10-20T14:00) e BR (20/10/2026 14:00), fuso de Brasília. */
export function parseFieldDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (br) {
    const [, d, m, y, hh = '09', mm = '00'] = br;
    return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${hh.padStart(2, '0')}:${mm}:00-03:00`);
  }
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (iso) return new Date(`${iso[1]}T${iso[2] || '09:00'}:00-03:00`);
  return null;
}

// --- execução ------------------------------------------------------------------------------------

async function loadContact(id: number) {
  const [c] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  return c ?? null;
}

export async function stageLabel(stageId: number) {
  const [r] = await db.select({ s: pipelineStages.name, p: pipelines.name, kind: pipelineStages.kind }).from(pipelineStages).innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId)).where(eq(pipelineStages.id, stageId));
  return r ? { label: `${r.p} › ${r.s}`, kind: r.kind } : { label: '', kind: 'normal' };
}
const contactName = async (id: number) => (await db.select({ n: contacts.name, p: contacts.phone }).from(contacts).where(eq(contacts.id, id)).then(r => r[0]?.n || r[0]?.p || `Lead #${id}`));

/** Card mudou de etapa (ou foi criado): marca a entrada, zera a trava de "cliente respondeu",
 *  cancela atrasados pendentes da etapa antiga e roda os gatilhos `enter` da etapa nova. */
export async function moveCard(card: Card, stageId: number, chainDepth = 0, pipelineId = card.pipelineId, actorId: number | null = null): Promise<Card> {
  const [stage] = await db.select().from(pipelineStages).where(eq(pipelineStages.id, stageId)).limit(1);
  const [antes, depois] = await Promise.all([stageLabel(card.pipelineStageId), stageLabel(stageId)]);
  const [acc] = await db.select({ a: pipelines.accountId }).from(pipelines).where(eq(pipelines.id, pipelineId));
  void logEvent({
    accountId: acc.a, userId: actorId, contactId: card.contactId, objectType: 'lead', objectId: card.id, objectName: await contactName(card.contactId),
    eventType: stage?.kind === 'won' ? 'lead_won' : stage?.kind === 'lost' ? 'lead_lost' : 'stage_changed', before: antes.label, after: depois.label,
    meta: { from_stage_id: card.pipelineStageId, to_stage_id: stageId, pipeline_id: pipelineId, value: Number(card.value) },
  });
  const closing = stage?.kind === 'won' || stage?.kind === 'lost';
  const [moved] = await db.update(pipelineCards).set({
    pipelineId, pipelineStageId: stageId, stageEnteredAt: new Date(), replyTriggeredAt: null, agentMessageTriggeredAt: null,
    closedAt: closing ? new Date() : null, ...(stage?.kind === 'lost' ? {} : { lossReason: null }), updatedAt: new Date(),
  }).where(eq(pipelineCards.id, card.id)).returning();
  await db.update(pipelineTriggerRuns).set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(pipelineTriggerRuns.pipelineCardId, card.id), eq(pipelineTriggerRuns.status, 'pending')));
  if (stage?.statusKey) {
    // etapa do Consignado: o status da revendedora vai junto (a régua vê o card já na etapa e não move de novo)
    const contact = await loadContact(card.contactId);
    if (contact && contact.status !== stage.statusKey) await updateContact(contact, { status: stage.statusKey });
  }
  await runEnterTriggers(moved, chainDepth);
  return moved;
}

/**
 * Kommo "Aplicar a todos os leads que já estão nesta etapa": roda o gatilho "quando entrar" nos cards que
 * já estavam lá. Com atraso, conta do dia em que o card entrou (o que já passou do prazo roda agora);
 * cada card recebe no máximo uma vez por permanência na etapa (mesma chave do gatilho normal).
 */
export async function aplicarAosQueJaEstao(t: Trigger) {
  if (t.event === 'agent_message' || t.event === 'client_reply') return aplicarMensagemAosQueJaEstao(t);
  if (t.event !== 'enter') return 0;
  const cards = await db.select().from(pipelineCards).where(eq(pipelineCards.pipelineStageId, t.pipelineStageId));
  for (const card of cards) {
    const quando = new Date(Math.max(card.stageEnteredAt.getTime() + t.delayMinutes * 60_000, Date.now()));
    await db.insert(pipelineTriggerRuns).values({
      pipelineTriggerId: t.id, pipelineCardId: card.id, runKey: `enter:${card.stageEnteredAt.toISOString()}`, runAt: quando, chainDepth: 0,
    }).onConflictDoNothing();
  }
  return cards.length;
}

/**
 * Mesmo botão nos gatilhos de mensagem (Bel, 29/10 — Novo Lead → Primeiro contato): roda nos cards da etapa
 * cuja conversa já tem mensagem da equipe (qualquer época; nota interna e disparo não contam) ou, em
 * "quando o cliente responder", resposta do cliente desde que o card entrou na etapa. Marca o card igual
 * ao gatilho normal, então ninguém recebe duas vezes. Roda em segundo plano (pode ter centenas de leads).
 */
async function aplicarMensagemAosQueJaEstao(t: Trigger) {
  const agente = t.event === 'agent_message';
  const coluna = agente ? pipelineCards.agentMessageTriggeredAt : pipelineCards.replyTriggeredAt;
  const temMensagem = agente
    ? sql`EXISTS (SELECT 1 FROM messages m JOIN conversations cv ON cv.id = m.conversation_id WHERE cv.contact_id = ${pipelineCards.contactId}
        AND m.sender_type = 'User' AND NOT coalesce(m.is_private, false) AND m.broadcast_id IS NULL)`
    : sql`EXISTS (SELECT 1 FROM messages m JOIN conversations cv ON cv.id = m.conversation_id WHERE cv.contact_id = ${pipelineCards.contactId}
        AND m.sender_type = 'Contact' AND m.created_at > ${pipelineCards.stageEnteredAt})`;
  const cards = await db.select().from(pipelineCards).where(and(eq(pipelineCards.pipelineStageId, t.pipelineStageId), sql`${coluna} IS NULL`, temMensagem));
  void (async () => {
    for (const card of cards) {
      const claimed = await db.update(pipelineCards).set(agente ? { agentMessageTriggeredAt: new Date() } : { replyTriggeredAt: new Date() })
        .where(and(eq(pipelineCards.id, card.id), eq(pipelineCards.pipelineStageId, t.pipelineStageId), sql`${coluna} IS NULL`)).returning({ id: pipelineCards.id });
      if (claimed.length) await execute(t, card, 0);
    }
  })().catch(e => console.error('Aplicar gatilho de mensagem aos que já estão falhou —', (e as Error).message));
  return cards.length;
}

export async function runEnterTriggers(card: Card, chainDepth = 0) {
  if (chainDepth >= MAX_CHAIN) return;
  const triggers = await db.select().from(pipelineTriggers)
    .where(and(eq(pipelineTriggers.pipelineStageId, card.pipelineStageId), eq(pipelineTriggers.active, true), eq(pipelineTriggers.event, 'enter')))
    .orderBy(asc(pipelineTriggers.position), asc(pipelineTriggers.id));
  for (const t of triggers) {
    if (t.delayMinutes > 0) {
      // "depois de X horas": agenda; o job confere de novo se o card ainda está na etapa
      await db.insert(pipelineTriggerRuns).values({
        pipelineTriggerId: t.id, pipelineCardId: card.id, runKey: `enter:${card.stageEnteredAt.toISOString()}`,
        runAt: new Date(card.stageEnteredAt.getTime() + t.delayMinutes * 60_000), chainDepth,
      }).onConflictDoNothing();
    } else {
      await execute(t, card, chainDepth);
    }
  }
}

/** Gatilhos "quando o cliente responder" de todas as etapas onde o contato está — 1 vez por permanência. */
export async function onClientReply(contactId: number) {
  await gatilhosDeMensagem(contactId, 'client_reply');
}

/** Gatilhos "quando a equipe mandar mensagem" (pelo CRM ou pelo celular) — ex.: Novo Lead → Primeiro contato. */
export async function onAgentMessage(contactId: number) {
  await gatilhosDeMensagem(contactId, 'agent_message');
}

async function gatilhosDeMensagem(contactId: number, evento: 'client_reply' | 'agent_message') {
  const coluna = evento === 'client_reply' ? pipelineCards.replyTriggeredAt : pipelineCards.agentMessageTriggeredAt;
  const cards = await db.select().from(pipelineCards).where(eq(pipelineCards.contactId, contactId));
  for (const card of cards) {
    const triggers = await db.select().from(pipelineTriggers)
      .where(and(eq(pipelineTriggers.pipelineStageId, card.pipelineStageId), eq(pipelineTriggers.active, true), eq(pipelineTriggers.event, evento)))
      .orderBy(asc(pipelineTriggers.position));
    if (!triggers.length) continue;
    const claimed = await db.update(pipelineCards).set(evento === 'client_reply' ? { replyTriggeredAt: new Date() } : { agentMessageTriggeredAt: new Date() })
      .where(and(eq(pipelineCards.id, card.id), sql`${coluna} IS NULL`)).returning({ id: pipelineCards.id });
    if (!claimed.length) continue;
    for (const t of triggers) await execute(t, card, 0);
  }
}

/** Roda 1 gatilho num card (confere as condições antes). Erro numa ação nunca derruba as outras. */
export async function execute(t: Trigger, card: Card, chainDepth: number) {
  try {
    const contact = await loadContact(card.contactId);
    if (!contact) return;
    if (!(await conditionsMatch(contact, t.conditions as Condition[]))) return;
    // "só se o cliente não respondeu" (ex.: 24 h em Novo Lead sem resposta → Sem resposta): qualquer
    // mensagem do cliente depois que o card entrou na etapa cancela a ação
    if ((t.config as any)?.only_if_no_reply) {
      const [resp] = await db.select({ id: messages.id }).from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .where(and(eq(conversations.contactId, card.contactId), eq(messages.senderType, 'Contact'), sql`${messages.createdAt} > ${card.stageEnteredAt.toISOString()}`)).limit(1);
      if (resp) return;
    }
    await runAction(t, card, contact, chainDepth);
  } catch (e) {
    console.error(`PipelineTrigger#${t.id} (${t.actionType}) falhou pro card #${card.id}:`, (e as Error).message);
  }
}

async function runAction(t: Trigger, card: Card, contact: Contact, chainDepth: number) {
  const c = (t.config || {}) as Record<string, any>;
  const [pipe] = await db.select({ accountId: pipelines.accountId }).from(pipelines).where(eq(pipelines.id, card.pipelineId));
  const accountId = pipe.accountId;
  switch (t.actionType) {
    case 'move_stage': {
      const [target] = await db.select({ id: pipelineStages.id, pipelineId: pipelineStages.pipelineId, accountId: pipelines.accountId })
        .from(pipelineStages).innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId)).where(eq(pipelineStages.id, Number(c.target_stage_id)));
      if (!target || target.accountId !== accountId || target.id === card.pipelineStageId) return;
      if (target.pipelineId !== card.pipelineId) {
        // troca de funil: se o contato já tem card no destino, move aquele e apaga este
        const [other] = await db.select().from(pipelineCards).where(and(eq(pipelineCards.pipelineId, target.pipelineId), eq(pipelineCards.contactId, card.contactId)));
        if (other) { await db.delete(pipelineCards).where(eq(pipelineCards.id, card.id)); await moveCard(other, target.id, chainDepth + 1); return; }
      }
      await moveCard(card, target.id, chainDepth + 1, target.pipelineId);
      return;
    }
    case 'change_owner': {
      const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, Number(c.user_id)), eq(users.accountId, accountId)));
      if (u && u.id !== contact.userId) {
        await updateContact(contact, { userId: u.id });
        void logEvent({ accountId, contactId: contact.id, objectType: 'lead', objectId: card.id, objectName: contact.name, eventType: 'responsible_changed', before: contact.userId, after: u.id });
      }
      return;
    }
    case 'create_note':
      await db.insert(notes).values({ accountId, contactId: contact.id, userId: null, content: String(c.content) });
      void logEvent({ accountId, contactId: contact.id, objectType: 'nota', objectName: contact.name, eventType: 'note_added', after: String(c.content) });
      return;
    case 'create_task': {
      // TriggerTaskCreator da v1: 1 pendente por tipo por contato (índice único) — duplicata é ignorada
      const tipo = MANUAL_TIPOS.includes(c.tipo) ? c.tipo : 'manual_acompanhamento';
      const prioridade = PRIORIDADES.includes(c.prioridade) ? c.prioridade : 'normal';
      const [resp] = c.user_id ? await db.select({ id: users.id }).from(users).where(and(eq(users.id, Number(c.user_id)), eq(users.accountId, accountId))) : [];
      const values = { userId: resp?.id ?? contact.userId, prioridade, titulo: String(c.titulo).trim().slice(0, 120), descricao: c.descricao || null, vencimentoEm: taskDeadline(c) };
      try {
        await db.insert(tarefas).values({ accountId, contactId: contact.id, tipo, ...values });
        void logEvent({ accountId, contactId: contact.id, objectType: 'tarefa', objectName: contact.name, eventType: 'task_created', after: values.titulo });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        // já existe 1 pendente desse tipo (índice único da v1): no Kommo cada etapa gera a tarefa
        // da vez, então a pendente passa a ser a nova em vez de a nova ser descartada
        await db.update(tarefas).set({ ...values, updatedAt: new Date() })
          .where(and(eq(tarefas.contactId, contact.id), eq(tarefas.tipo, tipo), eq(tarefas.status, 'pendente')));
      }
      return;
    }
    case 'complete_tasks': {
      // Kommo: filtro por tipo (todos/um tipo) e por prazo (todas/atrasadas/hoje/amanhã) + comentário
      const conds = [eq(tarefas.contactId, contact.id), eq(tarefas.status, 'pendente')];
      if (c.tipo && c.tipo !== 'all') conds.push(eq(tarefas.tipo, String(c.tipo)));
      const [d0, d1, d2] = [startOfDaySP(0), startOfDaySP(1), startOfDaySP(2)];
      if (c.deadline_filter === 'overdue') conds.push(sql`${tarefas.vencimentoEm} < ${new Date().toISOString()}`);
      if (c.deadline_filter === 'today') conds.push(sql`${tarefas.vencimentoEm} >= ${d0.toISOString()} AND ${tarefas.vencimentoEm} < ${d1.toISOString()}`);
      if (c.deadline_filter === 'tomorrow') conds.push(sql`${tarefas.vencimentoEm} >= ${d1.toISOString()} AND ${tarefas.vencimentoEm} < ${d2.toISOString()}`);
      const done = await db.update(tarefas).set({ status: 'concluida', concluidaEm: new Date(), resultado: c.comment || 'Concluído automaticamente por automação.', updatedAt: new Date() })
        .where(and(...conds)).returning({ titulo: tarefas.titulo });
      for (const d of done) void logEvent({ accountId, contactId: contact.id, objectType: 'tarefa', objectName: contact.name, eventType: 'task_completed', before: d.titulo, after: c.comment || 'Concluído automaticamente por automação.' });
      return;
    }
    case 'copy_lead': {
      // "Criar lead": cópia deste lead em outra etapa/funil (1 card por funil por contato)
      const [target] = await db.select({ id: pipelineStages.id, pipelineId: pipelineStages.pipelineId, accountId: pipelines.accountId })
        .from(pipelineStages).innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId)).where(eq(pipelineStages.id, Number(c.target_stage_id)));
      if (!target || target.accountId !== accountId) return;
      const [exists] = await db.select({ id: pipelineCards.id }).from(pipelineCards).where(and(eq(pipelineCards.pipelineId, target.pipelineId), eq(pipelineCards.contactId, contact.id)));
      if (exists) return;
      const [novo] = await db.insert(pipelineCards).values({ pipelineId: target.pipelineId, pipelineStageId: target.id, contactId: contact.id, value: c.copy_value === false ? '0' : card.value }).returning();
      void logEvent({ accountId, contactId: contact.id, objectType: 'lead', objectId: novo.id, objectName: contact.name, eventType: 'lead_created', after: (await stageLabel(target.id)).label });
      await runEnterTriggers(novo, chainDepth + 1);
      return;
    }
    case 'set_field': {
      const key = String(c.field_key);
      const value = c.value === undefined || c.value === null ? '' : String(c.value);
      if (['name', 'phone', 'email', 'status'].includes(key)) { await updateContact(contact, { [key]: value || null } as any); return; }
      const next = { ...attrs(contact) };
      const before = next[key];
      if (value) next[key] = value; else delete next[key];
      await updateContact(contact, { customAttributes: next });
      void logEvent({ accountId, contactId: contact.id, objectType: 'lead', objectId: card.id, objectName: contact.name, eventType: 'field_changed', before, after: value, meta: { field: key } });
      return;
    }
    case 'advance_field': {
      // Kommo "Onboarding sobe": 1º mês → 2º mês → 3º mês → Veterano (vazio vai pro 1º; no último, fica)
      const key = String(c.field_key);
      const steps = (c.steps as unknown[]).map(String);
      const before = attrs(contact)[key] == null ? '' : String(attrs(contact)[key]);
      const i = steps.indexOf(before);
      const value = i < 0 ? steps[0] : steps[Math.min(i + 1, steps.length - 1)];
      if (value === before) return;
      await updateContact(contact, { customAttributes: { ...attrs(contact), [key]: value } });
      void logEvent({ accountId, contactId: contact.id, objectType: 'lead', objectId: card.id, objectName: contact.name, eventType: 'field_changed', before, after: value, meta: { field: key } });
      return;
    }
    case 'add_tags': {
      const ids = (await db.select({ id: tags.id }).from(tags).where(and(eq(tags.accountId, accountId), inArray(tags.id, (c.tag_ids as any[]).map(Number))))).map(r => r.id);
      for (const tagId of ids) await db.insert(contactTags).values({ contactId: contact.id, tagId }).onConflictDoNothing();
      if (ids.length) void logEvent({ accountId, contactId: contact.id, objectType: 'lead', objectId: card.id, objectName: contact.name, eventType: 'tags_added', after: (await db.select({ n: tags.name }).from(tags).where(inArray(tags.id, ids))).map(r => r.n) });
      return;
    }
    case 'remove_tags': {
      const removed = await db.delete(contactTags).where(and(eq(contactTags.contactId, contact.id), inArray(contactTags.tagId, (c.tag_ids as any[]).map(Number)))).returning({ id: contactTags.tagId });
      if (removed.length) void logEvent({ accountId, contactId: contact.id, objectType: 'lead', objectId: card.id, objectName: contact.name, eventType: 'tags_removed', before: (await db.select({ n: tags.name }).from(tags).where(inArray(tags.id, removed.map(r => r.id)))).map(r => r.n) });
      return;
    }
    case 'ai_start': case 'ai_stop': {
      // com agente escolhido: "Iniciar/Parar agente de IA" do Kommo (sessão do agente na conversa do lead)
      if (c.agent_id || t.actionType === 'ai_stop') await aiHooks[t.actionType === 'ai_start' ? 'start' : 'stop'](contact.id, c.agent_id ? Number(c.agent_id) : null);
      if (c.agent_id && t.actionType === 'ai_start') return;
      if (!contact.jid) return;
      const inboxIds = await db.execute(sql`SELECT DISTINCT inbox_id FROM conversations WHERE contact_id = ${contact.id} AND inbox_id IS NOT NULL`);
      for (const r of inboxIds as unknown as { inbox_id: number }[]) {
        const key = `ai_paused_${r.inbox_id}_${contact.jid}`;
        if (t.actionType === 'ai_stop') cache.write(key, Math.floor(Date.now() / 1000)); else cache.delete(key);
      }
      return;
    }
    case 'send_webhook':
      void fetch(String(c.url), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ event: 'pipeline_trigger', pipeline_id: card.pipelineId, pipeline_stage_id: card.pipelineStageId, contact: { id: contact.id, name: contact.name, phone: contact.phone } }),
      }).catch(e => console.error('Webhook de PipelineTrigger falhou:', e.message));
      return;
    case 'start_flow':
      await flowStarter(Number(c.flow_id), contact);
      return;
  }
}

/** Funil de entrada da caixa (Kommo "leads de entrada" por canal): põe o contato na etapa escolhida na
 *  caixa, se ainda não está naquele funil, e roda os gatilhos da etapa. Sem etapa configurada, nada. */
export async function entrarNoFunilDaCaixa(inbox: { entryStageId: number | null; accountId: number | null }, contactId: number) {
  if (!inbox.entryStageId || !inbox.accountId) return;
  const [st] = await db.select({ id: pipelineStages.id, pipelineId: pipelineStages.pipelineId, system: pipelines.system }).from(pipelineStages)
    .innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId))
    .where(and(eq(pipelineStages.id, inbox.entryStageId), eq(pipelines.accountId, inbox.accountId)));
  if (!st || st.system) return;
  const [novo] = await db.insert(pipelineCards).values({ pipelineId: st.pipelineId, pipelineStageId: st.id, contactId }).onConflictDoNothing().returning();
  if (!novo) return; // já estava nesse funil
  const [c] = await db.select({ n: contacts.name, p: contacts.phone }).from(contacts).where(eq(contacts.id, contactId));
  void logEvent({ accountId: inbox.accountId, contactId, objectType: 'lead', objectId: novo.id, objectName: c?.n || c?.p || '', eventType: 'lead_created', after: (await stageLabel(st.id)).label });
  await runEnterTriggers(novo);
}

/** Funil Consignado acompanha a régua: toda troca de contact.status põe o card do contato na etapa
 *  daquele status (criando o card se ainda não existe) e roda os gatilhos da etapa, como no Kommo. */
export async function syncConsignadoCard(contact: Contact) {
  if (!contact.status) return;
  const [stage] = await db.select({ id: pipelineStages.id, pipelineId: pipelineStages.pipelineId }).from(pipelineStages)
    .innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId))
    .where(and(eq(pipelines.accountId, contact.accountId), eq(pipelines.slug, CONSIGNADO_SLUG), eq(pipelineStages.statusKey, contact.status)));
  if (!stage) return;
  const [card] = await db.select().from(pipelineCards).where(and(eq(pipelineCards.pipelineId, stage.pipelineId), eq(pipelineCards.contactId, contact.id)));
  if (card) { if (card.pipelineStageId !== stage.id) await moveCard(card, stage.id); return; }
  const [novo] = await db.insert(pipelineCards).values({ pipelineId: stage.pipelineId, pipelineStageId: stage.id, contactId: contact.id }).onConflictDoNothing().returning();
  if (!novo) return;
  void logEvent({ accountId: contact.accountId, contactId: contact.id, objectType: 'lead', objectId: novo.id, objectName: contact.name || contact.phone || '', eventType: 'lead_created', after: (await stageLabel(stage.id)).label });
  await runEnterTriggers(novo);
}
setReguaTriggerRunner(syncConsignadoCard);

/** Início do dia em Brasília daqui a `plus` dias. */
function startOfDaySP(plus: number) {
  const now = new Date(Date.now() - 3 * 3600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + plus) + 3 * 3600_000);
}
/** Prazo da tarefa no jeito do Kommo: Imediatamente, Fim do dia, Em 1 dia, Em 3 dias, Fim da semana ou X horas. */
export function taskDeadline(c: Record<string, any>): Date {
  switch (c.deadline) {
    case 'end_of_day': return new Date(startOfDaySP(1).getTime() - 60_000);
    case '1d': return new Date(Date.now() + 24 * 3600_000);
    case '3d': return new Date(Date.now() + 72 * 3600_000);
    case 'end_of_week': { const sp = new Date(Date.now() - 3 * 3600_000); const toSun = (7 - sp.getUTCDay()) % 7; return new Date(startOfDaySP(toSun + 1).getTime() - 60_000) }
    case 'now': return new Date();
    default: return new Date(Date.now() + Math.min(Math.max(Number(c.prazo_horas) || 0, 0), 24 * 90) * 3600_000);
  }
}

// Robôs (Fluxos) ainda não portados: o runner registra aqui quando entrar (fase F).
let flowStarter: (flowId: number, contact: Contact) => Promise<void> = async (flowId) => {
  console.log(`PipelineTrigger: iniciar robô #${flowId} — Fluxos ainda não portados, ignorado.`);
};
export function setFlowStarter(fn: typeof flowStarter) { flowStarter = fn; }

// --- job (a cada minuto) -------------------------------------------------------------------------

const SP_OFFSET = -3 * 3600_000;
/** "Agora" em Brasília como partes de data (o servidor pode estar em UTC). */
const spParts = (d: Date) => { const s = new Date(d.getTime() + SP_OFFSET); return { y: s.getUTCFullYear(), m: s.getUTCMonth(), d: s.getUTCDate(), wd: s.getUTCDay() }; };
const spDate = (y: number, m: number, d: number, hhmm: string) => { const [h, mi] = hhmm.split(':').map(Number); return new Date(Date.UTC(y, m, d, h, mi) - SP_OFFSET); };

/** Última ocorrência do agendamento que já passou (ou null se nunca/ainda não). */
export function lastOccurrence(s: Schedule, now = new Date()): Date | null {
  if (s.kind === 'once') { const at = s.at ? new Date(s.at) : null; return at && at <= now ? at : null; }
  if (!s.time) return null;
  const p = spParts(now);
  for (let back = 0; back <= 7; back++) {
    const occ = spDate(p.y, p.m, p.d - back, s.time);
    if (occ > now) continue;
    if (s.kind === 'weekly' && spParts(occ).wd !== Number(s.weekday)) continue;
    return occ;
  }
  return null;
}

const CATCH_UP_MS = 15 * 60_000; // servidor parado: recupera agendados de até 15 min atrás, não mais

export async function tickPipelineTriggers(now = new Date()) {
  // 1) atrasados que venceram ("depois de X horas")
  const due = await db.select().from(pipelineTriggerRuns)
    .where(and(eq(pipelineTriggerRuns.status, 'pending'), lte(pipelineTriggerRuns.runAt, now))).orderBy(asc(pipelineTriggerRuns.runAt)).limit(200);
  for (const run of due) {
    const claimed = await db.update(pipelineTriggerRuns).set({ status: 'done', updatedAt: new Date() })
      .where(and(eq(pipelineTriggerRuns.id, run.id), eq(pipelineTriggerRuns.status, 'pending'))).returning({ id: pipelineTriggerRuns.id });
    if (!claimed.length) continue;
    const [t] = await db.select().from(pipelineTriggers).where(eq(pipelineTriggers.id, run.pipelineTriggerId));
    const [card] = await db.select().from(pipelineCards).where(eq(pipelineCards.id, run.pipelineCardId));
    // só roda se o lead continua na mesma etapa e na mesma "passagem" por ela
    if (!t || !t.active || !card || card.pipelineStageId !== t.pipelineStageId || `enter:${card.stageEnteredAt.toISOString()}` !== run.runKey) continue;
    await execute(t, card, run.chainDepth);
  }

  // 2) agendados (diário/semanal/data fixa) e 3) relativos a campo de data
  const triggers = await db.select().from(pipelineTriggers)
    .where(and(eq(pipelineTriggers.active, true), inArray(pipelineTriggers.event, ['schedule', 'date_field'])));
  for (const t of triggers) {
    const cards = await db.select().from(pipelineCards).where(eq(pipelineCards.pipelineStageId, t.pipelineStageId));
    if (!cards.length) continue;
    if (t.event === 'schedule') {
      const occ = lastOccurrence(t.schedule as Schedule, now);
      if (!occ || occ < t.createdAt || now.getTime() - occ.getTime() > CATCH_UP_MS) continue;
      for (const card of cards) await runOnce(t, card, `schedule:${occ.toISOString()}`, now);
    } else {
      const c = (t.config || {}) as Record<string, any>;
      const offset = Number(c.offset_minutes) || 0; // negativo = antes da data
      const cs = await db.select().from(contacts).where(inArray(contacts.id, cards.map(k => k.contactId)));
      const byId = new Map(cs.map(k => [k.id, k]));
      for (const card of cards) {
        const contact = byId.get(card.contactId);
        const raw = contact ? fieldValue(contact, String(c.date_field)) : '';
        const date = parseFieldDate(raw);
        if (!date) continue;
        const fireAt = new Date(date.getTime() + offset * 60_000);
        // dispara uma vez por valor do campo; data reagendada = novo valor = dispara de novo
        if (fireAt <= now && now.getTime() - fireAt.getTime() < 24 * 3600_000) await runOnce(t, card, `date:${raw}`, now);
      }
    }
  }
}

async function runOnce(t: Trigger, card: Card, runKey: string, now: Date) {
  const inserted = await db.insert(pipelineTriggerRuns).values({ pipelineTriggerId: t.id, pipelineCardId: card.id, runKey, runAt: now, status: 'done' })
    .onConflictDoNothing().returning({ id: pipelineTriggerRuns.id });
  if (inserted.length) await execute(t, card, 0);
}
