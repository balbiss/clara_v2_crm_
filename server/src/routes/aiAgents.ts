import { Router, type Request } from 'express';
import multer from 'multer';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { aiAgentLogs, aiAgents, aiAgentSessions, aiAgentSources, contacts, conversations, flows, globalSettings, inboxes, pipelineStages, pipelines, tags, users } from '../db/schema.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { chatWithTools, openaiApiKey, type ChatMsg } from '../lib/openai.js';
import { DO_LABELS, MODEL, WHEN_LABELS, applicableActions, runAgentTurn, type AgentAction } from '../lib/aiAgent.js';
import { allFieldsOf } from '../lib/customFields.js';

// Agente de IA (menu "Agente de IA", igual ao Kommo): lista de agentes, gerar agente pelo site ou
// pelas informações da empresa, editor (Fontes, Ações, Persona, Configurações, Painel), Modo de teste
// e o painel "Agentes de IA ativos" da conversa. Só a diretoria cria/edita/ativa (admin no Kommo).
export const aiAgentsRouter = Router();
aiAgentsRouter.use(['/ai_agents', '/ai_agent_sources', '/ai_sessions', '/ai_settings'], requireAuth);
const acc = (req: Request) => req.user!.accountId!;
const num = (v: unknown) => Number(v) || 0;
/* eslint-disable @typescript-eslint/no-explicit-any */

const LIMITS = { actions: 20, when: 5, do: 5, role: 1500, guidelines: 50, guideline: 300 };
const TONES = ['casual', 'friendly', 'professional'], LENGTHS = ['short', 'medium', 'long'];

/** Limpa e confere o que vem do editor (mesmos limites do Kommo). Devolve erro em texto ou os valores. */
export function cleanAgentInput(b: any): { error?: string; values?: Record<string, any> } {
  const v: Record<string, any> = {};
  if (b.name !== undefined) { if (!String(b.name).trim()) return { error: 'Dê um nome ao agente.' }; v.name = String(b.name).trim().slice(0, 80) }
  if (b.persona !== undefined) {
    const p = b.persona || {};
    if (String(p.role || '').length > LIMITS.role) return { error: `"Papel e personalidade" aceita até ${LIMITS.role} caracteres.` };
    const guidelines = (Array.isArray(p.guidelines) ? p.guidelines : []).map((g: any) => String(g).trim()).filter(Boolean);
    if (guidelines.length > LIMITS.guidelines) return { error: `Até ${LIMITS.guidelines} diretrizes.` };
    if (guidelines.some((g: string) => g.length > LIMITS.guideline)) return { error: `Cada diretriz aceita até ${LIMITS.guideline} caracteres.` };
    const delay = Math.round(Number(p.delay_seconds ?? 10));
    if (!(delay >= 1 && delay <= 86400)) return { error: 'O atraso antes de responder vai de 1 a 86.400 segundos.' };
    v.persona = { role: String(p.role || ''), tone: TONES.includes(p.tone) ? p.tone : 'friendly', length: LENGTHS.includes(p.length) ? p.length : 'medium', language: String(p.language || 'auto'), delay_seconds: delay, guidelines };
  }
  if (b.actions !== undefined) {
    const list = Array.isArray(b.actions) ? b.actions : [];
    if (list.length > LIMITS.actions) return { error: `Cada agente aceita até ${LIMITS.actions} ações.` };
    const out: AgentAction[] = [];
    for (const [i, a] of list.entries()) {
      const when = (a.when || []).filter((w: any) => WHEN_LABELS[w?.type]);
      const doo = (a.do || []).filter((d: any) => DO_LABELS[d?.type]);
      if (when.length > LIMITS.when) return { error: `Ação ${i + 1}: até ${LIMITS.when} condições em QUANDO.` };
      if (doo.length > LIMITS.do) return { error: `Ação ${i + 1}: até ${LIMITS.do} passos em FAÇA.` };
      if (!when.length) return { error: `Ação ${i + 1}: escolha pelo menos uma condição em QUANDO.` };
      if (!doo.length) return { error: `Ação ${i + 1}: escolha pelo menos um passo em FAÇA.` };
      for (const w of when) if (w.type === 'no_reply' && !(num(w.value) >= 1 && num(w.value) <= 1439)) return { error: `Ação ${i + 1}: "Cliente não respondeu em" vai de 1 minuto a 23 h 59 min.` };
      out.push({ id: String(a.id || `a${i + 1}`).slice(0, 20), name: String(a.name || '').slice(0, 80), logic: a.logic === 'any' ? 'any' : 'all', when, do: doo, more: String(a.more || '').slice(0, 1000) });
    }
    if (new Set(out.map(a => a.id)).size !== out.length) out.forEach((a, i) => { a.id = `a${i + 1}` });
    v.actions = out;
  }
  if (b.settings !== undefined) {
    const s = b.settings || {};
    v.settings = { voice: s.voice !== false, images: s.images !== false, max_replies: Math.max(0, Math.round(num(s.max_replies))), transfer_user_id: s.transfer_user_id ? num(s.transfer_user_id) : null, transfer_message: String(s.transfer_message || '').slice(0, 500), model: s.model ? String(s.model).slice(0, 60) : undefined };
  }
  if (b.channels !== undefined) {
    v.channels = (Array.isArray(b.channels) ? b.channels : []).filter((c: any) => num(c?.inbox_id)).map((c: any) => ({ inbox_id: num(c.inbox_id), stage_ids: (c.stage_ids || []).map(num).filter(Boolean) }));
  }
  return { values: v };
}

async function loadAgent(req: Request) {
  const [a] = await db.select().from(aiAgents).where(and(eq(aiAgents.id, num(req.params.id)), eq(aiAgents.accountId, acc(req))));
  return a ?? null;
}
const fmt = (a: typeof aiAgents.$inferSelect, extra: Record<string, any> = {}) => ({
  id: a.id, name: a.name, active: a.active, persona: a.persona, actions: a.actions, settings: a.settings, channels: a.channels,
  created_at: a.createdAt.toISOString(), updated_at: a.updatedAt.toISOString(), ...extra,
});

/** Etapas em que outro agente ativo já atende no mesmo canal (cada etapa lança só um agente). */
async function conflicts(accountId: number, agentId: number, channels: any[]) {
  const others = await db.select().from(aiAgents).where(and(eq(aiAgents.accountId, accountId), eq(aiAgents.active, true), sql`${aiAgents.id} <> ${agentId}`));
  const out: string[] = [];
  for (const c of channels) for (const o of others) for (const oc of o.channels as any[]) {
    if (Number(oc.inbox_id) !== Number(c.inbox_id)) continue;
    const a = (c.stage_ids || []) as number[], b = (oc.stage_ids || []) as number[];
    if (!a.length || !b.length || a.some(x => b.includes(x))) out.push(o.name);
  }
  return [...new Set(out)];
}

// --- lista ---------------------------------------------------------------------------------------
aiAgentsRouter.get('/ai_agents', async (req, res) => {
  const list = await db.select().from(aiAgents).where(eq(aiAgents.accountId, acc(req))).orderBy(asc(aiAgents.id));
  const ids = list.map(a => a.id);
  const usage = ids.length ? await db.select({ agentId: aiAgentLogs.agentId, tokens: sql<number>`COALESCE(SUM(${aiAgentLogs.tokens}), 0)::int`, replies: sql<number>`COUNT(*) FILTER (WHERE ${aiAgentLogs.kind} = 'reply')::int` }).from(aiAgentLogs).where(inArray(aiAgentLogs.agentId, ids)).groupBy(aiAgentLogs.agentId) : [];
  const um = new Map(usage.map(u => [u.agentId, u]));
  const ibx = await db.select({ id: inboxes.id, name: inboxes.name }).from(inboxes).where(eq(inboxes.accountId, acc(req)));
  const im = new Map(ibx.map(i => [i.id, i.name]));
  res.json(list.map(a => {
    const u = um.get(a.id);
    return fmt(a, { channel_names: [...new Set((a.channels as any[]).map(c => im.get(Number(c.inbox_id))).filter(Boolean))], tokens_used: u?.tokens ?? 0, replies: u?.replies ?? 0, tokens_per_reply: u?.replies ? Math.round(u.tokens / u.replies) : null });
  }));
});

aiAgentsRouter.get('/ai_agents/options', async (req, res) => {
  const a = acc(req);
  const [ibx, pips, stages, us, tg, fl, fields] = await Promise.all([
    db.select({ id: inboxes.id, name: inboxes.name }).from(inboxes).where(eq(inboxes.accountId, a)),
    db.select({ id: pipelines.id, name: pipelines.name, system: pipelines.system }).from(pipelines).where(eq(pipelines.accountId, a)).orderBy(asc(pipelines.position)),
    db.select({ id: pipelineStages.id, name: pipelineStages.name, pipeline_id: pipelineStages.pipelineId, position: pipelineStages.position }).from(pipelineStages).innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId)).where(eq(pipelines.accountId, a)).orderBy(asc(pipelineStages.position)),
    db.select({ id: users.id, first_name: users.firstName, last_name: users.lastName }).from(users).where(and(eq(users.accountId, a), sql`COALESCE(${users.status}, 'active') = 'active'`)),
    db.select({ id: tags.id, name: tags.name }).from(tags).where(eq(tags.accountId, a)),
    db.select({ id: flows.id, name: flows.name }).from(flows).where(and(eq(flows.accountId, a), eq(flows.kind, 'salesbot'))),
    allFieldsOf(a).catch(() => [] as any[]),
  ]);
  res.json({
    inboxes: ibx, users: us.map(u => ({ id: u.id, name: `${u.first_name || ''} ${u.last_name || ''}`.trim() })), tags: tg, bots: fl,
    pipelines: pips.filter(p => !p.system).map(p => ({ ...p, stages: stages.filter(s => s.pipeline_id === p.id) })),
    fields: [{ key: 'name', label: 'Nome' }, { key: 'email', label: 'E-mail' }, ...(fields as any[]).filter(f => !['name', 'email'].includes(f.key)).map(f => ({ key: f.key, label: f.label || f.name || f.key }))],
    when_types: WHEN_LABELS, do_types: DO_LABELS,
  });
});

// --- criar / gerar -------------------------------------------------------------------------------
const DEFAULT_PERSONA = { role: '', tone: 'friendly', length: 'medium', language: 'auto', delay_seconds: 10, guidelines: [] as string[] };
aiAgentsRouter.post('/ai_agents', requireOwner, async (req, res) => {
  const { error, values } = cleanAgentInput({ name: req.body?.name || 'Agente de IA', persona: req.body?.persona || DEFAULT_PERSONA, actions: req.body?.actions || [], settings: req.body?.settings || {}, channels: req.body?.channels || [] });
  if (error) return res.status(422).json({ error });
  const [a] = await db.insert(aiAgents).values({ accountId: acc(req), ...values } as any).returning();
  res.status(201).json(fmt(a));
});

/** Texto legível de uma página (sem tags/scripts), pra virar fonte do agente. */
export async function fetchSiteText(url: string) {
  if (!/^https?:\/\//i.test(url)) throw new Error('Informe um endereço que comece com http:// ou https://');
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (CRM Clara; agente de IA)' } });
  if (!r.ok) throw new Error(`O site respondeu ${r.status}.`);
  const html = await r.text();
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || url;
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  return { title: title.slice(0, 120), text: text.slice(0, 20000) };
}

// "Construir meu Agente de IA": a OpenAI monta nome, persona, diretrizes e ações iniciais
aiAgentsRouter.post('/ai_agents/generate', requireOwner, async (req, res) => {
  const b = req.body || {};
  if (!(await openaiApiKey())) return res.status(422).json({ error: 'Configure a chave da OpenAI em Agente de IA › Chave da OpenAI antes de gerar.' });
  let info = '', source: { title: string; content: string; kind: string; url?: string } | null = null;
  try {
    if (b.mode === 'site') { const s = await fetchSiteText(String(b.url || '')); info = s.text; source = { title: s.title, content: s.text, kind: 'url', url: String(b.url) } }
    else {
      if (!String(b.description || '').trim()) return res.status(422).json({ error: 'Descreva o que sua empresa faz.' });
      info = `${b.description}\n\n${b.details || ''}`.trim(); source = { title: 'Informações da empresa', content: info, kind: 'text' };
    }
  } catch (e) { return res.status(422).json({ error: (e as Error).message }) }
  try {
    const r = await chatWithTools(MODEL(), [
      { role: 'system', content: 'Você configura agentes de atendimento por WhatsApp. Responda só com JSON: {"name": string curto, "role": "papel e personalidade (até 600 caracteres, em português)", "tone": "casual|friendly|professional", "guidelines": [até 6 regras curtas], "actions": [até 3 objetos {"name": string, "when": [{"type": "wants|asks_about|provides|contains", "value": string}], "do": [{"type": "transfer|ask_for|reply_info|bring_up|dont_mention", "value": string}]}]}. Inclua sempre uma ação para quando o cliente quiser falar com uma pessoa (transfer).' },
      { role: 'user', content: info.slice(0, 12000) },
    ], [], { json: true, temperature: 0.3 });
    const g = JSON.parse(r.content || '{}');
    const actions = (Array.isArray(g.actions) ? g.actions : []).slice(0, 5).map((a: any, i: number) => ({ id: `a${i + 1}`, name: a.name, logic: 'any', when: (a.when || []).slice(0, 5), do: (a.do || []).map((d: any) => d.type === 'transfer' ? { type: 'transfer', value: {} } : d).slice(0, 5), more: '' }));
    const { error, values } = cleanAgentInput({ name: g.name || 'Agente de IA', persona: { ...DEFAULT_PERSONA, role: String(g.role || '').slice(0, 1500), tone: g.tone, guidelines: (g.guidelines || []).slice(0, 10) }, actions, settings: {}, channels: [] });
    if (error) return res.status(422).json({ error });
    const [agent] = await db.insert(aiAgents).values({ accountId: acc(req), ...values } as any).returning();
    if (source) await db.insert(aiAgentSources).values({ agentId: agent.id, ...source });
    await db.insert(aiAgentLogs).values({ agentId: agent.id, kind: 'generate', tokens: r.tokens, detail: { mode: b.mode } });
    res.status(201).json(fmt(agent));
  } catch (e) {
    console.error('Gerar agente de IA falhou:', (e as Error).message);
    res.status(502).json({ error: 'A IA não conseguiu gerar o agente agora. Tente de novo ou comece do zero.' });
  }
});

// --- um agente -----------------------------------------------------------------------------------
aiAgentsRouter.get('/ai_agents/:id(\\d+)', async (req, res) => {
  const a = await loadAgent(req); if (!a) return res.status(404).json({ error: 'Agente não encontrado.' });
  const sources = await db.select().from(aiAgentSources).where(eq(aiAgentSources.agentId, a.id)).orderBy(asc(aiAgentSources.id));
  res.json(fmt(a, { sources: sources.map(s => ({ id: s.id, kind: s.kind, title: s.title, content: s.content, url: s.url, chars: s.content.length, updated_at: s.updatedAt.toISOString() })) }));
});

aiAgentsRouter.put('/ai_agents/:id(\\d+)', requireOwner, async (req, res) => {
  const a = await loadAgent(req); if (!a) return res.status(404).json({ error: 'Agente não encontrado.' });
  const { error, values } = cleanAgentInput(req.body || {});
  if (error) return res.status(422).json({ error });
  const active = req.body?.active === undefined ? a.active : !!req.body.active;
  const channels = values!.channels ?? (a.channels as any[]);
  if (active && !channels.length) return res.status(422).json({ error: 'sem_canal', message: 'Conecte pelo menos um canal e escolha as etapas antes de ligar o agente.' });
  if (active) { const c = await conflicts(a.accountId, a.id, channels); if (c.length) return res.status(422).json({ error: 'etapa_ocupada', message: `Cada etapa lança só um agente. Já atendem nesse canal/etapa: ${c.join(', ')}.` }) }
  const [u] = await db.update(aiAgents).set({ ...values, active, updatedAt: new Date() } as any).where(eq(aiAgents.id, a.id)).returning();
  // desligar o agente encerra as sessões dele (Kommo: "Turn off agent")
  if (a.active && !active) await db.update(aiAgentSessions).set({ status: 'stopped', updatedAt: new Date() }).where(and(eq(aiAgentSessions.agentId, a.id), inArray(aiAgentSessions.status, ['active', 'paused'])));
  res.json(fmt(u));
});

aiAgentsRouter.post('/ai_agents/:id(\\d+)/duplicate', requireOwner, async (req, res) => {
  const a = await loadAgent(req); if (!a) return res.status(404).json({ error: 'Agente não encontrado.' });
  const [c] = await db.insert(aiAgents).values({ accountId: a.accountId, name: `${a.name} (cópia)`.slice(0, 80), active: false, persona: a.persona, actions: a.actions, settings: a.settings, channels: a.channels }).returning();
  const srcs = await db.select().from(aiAgentSources).where(eq(aiAgentSources.agentId, a.id));
  if (srcs.length) await db.insert(aiAgentSources).values(srcs.map(s => ({ agentId: c.id, kind: s.kind, title: s.title, content: s.content, url: s.url })));
  res.status(201).json(fmt(c));
});

aiAgentsRouter.delete('/ai_agents/:id(\\d+)', requireOwner, async (req, res) => {
  const a = await loadAgent(req); if (!a) return res.status(404).json({ error: 'Agente não encontrado.' });
  await db.delete(aiAgents).where(eq(aiAgents.id, a.id));
  res.status(204).end();
});

// --- Fontes --------------------------------------------------------------------------------------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
aiAgentsRouter.post('/ai_agents/:id(\\d+)/sources', requireOwner, upload.single('file'), async (req, res) => {
  const a = await loadAgent(req); if (!a) return res.status(404).json({ error: 'Agente não encontrado.' });
  const b = req.body || {};
  const kind = ['text', 'faq', 'url', 'file'].includes(b.kind) ? b.kind : 'text';
  let title = String(b.title || '').trim(), content = '', url: string | null = null;
  try {
    if (kind === 'url') { const s = await fetchSiteText(String(b.url || '')); url = String(b.url); title ||= s.title; content = s.text }
    else if (kind === 'file') {
      if (!req.file) return res.status(422).json({ error: 'Escolha um arquivo.' });
      if (!/^(text\/|application\/(json|csv))/.test(req.file.mimetype) && !/\.(txt|md|csv|json)$/i.test(req.file.originalname)) return res.status(422).json({ error: 'Use um arquivo de texto (.txt, .md, .csv ou .json).' });
      title ||= req.file.originalname; content = req.file.buffer.toString('utf8').slice(0, 60000);
    } else if (kind === 'faq') {
      const pairs = (Array.isArray(b.pairs) ? b.pairs : JSON.parse(b.pairs || '[]')).filter((p: any) => String(p.q || '').trim() && String(p.a || '').trim());
      if (!pairs.length) return res.status(422).json({ error: 'Adicione pelo menos uma pergunta com resposta.' });
      content = pairs.map((p: any) => `Pergunta: ${String(p.q).trim()}\nResposta: ${String(p.a).trim()}`).join('\n\n');
      title ||= 'Perguntas e respostas';
    } else content = String(b.content || '').trim();
  } catch (e) { return res.status(422).json({ error: (e as Error).message }) }
  if (!content) return res.status(422).json({ error: 'A fonte está vazia.' });
  if (!title) return res.status(422).json({ error: 'Dê um título à fonte.' });
  const [s] = await db.insert(aiAgentSources).values({ agentId: a.id, kind, title: title.slice(0, 120), content, url }).returning();
  await db.update(aiAgents).set({ updatedAt: new Date() }).where(eq(aiAgents.id, a.id));
  res.status(201).json({ id: s.id, kind: s.kind, title: s.title, content: s.content, url: s.url, chars: s.content.length });
});

async function loadSource(req: Request) {
  const [s] = await db.select({ s: aiAgentSources }).from(aiAgentSources).innerJoin(aiAgents, eq(aiAgents.id, aiAgentSources.agentId)).where(and(eq(aiAgentSources.id, num(req.params.id)), eq(aiAgents.accountId, acc(req))));
  return s?.s ?? null;
}
aiAgentsRouter.put('/ai_agent_sources/:id(\\d+)', requireOwner, async (req, res) => {
  const s = await loadSource(req); if (!s) return res.status(404).json({ error: 'Fonte não encontrada.' });
  const title = req.body?.title !== undefined ? String(req.body.title).trim().slice(0, 120) : s.title;
  const content = req.body?.content !== undefined ? String(req.body.content).trim() : s.content;
  if (!title || !content) return res.status(422).json({ error: 'Título e conteúdo são obrigatórios.' });
  const [u] = await db.update(aiAgentSources).set({ title, content, updatedAt: new Date() }).where(eq(aiAgentSources.id, s.id)).returning();
  res.json({ id: u.id, kind: u.kind, title: u.title, content: u.content, url: u.url, chars: u.content.length });
});
aiAgentsRouter.post('/ai_agent_sources/:id(\\d+)/sync', requireOwner, async (req, res) => {
  const s = await loadSource(req); if (!s) return res.status(404).json({ error: 'Fonte não encontrada.' });
  if (s.kind !== 'url' || !s.url) return res.status(422).json({ error: 'Só fontes de site podem ser sincronizadas.' });
  try { const t = await fetchSiteText(s.url); await db.update(aiAgentSources).set({ content: t.text, updatedAt: new Date() }).where(eq(aiAgentSources.id, s.id)); res.json({ ok: true, chars: t.text.length }) }
  catch (e) { res.status(422).json({ error: (e as Error).message }) }
});
aiAgentsRouter.delete('/ai_agent_sources/:id(\\d+)', requireOwner, async (req, res) => {
  const s = await loadSource(req); if (!s) return res.status(404).json({ error: 'Fonte não encontrada.' });
  await db.delete(aiAgentSources).where(eq(aiAgentSources.id, s.id));
  res.status(204).end();
});

// --- Modo de teste -------------------------------------------------------------------------------
aiAgentsRouter.post('/ai_agents/:id(\\d+)/test', async (req, res) => {
  const a = await loadAgent(req); if (!a) return res.status(404).json({ error: 'Agente não encontrado.' });
  if (!(await openaiApiKey())) return res.status(422).json({ error: 'Configure a chave da OpenAI para usar o Modo de teste.' });
  const hist: ChatMsg[] = (Array.isArray(req.body?.messages) ? req.body.messages : []).slice(-20)
    .map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) }) as ChatMsg);
  if (!hist.length || hist[hist.length - 1].role !== 'user') return res.status(422).json({ error: 'Envie uma mensagem para testar.' });
  const firstTime = hist.filter((m: ChatMsg) => m.role === 'assistant').length === 0;
  const actions = applicableActions((a.actions || []) as AgentAction[], { firstTime });
  try {
    const r = await runAgentTurn(a, hist, { actions, lead: {}, query: hist.filter((m: ChatMsg) => m.role === 'user').slice(-3).map((m: ChatMsg) => String(m.content)).join(' '), exec: async () => null, dry: true });
    await db.insert(aiAgentLogs).values({ agentId: a.id, kind: 'test', tokens: r.tokens, detail: r.details });
    res.json({ reply: r.reply, transferred: r.transferred, tokens: r.tokens, details: r.details });
  } catch (e) {
    res.status(502).json({ error: `A IA não respondeu: ${(e as Error).message}` });
  }
});

aiAgentsRouter.post('/ai_agents/:id(\\d+)/icebreakers', async (req, res) => {
  const a = await loadAgent(req); if (!a) return res.status(404).json({ error: 'Agente não encontrado.' });
  const srcs = await db.select({ t: aiAgentSources.title, c: aiAgentSources.content }).from(aiAgentSources).where(eq(aiAgentSources.agentId, a.id));
  if (!srcs.length || !(await openaiApiKey())) return res.json({ icebreakers: ['Oi! Como funciona?', 'Quais são os valores?', 'Quero falar com uma pessoa'] });
  try {
    const r = await chatWithTools(MODEL(), [{ role: 'system', content: 'Escreva 3 perguntas curtas (até 60 caracteres) que um cliente faria pelo WhatsApp a esta empresa. Responda só JSON {"perguntas": [..]}.' }, { role: 'user', content: srcs.map(s => `${s.t}\n${s.c}`).join('\n\n').slice(0, 6000) }], [], { json: true, temperature: 0.6 });
    const p = JSON.parse(r.content || '{}').perguntas;
    res.json({ icebreakers: Array.isArray(p) && p.length ? p.slice(0, 3).map(String) : ['Oi! Como funciona?', 'Quais são os valores?', 'Quero falar com uma pessoa'] });
  } catch { res.json({ icebreakers: ['Oi! Como funciona?', 'Quais são os valores?', 'Quero falar com uma pessoa'] }) }
});

// --- Painel do agente (últimos 7 dias) -------------------------------------------------------------
aiAgentsRouter.get('/ai_agents/:id(\\d+)/dashboard', async (req, res) => {
  const a = await loadAgent(req); if (!a) return res.status(404).json({ error: 'Agente não encontrado.' });
  const since = sql`(now() AT TIME ZONE 'UTC') - interval '7 days'`;
  const [st] = await db.execute(sql`SELECT
      COUNT(DISTINCT contact_id) FILTER (WHERE kind = 'reply')::int unique_leads,
      COUNT(DISTINCT conversation_id) FILTER (WHERE kind = 'reply')::int answered,
      COUNT(*) FILTER (WHERE kind = 'gap')::int gaps,
      COUNT(*) FILTER (WHERE kind = 'transfer')::int transfers,
      COALESCE(AVG(response_ms) FILTER (WHERE kind = 'reply'), 0)::int avg_ms,
      COUNT(DISTINCT contact_id) FILTER (WHERE kind = 'reply' AND EXTRACT(ISODOW FROM created_at - interval '3 hours') >= 6)::int weekend_leads,
      COUNT(DISTINCT conversation_id) FILTER (WHERE kind = 'reply' AND EXTRACT(ISODOW FROM created_at - interval '3 hours') >= 6)::int weekend_conversations,
      COALESCE(SUM(tokens) FILTER (WHERE kind = 'reply' AND NOT COALESCE((detail->>'voice')::boolean, false)), 0)::int tokens_text,
      COALESCE(SUM(tokens) FILTER (WHERE kind = 'reply' AND COALESCE((detail->>'voice')::boolean, false)), 0)::int tokens_voice,
      COALESCE(SUM(tokens) FILTER (WHERE kind = 'test'), 0)::int tokens_test
    FROM ai_agent_logs WHERE agent_id = ${a.id} AND created_at >= ${since}`) as unknown as any[];
  const canais = await db.execute(sql`SELECT COALESCE(i.name, 'Sem canal') nome, COUNT(DISTINCT l.conversation_id)::int n FROM ai_agent_logs l
    LEFT JOIN conversations c ON c.id = l.conversation_id LEFT JOIN inboxes i ON i.id = c.inbox_id
    WHERE l.agent_id = ${a.id} AND l.kind = 'reply' AND l.created_at >= ${since} GROUP BY 1 ORDER BY 2 DESC`) as unknown as any[];
  const gaps = await db.execute(sql`SELECT detail->>'question' pergunta, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') em FROM ai_agent_logs WHERE agent_id = ${a.id} AND kind = 'gap' ORDER BY created_at DESC LIMIT 10`) as unknown as any[];
  res.json({ ...st, handover_rate: st.answered ? Math.round((st.transfers / st.answered) * 100) : 0, por_canal: canais, lacunas: gaps });
});

// --- painel "Agentes de IA ativos" da conversa --------------------------------------------------------
aiAgentsRouter.get('/ai_sessions', async (req, res) => {
  const contactId = num(req.query.contact_id);
  const [c] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.accountId, acc(req))));
  if (!c) return res.json([]);
  const rows = await db.select({ s: aiAgentSessions, agent: aiAgents.name, inbox: inboxes.name }).from(aiAgentSessions)
    .innerJoin(aiAgents, eq(aiAgents.id, aiAgentSessions.agentId)).innerJoin(conversations, eq(conversations.id, aiAgentSessions.conversationId))
    .leftJoin(inboxes, eq(inboxes.id, conversations.inboxId))
    .where(and(eq(aiAgentSessions.contactId, contactId), inArray(aiAgentSessions.status, ['active', 'paused']))).orderBy(desc(aiAgentSessions.updatedAt));
  res.json(rows.map(r => ({ id: r.s.id, agent_id: r.s.agentId, agent_name: r.agent, conversation_id: r.s.conversationId, inbox_name: r.inbox, status: r.s.status, replies: r.s.replies })));
});
aiAgentsRouter.put('/ai_sessions/:id(\\d+)', async (req, res) => {
  const status = String(req.body?.status || '');
  if (!['active', 'paused', 'stopped'].includes(status)) return res.status(422).json({ error: 'Status inválido.' });
  const [s] = await db.select({ s: aiAgentSessions }).from(aiAgentSessions).innerJoin(aiAgents, eq(aiAgents.id, aiAgentSessions.agentId)).where(and(eq(aiAgentSessions.id, num(req.params.id)), eq(aiAgents.accountId, acc(req))));
  if (!s) return res.status(404).json({ error: 'Sessão não encontrada.' });
  if (s.s.status === 'stopped' || s.s.status === 'transferred') return res.status(422).json({ error: 'Esse agente já foi parado nesta conversa.' });
  await db.update(aiAgentSessions).set({ status, updatedAt: new Date() }).where(eq(aiAgentSessions.id, s.s.id));
  res.json({ id: s.s.id, status });
});
aiAgentsRouter.post('/ai_sessions/stop_all', async (req, res) => {
  const contactId = num(req.body?.contact_id);
  const [c] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.accountId, acc(req))));
  if (!c) return res.status(404).json({ error: 'Lead não encontrado.' });
  await db.update(aiAgentSessions).set({ status: 'stopped', updatedAt: new Date() }).where(and(eq(aiAgentSessions.contactId, contactId), inArray(aiAgentSessions.status, ['active', 'paused'])));
  res.status(204).end();
});

// --- chave da OpenAI (vale para tudo de IA do CRM) -----------------------------------------------------
aiAgentsRouter.get('/ai_settings', async (_req, res) => {
  const key = await openaiApiKey();
  res.json({ has_key: !!key, key_hint: key ? `${key.slice(0, 3)}…${key.slice(-4)}` : null, model: MODEL() });
});
aiAgentsRouter.put('/ai_settings', requireOwner, async (req, res) => {
  const key = String(req.body?.openai_api_key || '').trim();
  if (!/^sk-[A-Za-z0-9_\-]{20,}$/.test(key)) return res.status(422).json({ error: 'Chave inválida — ela começa com "sk-".' });
  await db.insert(globalSettings).values({ key: 'openai_api_key', value: key } as any).onConflictDoUpdate({ target: globalSettings.key, set: { value: key, updatedAt: new Date() } as any });
  res.json({ has_key: true, key_hint: `${key.slice(0, 3)}…${key.slice(-4)}` });
});
