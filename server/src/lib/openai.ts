import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { globalSettings } from '../db/schema.js';

// Tudo de IA passa pela OpenAI: resumo de conversa, transcrição de áudio, descrição de imagem e o
// Agente de IA. Chave: global_settings 'openai_api_key' ou env OPENAI_API_KEY; transcrição prefere
// OPENAI_TRANSCRIBE_API_KEY (assim o botão "T" funciona sem acordar a IA de atendimento).
// 'openai_base_url' (ou env OPENAI_BASE_URL) troca o endereço — os testes usam uma OpenAI falsa local.
export async function globalSetting(key: string): Promise<string | null> {
  const [row] = await db.select({ value: globalSettings.value }).from(globalSettings).where(eq(globalSettings.key, key)).limit(1);
  return row?.value ?? null;
}

export async function openaiApiKey() {
  return (await globalSetting('openai_api_key')) || process.env.OPENAI_API_KEY || '';
}
export async function transcriptionApiKey() {
  return process.env.OPENAI_TRANSCRIBE_API_KEY || (await openaiApiKey());
}
async function baseUrl() {
  return ((await globalSetting('openai_base_url')) || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
}

export async function chatCompletion(model: string, messages: { role: string; content: string }[], temperature: number): Promise<string | null> {
  const key = await openaiApiKey();
  const res = await fetch(`${await baseUrl()}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? null;
}

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type ChatMsg = { role: 'system' | 'user' | 'assistant' | 'tool'; content: any; tool_calls?: ToolCall[]; tool_call_id?: string };

/** Chat com ferramentas (function calling) — usado pelo Agente de IA. Devolve a mensagem e os tokens. */
export async function chatWithTools(model: string, messages: ChatMsg[], tools: unknown[], opts: { temperature?: number; json?: boolean } = {}) {
  const key = await openaiApiKey();
  if (!key) throw new Error('Chave da OpenAI não configurada.');
  const body: Record<string, unknown> = { model, messages, temperature: opts.temperature ?? 0.4 };
  if (tools.length) body.tools = tools;
  if (opts.json) body.response_format = { type: 'json_object' };
  const res = await fetch(`${await baseUrl()}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[]; usage?: { total_tokens?: number } };
  const m = data.choices?.[0]?.message || {};
  return { content: m.content ?? null, toolCalls: m.tool_calls || [], tokens: data.usage?.total_tokens ?? 0 };
}

/** Descreve uma imagem recebida (vira o texto que o Agente de IA lê). */
export async function describeImage(data: Buffer, mimetype: string): Promise<string | null> {
  const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_AGENT_MODEL || 'gpt-4.1-mini';
  const url = `data:${mimetype};base64,${data.toString('base64')}`;
  const r = await chatWithTools(model, [
    { role: 'system', content: 'Descreva em português, em 1 a 3 frases objetivas, o que aparece na imagem enviada pelo cliente (produto, texto visível, comprovante, etc.).' },
    { role: 'user', content: [{ type: 'image_url', image_url: { url } }] },
  ], [], { temperature: 0.2 });
  return r.content?.trim() || null;
}

export async function transcribeAudio(data: Buffer, filename: string): Promise<string | null> {
  const key = await transcriptionApiKey();
  const form = new FormData();
  form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe');
  form.append('language', 'pt');
  form.append('file', new Blob([new Uint8Array(data)]), filename);
  const res = await fetch(`${await baseUrl()}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const json = await res.json() as { text?: string };
  return json.text ?? null;
}
