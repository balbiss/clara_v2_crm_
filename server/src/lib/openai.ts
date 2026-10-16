import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { globalSettings } from '../db/schema.js';

// Chamadas à OpenAI da v1 (resumo de conversa, transcrição sob demanda). Chave: global_settings
// 'openai_api_key' ou env OPENAI_API_KEY; transcrição prefere OPENAI_TRANSCRIBE_API_KEY (assim o
// botão "T" funciona sem acordar a IA de atendimento).
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

export async function chatCompletion(model: string, messages: { role: string; content: string }[], temperature: number): Promise<string | null> {
  const key = await openaiApiKey();
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? null;
}

export async function transcribeAudio(data: Buffer, filename: string): Promise<string | null> {
  const key = await transcriptionApiKey();
  const form = new FormData();
  form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe');
  form.append('language', 'pt');
  form.append('file', new Blob([new Uint8Array(data)]), filename);
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const json = await res.json() as { text?: string };
  return json.text ?? null;
}
