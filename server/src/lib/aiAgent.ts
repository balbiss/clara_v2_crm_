import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { aiAgentLogs, aiAgents, aiAgentSessions, aiAgentSources, contacts, contactTags, conversations, inboxes, messages, notifications, pipelineCards, pipelineStages, pipelines, tags, users } from '../db/schema.js';
import { cache } from './cache.js';
import { chatWithTools, describeImage, openaiApiKey, transcribeAudio, type ChatMsg } from './openai.js';
import { blobFor, downloadBlob } from './storage.js';
import { createMessage, messageStatusValue } from './messages.js';
import { broadcastConversations } from './realtime.js';
import { addConversationTag, conversationTagsOf, findOrCreateTag } from './conversations.js';
import { logEvent } from './events.js';
import { runBotAction, sendAsBot, startBot } from './salesbot.js';
import { setAiInboxCheck, setAiResponder } from './wahaIngestion.js';
import { setAiAgentHooks } from './pipelines.js';

// Agente de IA no padrão do Kommo (support.kommo.com/docs/ai-agent-manual-setup):
//  • Fontes — base de conhecimento (texto, perguntas e respostas, site, arquivo)
//  • Ações — QUANDO (até 5 condições, todas/qualquer) → FAÇA (até 5 passos) → Mais (instrução extra)
//  • Persona — papel, tom, tamanho, idioma, atraso antes de responder, diretrizes
//  • Configurações — pares canal × etapas onde ele atende, voz, imagem, transferência e limite
// Só responde mensagem que chega (não começa conversa). Áudio vira texto e imagem vira descrição,
// tudo pela OpenAI. A IA decide QUAL ação vale (ferramenta aplicar_acao); o CRM executa os passos.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Agent = typeof aiAgents.$inferSelect;
type Conv = typeof conversations.$inferSelect;
type Persona = { role?: string; tone?: string; length?: string; language?: string; delay_seconds?: number; guidelines?: string[] };
type Settings = { voice?: boolean; images?: boolean; max_replies?: number; transfer_user_id?: number | null; transfer_message?: string; model?: string };
type When = { type: string; value?: any };
type Do = { type: string; value?: any };
export type AgentAction = { id: string; name?: string; logic?: 'all' | 'any'; when: When[]; do: Do[]; more?: string };

export const MODEL = () => process.env.OPENAI_AGENT_MODEL || 'gpt-4.1-mini';
const SP = 3 * 3600_000;

// --- textos (mesmos nomes do Kommo, em português) ----------------------------------------------
export const WHEN_LABELS: Record<string, string> = {
  wants: 'Cliente quer', asks_about: 'Cliente pergunta sobre', sentiment: 'Sentimento do cliente é', provides: 'Cliente informa seu',
  contains: 'Mensagem recebida contém', first_time: 'Primeira vez atendendo o cliente', hours: 'Mensagem recebida em horário específico',
  no_reply: 'Cliente não respondeu em',
};
export const DO_LABELS: Record<string, string> = {
  transfer: 'Transferir para usuário', exact_message: 'Sempre usar esta mensagem exata', reply_info: 'Sempre responder com esta informação',
  bring_up: 'Sempre abordar este assunto', use_source: 'Responder usando a fonte', ask_for: 'Pedir dados do cliente', dont_mention: 'Não mencionar',
  try_bring_up: 'Tentar abordar este assunto', add_task: 'Adicionar tarefa', set_field: 'Preencher campo', manage_tags: 'Gerenciar tags',
  start_bot: 'Iniciar robô', change_stage: 'Mudar etapa do lead', change_owner: 'Mudar usuário responsável', send_file: 'Enviar arquivo', no_reply: 'Não responder',
};
const TONES: Record<string, string> = { casual: 'descontraído e informal', friendly: 'alegre, caloroso e bem informal', professional: 'educado e formal' };
const LENGTHS: Record<string, string> = { short: '100 a 200 caracteres', medium: '150 a 250 caracteres', long: '200 a 300 caracteres' };

// --- utilidades ---------------------------------------------------------------------------------
const spNow = (now = new Date()) => new Date(now.getTime() - SP);
/** Condição "horário específico": { days: [0..6], from: 'HH:MM', to: 'HH:MM' } no horário de São Paulo. */
export function inHours(v: any, now = new Date()) {
  const d = spNow(now); const dow = d.getUTCDay(); const hm = d.getUTCHours() * 60 + d.getUTCMinutes();
  const days: number[] = Array.isArray(v?.days) && v.days.length ? v.days.map(Number) : [0, 1, 2, 3, 4, 5, 6];
  const toMin = (s: string, def: number) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : def };
  const from = toMin(v?.from, 0), to = toMin(v?.to, 24 * 60);
  if (!days.includes(dow)) return false;
  return from <= to ? hm >= from && hm < to : hm >= from || hm < to; // faixa que vira a meia-noite
}
const describeWhen = (w: When) => {
  if (w.type === 'first_time') return WHEN_LABELS.first_time;
  if (w.type === 'hours') return `${WHEN_LABELS.hours} (${w.value?.from || '00:00'}–${w.value?.to || '24:00'})`;
  if (w.type === 'no_reply') return `${WHEN_LABELS.no_reply} ${w.value} minutos`;
  return `${WHEN_LABELS[w.type] || w.type}: ${Array.isArray(w.value) ? w.value.join(', ') : w.value ?? ''}`;
};
const describeDo = (d: Do, names: { users: Map<number, string>; sources: Map<number, string> }) => {
  const v = d.value;
  switch (d.type) {
    case 'transfer': return `${DO_LABELS.transfer} ${v?.user_id ? names.users.get(Number(v.user_id)) || '' : '(responsável do lead)'}`;
    case 'use_source': return `${DO_LABELS.use_source} "${names.sources.get(Number(v?.source_id)) || ''}"`;
    case 'ask_for': return `${DO_LABELS.ask_for}: ${v?.label || v?.field_key || v}`;
    case 'set_field': return `${DO_LABELS.set_field} "${v?.label || v?.field_key}"${v?.value ? ` = ${v.value}` : ' com o que o cliente informar'}`;
    case 'add_task': return `${DO_LABELS.add_task}: ${v?.titulo || ''}`;
    case 'manage_tags': return `${DO_LABELS.manage_tags} (${v?.mode === 'remove' ? 'remover' : 'adicionar'})`;
    case 'change_stage': return `${DO_LABELS.change_stage} ${v?.label || ''}`;
    case 'change_owner': return `${DO_LABELS.change_owner} ${names.users.get(Number(v?.user_id)) || ''}`;
    case 'start_bot': return `${DO_LABELS.start_bot} ${v?.label || ''}`;
    case 'send_file': return `${DO_LABELS.send_file} ${v?.url || ''}`;
    case 'no_reply': return DO_LABELS.no_reply;
    default: return `${DO_LABELS[d.type] || d.type}: ${typeof v === 'string' ? v : JSON.stringify(v ?? '')}`;
  }
};

/** Quebra as fontes em trechos e escolhe os mais parecidos com o que o cliente falou. */
export function pickKnowledge(sources: { id: number; title: string; content: string }[], query: string, budget = 12000) {
  const words = new Set(query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 2));
  const chunks: { id: number; title: string; text: string; score: number }[] = [];
  for (const s of sources) {
    const parts = s.content.split(/\n{2,}/).reduce<string[]>((acc, p) => { const last = acc[acc.length - 1]; if (last && last.length + p.length < 900) acc[acc.length - 1] = `${last}\n\n${p}`; else acc.push(p); return acc }, []);
    for (const p of parts) {
      const norm = `${s.title} ${p}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      let score = 0; for (const w of words) if (norm.includes(w)) score++;
      chunks.push({ id: s.id, title: s.title, text: p.trim(), score });
    }
  }
  const total = chunks.reduce((n, c) => n + c.text.length, 0);
  const chosen = total <= budget ? chunks : [...chunks].sort((a, b) => b.score - a.score).reduce<typeof chunks>((acc, c) => { if (acc.reduce((n, x) => n + x.text.length, 0) + c.text.length <= budget) acc.push(c); return acc }, []);
  const used = [...new Map(chunks.filter(c => c.score > 0).sort((a, b) => b.score - a.score).map(c => [c.id, c.title])).values()].slice(0, 3);
  return { text: chosen.filter(c => c.text).map(c => `### ${c.title}\n${c.text}`).join('\n\n'), used };
}

// --- ferramentas que a IA pode chamar ------------------------------------------------------------
const TOOLS = [
  { type: 'function', function: { name: 'aplicar_acao', description: 'Chame quando a situação da conversa cumprir o QUANDO de uma das Ações configuradas. O sistema executa os passos de FAÇA.', parameters: { type: 'object', properties: { acao: { type: 'string', description: 'id da ação (ex.: "a1")' }, dados: { type: 'object', description: 'dados que o cliente informou e que os passos pedem (ex.: {"email":"x@y.com"})', additionalProperties: true } }, required: ['acao'] } } },
  { type: 'function', function: { name: 'transferir_para_atendente', description: 'Passa a conversa para uma pessoa da equipe quando você não consegue ajudar ou o cliente pede para falar com alguém.', parameters: { type: 'object', properties: { motivo: { type: 'string' } }, required: ['motivo'] } } },
  { type: 'function', function: { name: 'lacuna_de_conhecimento', description: 'Registre quando o cliente perguntar algo que não está nas informações da empresa.', parameters: { type: 'object', properties: { pergunta: { type: 'string' } }, required: ['pergunta'] } } },
  { type: 'function', function: { name: 'registrar_intencao', description: 'Registre em poucas palavras a intenção do cliente nesta mensagem (ex.: "Quer revender", "Dúvida sobre acerto").', parameters: { type: 'object', properties: { intencao: { type: 'string' } }, required: ['intencao'] } } },
];

type LeadCtx = { contact?: any; stage?: string; responsible?: string; tags?: string[]; fields?: Record<string, any> };
type RunResult = {
  reply: string | null; transferred: boolean; transferReason?: string; tokens: number;
  details: { intent?: string; actions_completed: string[]; actions_scheduled: string[]; sources_used: string[]; knowledge_gaps: string[] };
};

/** Monta o prompt do agente. `actions` já vem filtrada pelas condições que o CRM confere sozinho. */
export function buildSystemPrompt(agent: Agent, actions: AgentAction[], knowledge: string, lead: LeadCtx, names: { users: Map<number, string>; sources: Map<number, string> }) {
  const p = (agent.persona || {}) as Persona;
  const lines = [
    p.role?.trim() || `Você é ${agent.name}, atendente virtual da empresa.`,
    `Tom de voz: ${TONES[p.tone || 'friendly'] || TONES.friendly}. Tamanho das respostas: ${LENGTHS[p.length || 'medium'] || LENGTHS.medium} (pode ajustar se a situação pedir).`,
    p.language && p.language !== 'auto' ? `Responda sempre em ${p.language}.` : 'Responda no idioma do cliente (padrão: português do Brasil).',
    'Você conversa pelo WhatsApp: mensagens curtas, sem markdown, no máximo 1 emoji quando combinar. Nunca invente preço, prazo, política ou dado que não esteja nas informações abaixo.',
    `Agora (São Paulo): ${spNow().toISOString().slice(0, 16).replace('T', ' ')}.`,
  ];
  if (p.guidelines?.length) lines.push('', 'Diretrizes:', ...p.guidelines.filter(Boolean).map(g => `- ${g}`));
  lines.push('', '# Informações da empresa (fontes)', knowledge || '(nenhuma fonte cadastrada — se não souber, chame lacuna_de_conhecimento e ofereça transferir)');
  const c = lead.contact;
  if (c) {
    lines.push('', '# Lead', `Nome: ${c.name || '—'} · Telefone: ${c.phone || '—'}`);
    if (lead.stage) lines.push(`Etapa: ${lead.stage}`);
    if (lead.responsible) lines.push(`Responsável: ${lead.responsible}`);
    if (lead.tags?.length) lines.push(`Tags: ${lead.tags.join(', ')}`);
    const f = Object.entries(lead.fields || {}).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object').slice(0, 25);
    if (f.length) lines.push(`Campos: ${f.map(([k, v]) => `${k}=${v}`).join('; ')}`);
  }
  if (actions.length) {
    lines.push('', '# Ações (regras) — quando o QUANDO de uma ação for verdade nesta mensagem, chame aplicar_acao com o id dela ANTES de responder, e siga o FAÇA na sua resposta.');
    for (const a of actions) {
      lines.push(`[${a.id}] ${a.name || ''}`.trim());
      lines.push(`  QUANDO (${a.logic === 'any' ? 'qualquer uma' : 'todas'}): ${a.when.map(describeWhen).join(' | ') || 'sempre'}`);
      lines.push(`  FAÇA: ${a.do.map(d => describeDo(d, names)).join(' | ') || 'responder normalmente'}`);
      if (a.more?.trim()) lines.push(`  Mais: ${a.more.trim()}`);
    }
  }
  lines.push('', 'Sempre chame registrar_intencao. Se o cliente pedir para falar com uma pessoa ou você não puder ajudar, chame transferir_para_atendente.');
  return lines.join('\n');
}

type Exec = (action: AgentAction, step: Do, dados: Record<string, any>) => Promise<string | null>;

/** Uma rodada do agente: manda histórico + prompt, executa as ferramentas e devolve a resposta. */
export async function runAgentTurn(agent: Agent, history: ChatMsg[], opts: { actions: AgentAction[]; lead: LeadCtx; query: string; exec: Exec; dry?: boolean }): Promise<RunResult> {
  const srcs = await db.select().from(aiAgentSources).where(eq(aiAgentSources.agentId, agent.id));
  const users_ = await db.select({ id: users.id, f: users.firstName, l: users.lastName }).from(users).where(eq(users.accountId, agent.accountId));
  const names = { users: new Map(users_.map(u => [u.id, `${u.f || ''} ${u.l || ''}`.trim()])), sources: new Map(srcs.map(s => [s.id, s.title])) };
  // "Responder usando a fonte X" restringe as fontes daquela ação — aqui vale o conjunto todo
  const k = pickKnowledge(srcs.map(s => ({ id: s.id, title: s.title, content: s.content })), opts.query);
  const sys = buildSystemPrompt(agent, opts.actions, k.text, opts.lead, names);
  const msgs: ChatMsg[] = [{ role: 'system', content: sys }, ...history];
  const res: RunResult = { reply: null, transferred: false, tokens: 0, details: { actions_completed: [], actions_scheduled: [], sources_used: k.used, knowledge_gaps: [] } };
  let exact: string | null = null, silence = false;
  const settings = (agent.settings || {}) as Settings;
  for (let round = 0; round < 4; round++) {
    const r = await chatWithTools(settings.model || MODEL(), msgs, TOOLS);
    res.tokens += r.tokens;
    if (!r.toolCalls.length) { res.reply = r.content?.trim() || null; break }
    msgs.push({ role: 'assistant', content: r.content, tool_calls: r.toolCalls });
    for (const tc of r.toolCalls) {
      let args: any = {}; try { args = JSON.parse(tc.function.arguments || '{}') } catch { /* argumento quebrado */ }
      let out = 'ok';
      if (tc.function.name === 'registrar_intencao') res.details.intent = String(args.intencao || '').slice(0, 120);
      else if (tc.function.name === 'lacuna_de_conhecimento') { res.details.knowledge_gaps.push(String(args.pergunta || '').slice(0, 200)); out = 'Registrado. Diga com sinceridade que vai confirmar com a equipe.' }
      else if (tc.function.name === 'transferir_para_atendente') { res.transferred = true; res.transferReason = String(args.motivo || ''); out = 'A conversa será transferida. Avise o cliente, com educação, que uma pessoa da equipe vai continuar o atendimento.' }
      else if (tc.function.name === 'aplicar_acao') {
        const action = opts.actions.find(a => a.id === String(args.acao));
        if (!action) out = 'Ação inexistente.';
        else {
          const dados = (args.dados && typeof args.dados === 'object') ? args.dados : {};
          const notes: string[] = [];
          for (const step of action.do) {
            if (step.type === 'exact_message') exact = String(step.value || '');
            else if (step.type === 'no_reply') silence = true;
            else if (step.type === 'transfer') { res.transferred = true; res.transferReason = action.name || 'Ação do agente' }
            else if (['add_task', 'set_field', 'manage_tags', 'start_bot', 'change_stage', 'change_owner', 'send_file'].includes(step.type)) {
              const done = opts.dry ? null : await opts.exec(action, step, dados);
              res.details.actions_completed.push(done || describeDo(step, names));
            } else notes.push(describeDo(step, names));
          }
          out = `Ação aplicada.${notes.length ? ` Na resposta: ${notes.join('; ')}.` : ''}`;
        }
      }
      msgs.push({ role: 'tool', tool_call_id: tc.id, content: out });
    }
  }
  if (exact) res.reply = exact;
  if (silence) res.reply = null;
  if (res.transferred && !res.reply) res.reply = settings.transfer_message || 'Vou te passar para uma pessoa da nossa equipe, só um instante! 😊';
  return res;
}

// --- escolher o agente da conversa ---------------------------------------------------------------
async function contactStages(contactId: number) {
  return (await db.select({ stageId: pipelineCards.pipelineStageId, name: pipelineStages.name, pipeline: pipelines.name }).from(pipelineCards)
    .innerJoin(pipelineStages, eq(pipelineStages.id, pipelineCards.pipelineStageId)).innerJoin(pipelines, eq(pipelines.id, pipelineCards.pipelineId))
    .where(eq(pipelineCards.contactId, contactId)));
}
/** Agentes ativos que atendem essa caixa (canal), em qualquer etapa — usado pra "acordar" a caixa. */
export async function agentsForInbox(inboxId: number) {
  const list = await db.select().from(aiAgents).where(eq(aiAgents.active, true));
  return list.filter(a => (a.channels as any[]).some(c => Number(c.inbox_id) === inboxId));
}
/** Sessão da conversa: a que já existe (se ativa) ou uma nova do agente da etapa/canal. */
export async function sessionFor(conv: Conv): Promise<{ agent: Agent; session: typeof aiAgentSessions.$inferSelect } | null> {
  const existing = await db.select().from(aiAgentSessions).where(eq(aiAgentSessions.conversationId, conv.id)).orderBy(desc(aiAgentSessions.updatedAt));
  const ativa = existing.find(s => s.status === 'active');
  if (ativa) {
    const [agent] = await db.select().from(aiAgents).where(eq(aiAgents.id, ativa.agentId));
    return agent?.active ? { agent, session: ativa } : null;
  }
  // pausada/parada/transferida nesta conversa: não começa outro por cima
  if (existing.length) return null;
  if (!conv.inboxId) return null;
  const stages = new Set((await contactStages(conv.contactId)).map(s => Number(s.stageId)));
  const candidates = (await agentsForInbox(conv.inboxId)).filter(a => a.accountId === conv.accountId).sort((a, b) => a.id - b.id);
  const agent = candidates.find(a => (a.channels as any[]).some(c => Number(c.inbox_id) === conv.inboxId && (!(c.stage_ids || []).length || (c.stage_ids as any[]).some(id => stages.has(Number(id))))));
  if (!agent) return null;
  const [session] = await db.insert(aiAgentSessions).values({ agentId: agent.id, conversationId: conv.id, contactId: conv.contactId }).onConflictDoNothing().returning();
  return session ? { agent, session } : null;
}

/** Áudio sem texto vira transcrição e imagem vira descrição (guardadas em messages.transcription). */
export async function enrichMedia(conversationId: number, settings: Settings) {
  const recent = await db.select().from(messages).where(and(eq(messages.conversationId, conversationId), eq(messages.senderType, 'Contact'))).orderBy(desc(messages.createdAt)).limit(5);
  for (const m of recent) {
    if (m.transcription) continue;
    const blob = await blobFor('Message', m.id, 'attachment');
    if (!blob) continue;
    const type = String(blob.contentType || '');
    try {
      if (type.startsWith('audio/') && settings.voice !== false) {
        const ext = blob.filename.includes('.') ? blob.filename.split('.').pop() : type.split('/').pop()!.split(';')[0];
        const t = await transcribeAudio(await downloadBlob(blob), `audio_${m.id}.${ext}`);
        if (t?.trim()) await db.update(messages).set({ transcription: t.trim() }).where(eq(messages.id, m.id));
      } else if (type.startsWith('image/') && settings.images !== false) {
        const t = await describeImage(await downloadBlob(blob), type);
        if (t) await db.update(messages).set({ transcription: `[imagem] ${t}` }).where(eq(messages.id, m.id));
      }
    } catch (e) { console.error(`Agente de IA: falha ao ler mídia da mensagem ${m.id}:`, (e as Error).message) }
  }
}

async function historyOf(conversationId: number): Promise<ChatMsg[]> {
  const rows = await db.select().from(messages).where(and(eq(messages.conversationId, conversationId), eq(messages.isPrivate, false))).orderBy(desc(messages.createdAt)).limit(20);
  return rows.reverse().map(m => {
    const text = [String(m.text || '').startsWith('📎') && m.transcription ? '' : m.text, m.transcription ? `(${m.transcription})` : ''].filter(Boolean).join(' ').trim() || '(mensagem sem texto)';
    return { role: m.senderType === 'Contact' ? 'user' : 'assistant', content: text } as ChatMsg;
  });
}

async function leadContext(contactId: number): Promise<LeadCtx> {
  const [c] = await db.select().from(contacts).where(eq(contacts.id, contactId));
  if (!c) return {};
  const st = await contactStages(contactId);
  const [u] = c.userId ? await db.select({ f: users.firstName, l: users.lastName }).from(users).where(eq(users.id, c.userId)) : [];
  const tg = await db.select({ n: tags.name }).from(contactTags).innerJoin(tags, eq(tags.id, contactTags.tagId)).where(eq(contactTags.contactId, contactId));
  return { contact: c, stage: st.map(s => `${s.pipeline} › ${s.name}`).join(', '), responsible: u ? `${u.f || ''} ${u.l || ''}`.trim() : undefined, tags: tg.map(t => t.n), fields: (c.customAttributes || {}) as Record<string, any> };
}

/** Executa um passo de FAÇA de verdade (nota, tarefa, campo, tags, etapa, responsável, robô, arquivo). */
function executor(agent: Agent, conv: Conv, lastText: string): Exec {
  const actor = `Agente de IA "${agent.name}"`;
  return async (_action, step, dados) => {
    const v = step.value || {};
    switch (step.type) {
      case 'add_task': await runBotAction(conv.contactId, conv.id, 'add_task', { titulo: v.titulo || 'Tarefa do agente de IA', tipo: v.tipo, deadline: v.deadline || 'now', user_id: v.user_id }, actor); return `Tarefa criada: ${v.titulo || ''}`;
      case 'set_field': {
        const key = String(v.field_key || ''); if (!key) return null;
        const value = v.value ? String(v.value) : String(dados[key] ?? dados[v.label] ?? Object.values(dados)[0] ?? lastText);
        await runBotAction(conv.contactId, conv.id, 'set_field', { field_key: key, value }, actor);
        return `Campo "${v.label || key}" = ${value}`;
      }
      case 'manage_tags': await runBotAction(conv.contactId, conv.id, 'manage_tags', { mode: v.mode, tag_ids: v.tag_ids || [] }, actor); return `Tags ${v.mode === 'remove' ? 'removidas' : 'adicionadas'}`;
      case 'change_stage': await runBotAction(conv.contactId, conv.id, 'move_stage', { target: v.target }, actor); return `Etapa alterada: ${v.label || v.target}`;
      case 'change_owner': await runBotAction(conv.contactId, conv.id, 'change_owner', { user_id: v.user_id }, actor); return 'Responsável alterado';
      case 'start_bot': if (v.flow_id) await startBot(Number(v.flow_id), conv.contactId, { conversationId: conv.id, trigger: 'ai_agent', force: true }); return `Robô iniciado: ${v.label || ''}`;
      case 'send_file': if (v.url) await sendAsBot(conv.id, conv.contactId, String(v.url)); return 'Arquivo enviado';
    }
    return null;
  };
}

async function logAi(agent: Agent, conv: Conv | null, kind: string, detail: Record<string, unknown>, tokens = 0, ms?: number) {
  await db.insert(aiAgentLogs).values({ agentId: agent.id, conversationId: conv?.id ?? null, contactId: conv?.contactId ?? null, kind, detail, tokens, responseMs: ms ?? null });
}

/** Passa a conversa pra equipe: sessão "transferida", responsável, tag com_atendente, nota e aviso. */
async function transfer(agent: Agent, session: typeof aiAgentSessions.$inferSelect, conv: Conv, reason: string, userId?: number | null) {
  await db.update(aiAgentSessions).set({ status: 'transferred', updatedAt: new Date(), meta: { ...(session.meta as object), transfer_reason: reason } }).where(eq(aiAgentSessions.id, session.id));
  const [c] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId));
  const target = userId || ((agent.settings as Settings).transfer_user_id ?? null) || c?.userId || conv.userId || null;
  await db.update(conversations).set({ userId: target, status: 0, unreadCount: sql`COALESCE(${conversations.unreadCount}, 0) + 1`, updatedAt: new Date() }).where(eq(conversations.id, conv.id));
  const tag = await findOrCreateTag(conv.accountId, 'com_atendente', '#3b82f6');
  await addConversationTag(conv.id, tag.id);
  await createMessage({ accountId: conv.accountId, conversationId: conv.id, senderType: 'User', senderId: null, text: `🤖 ${agent.name} transferiu a conversa para a equipe. Motivo: ${reason || '—'}`, isPrivate: true, status: messageStatusValue('sent') });
  await db.insert(notifications).values({ accountId: conv.accountId, title: `Agente de IA transferiu · ${c?.name || 'lead'}`, message: reason.slice(0, 250) || 'Conversa transferida para a equipe.', link: '/conversas' }).catch(() => {});
  broadcastConversations(conv.accountId, { event: 'conversation_updated', conversation: { id: conv.id, status: 'open', assignee_id: target } });
  broadcastConversations(conv.accountId, { event: 'conversation_tags_updated', conversation_id: conv.id, tags: await conversationTagsOf(conv.id) });
  void logEvent({ accountId: conv.accountId, contactId: conv.contactId, objectType: 'lead', objectName: c?.name, eventType: 'responsible_changed', before: c?.userId, after: target, meta: { agente_ia: agent.name } });
  await logAi(agent, conv, 'transfer', { reason, user_id: target });
}

/** Filtra as ações pelas condições que o CRM confere sozinho (horário, primeira vez, sem resposta). */
export function applicableActions(actions: AgentAction[], ctx: { firstTime: boolean; noReplyId?: string; now?: Date }) {
  return actions.filter(a => {
    if (ctx.noReplyId) return a.id === ctx.noReplyId;
    const checks = a.when.filter(w => ['first_time', 'hours', 'no_reply'].includes(w.type)).map(w => w.type === 'first_time' ? ctx.firstTime : w.type === 'hours' ? inHours(w.value, ctx.now) : false);
    const semantic = a.when.filter(w => !['first_time', 'hours', 'no_reply'].includes(w.type)).length;
    if (a.when.some(w => w.type === 'no_reply') && a.when.length === 1) return false; // só roda pelo relógio
    if (!checks.length) return true;
    if (a.logic === 'any') return checks.some(Boolean) || semantic > 0;
    return checks.every(Boolean);
  });
}

/** Responde a conversa (chamado depois do debounce da entrada de mensagens ou pelo relógio). */
export async function respond(conv: Conv, opts: { noReplyActionId?: string } = {}): Promise<boolean> {
  const found = await sessionFor(conv);
  if (!found) return false;
  const { agent, session } = found;
  if (!(await openaiApiKey())) { console.error('Agente de IA: chave da OpenAI não configurada.'); return false }
  const settings = (agent.settings || {}) as Settings;
  const started = Date.now();
  await enrichMedia(conv.id, settings);
  const history = await historyOf(conv.id);
  const lastClient = [...history].reverse().find(m => m.role === 'user');
  const query = history.filter(m => m.role === 'user').slice(-3).map(m => m.content).join(' ');
  const actions = applicableActions((agent.actions || []) as AgentAction[], { firstTime: session.replies === 0, noReplyId: opts.noReplyActionId });
  if (opts.noReplyActionId) history.push({ role: 'system', content: `O cliente não respondeu à última mensagem. Execute a ação ${opts.noReplyActionId} (chame aplicar_acao) e escreva a mensagem de retomada.` });
  const [inbox] = conv.inboxId ? await db.select().from(inboxes).where(eq(inboxes.id, conv.inboxId)) : [];
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, conv.contactId));
  if (inbox && contact?.jid) cache.write(`ai_is_replying_${inbox.id}_${contact.jid}`, true, 30);
  let r: RunResult;
  try {
    r = await runAgentTurn(agent, history, { actions, lead: await leadContext(conv.contactId), query, exec: executor(agent, conv, String(lastClient?.content || '')) });
  } catch (e) {
    await logAi(agent, conv, 'error', { message: (e as Error).message });
    console.error(`Agente de IA "${agent.name}" falhou:`, (e as Error).message);
    return false;
  }
  if (r.reply) await sendAsBot(conv.id, conv.contactId, r.reply);
  const replies = session.replies + (r.reply ? 1 : 0);
  await db.update(aiAgentSessions).set({ replies, updatedAt: new Date(), meta: { ...(session.meta as object), last_followup: opts.noReplyActionId ? `${opts.noReplyActionId}:${replies}` : (session.meta as any)?.last_followup } }).where(eq(aiAgentSessions.id, session.id));
  await logAi(agent, conv, 'reply', { ...r.details, reply: r.reply, voice: history.some(m => String(m.content).includes('(')), followup: opts.noReplyActionId || null }, r.tokens, Date.now() - started);
  for (const g of r.details.knowledge_gaps) await logAi(agent, conv, 'gap', { question: g });
  const limit = Number(settings.max_replies) || 0;
  if (r.transferred) await transfer(agent, { ...session, replies }, conv, r.transferReason || 'Pedido do cliente');
  else if (limit && replies >= limit) await transfer(agent, { ...session, replies }, conv, `Limite de ${limit} respostas do agente atingido`);
  return true;
}

// --- Automatize: "Iniciar / Parar agente de IA" e painel da conversa ------------------------------
export async function startAgentFor(contactId: number, agentId: number) {
  const [conv] = await db.select().from(conversations).where(eq(conversations.contactId, contactId)).orderBy(desc(conversations.lastActivityAt)).limit(1);
  if (!conv) return false;
  await db.update(aiAgentSessions).set({ status: 'stopped', updatedAt: new Date() }).where(and(eq(aiAgentSessions.conversationId, conv.id), eq(aiAgentSessions.status, 'active'), sql`${aiAgentSessions.agentId} <> ${agentId}`));
  await db.insert(aiAgentSessions).values({ agentId, conversationId: conv.id, contactId }).onConflictDoUpdate({ target: [aiAgentSessions.agentId, aiAgentSessions.conversationId], set: { status: 'active', updatedAt: new Date() } });
  return true;
}
export async function stopAgentsFor(contactId: number, agentId?: number | null) {
  const conds = [eq(aiAgentSessions.contactId, contactId), inArray(aiAgentSessions.status, ['active', 'paused'])];
  if (agentId) conds.push(eq(aiAgentSessions.agentId, agentId));
  await db.update(aiAgentSessions).set({ status: 'stopped', updatedAt: new Date() }).where(and(...conds));
}

// --- relógio: "Cliente não respondeu em X minutos" -------------------------------------------------
export async function tickAiAgents(now = new Date()) {
  const rows = await db.execute(sql`SELECT s.id, s.agent_id, s.conversation_id, s.replies, s.meta, a.actions,
      EXTRACT(EPOCH FROM ((now() AT TIME ZONE 'UTC') - l.created_at)) / 60 AS minutos
    FROM ai_agent_sessions s JOIN ai_agents a ON a.id = s.agent_id AND a.active
    JOIN LATERAL (SELECT sender_type, sender_id, created_at FROM messages WHERE conversation_id = s.conversation_id AND is_private = false ORDER BY created_at DESC LIMIT 1) l ON true
    WHERE s.status = 'active' AND l.sender_type = 'User' AND l.sender_id IS NULL AND l.created_at > (now() AT TIME ZONE 'UTC') - interval '24 hours'`) as unknown as any[];
  void now;
  for (const r of rows) {
    const act = (r.actions as AgentAction[]).find(a => a.when.some(w => w.type === 'no_reply' && Number(r.minutos) >= Number(w.value || 0)));
    if (!act) continue;
    if (r.meta?.last_followup === `${act.id}:${r.replies}`) continue; // já retomou depois desta resposta
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, Number(r.conversation_id)));
    if (conv) await respond(conv, { noReplyActionId: act.id }).catch(e => console.error('Agente de IA (sem resposta):', e.message));
  }
}

// --- ligação com a entrada de mensagens do WhatsApp -----------------------------------------------
setAiResponder(async (_inbox, conversation) => {
  const found = await sessionFor(conversation);
  if (!found) return;
  const delay = Math.max(0, Math.min(86400, Number((found.agent.persona as Persona).delay_seconds ?? 10)) - 8); // 8 s já esperados no debounce
  const [last] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.conversationId, conversation.id), eq(messages.senderType, 'Contact'))).orderBy(desc(messages.createdAt)).limit(1);
  if (delay) await new Promise(r => setTimeout(r, delay * 1000));
  const [still] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.conversationId, conversation.id), eq(messages.senderType, 'Contact'))).orderBy(desc(messages.createdAt)).limit(1);
  if (still && last && still.id !== last.id) return; // chegou mensagem nova: a próxima espera responde tudo junto
  await respond(conversation);
});

// a caixa "acorda" a IA quando algum agente ativo atende esse canal (além do ai_enabled antigo)
setAiInboxCheck(async (inboxId) => (await agentsForInbox(inboxId)).length > 0);
setAiAgentHooks({ start: (contactId, agentId) => (agentId ? startAgentFor(contactId, agentId) : Promise.resolve(false)), stop: (contactId, agentId) => stopAgentsFor(contactId, agentId) });
