import { and, eq, isNull, max } from 'drizzle-orm';
import { db } from '../db/client.js';
import { inboxes, messages, conversations } from '../db/schema.js';
import { WahaService } from '../lib/waha.js';
import { cache } from '../lib/cache.js';
import { alreadyImported, handleMessage, type WahaPayload } from '../lib/wahaIngestion.js';

// WahaHistorySyncJob da v1: importa do WhatsApp o que não chegou pelo webhook (queda, deslogue,
// restart). Recorrente a cada 30 min cobrindo as últimas 3h, e disparado na reconexão.
const RECURRING_LOOKBACK = 3 * 3600;
const MAX_LOOKBACK = 7 * 24 * 3600;
const nowS = () => Math.floor(Date.now() / 1000);

export async function historySinceFor(inbox: typeof inboxes.$inferSelect): Promise<number> {
  const [r] = await db.select({ last: max(messages.createdAt) }).from(messages).innerJoin(conversations, eq(conversations.id, messages.conversationId)).where(eq(conversations.inboxId, inbox.id));
  return r?.last ? Math.floor(new Date(r.last).getTime() / 1000) - 3600 : nowS() - MAX_LOOKBACK;
}

export async function syncInboxHistory(inboxId: number | null = null, sinceEpoch: number | null = null) {
  const list = inboxId
    ? await db.select().from(inboxes).where(eq(inboxes.id, inboxId))
    : await db.select().from(inboxes).where(eq(inboxes.provider, 'waha'));
  let since = sinceEpoch ?? nowS() - RECURRING_LOOKBACK;
  since = Math.max(since, nowS() - MAX_LOOKBACK);
  for (const inbox of list) if (inbox.provider === 'waha') await syncInbox(inbox, since);
}

async function syncInbox(inbox: typeof inboxes.$inferSelect, since: number) {
  const service = new WahaService(inbox);
  if (cache.exist(`waha_full_history_lock_${inbox.id}`)) return 0; // importação completa em andamento
  if (!service.configured || !(await service.connected())) return 0;
  let imported = 0;
  for (const chat of await service.fetchRecentChats()) {
    if (Number(chat.timestamp) < since) break; // mais recente → mais antigo
    const idObj = chat.id as { _serialized?: string } | string | undefined;
    const chatId = (typeof idObj === 'object' ? idObj?._serialized : idObj) ?? '';
    if (!chatId || chatId === 'status@broadcast') continue;
    try {
      imported += await syncChat(inbox, service, chatId, since);
    } catch (e) { console.error(`[WahaHistorySync] inbox ${inbox.id} chat ${chatId}:`, (e as Error).message); }
  }
  console.log(`[WahaHistorySync] inbox ${inbox.id} (${inbox.name}) desde ${new Date(since * 1000).toISOString()}: ${imported} mensagens importadas`);
  return imported;
}

async function syncChat(inbox: typeof inboxes.$inferSelect, service: WahaService, chatId: string, since: number, limit = 100, mediaSince = since) {
  const msgs = (await service.fetchChatMessages(chatId, since, limit)) as WahaPayload[];
  let missing: WahaPayload[] = [];
  for (const m of msgs) {
    if (Number(m.timestamp) < since) continue;
    if (!String(m.body ?? '').trim() && !m.hasMedia) continue;
    if (await alreadyImported(inbox, m)) continue;
    missing.push(m);
  }
  if (!missing.length) return 0;
  // só pede pra WAHA baixar mídia quando realmente falta alguma mensagem com anexo
  if (missing.some(m => m.hasMedia && Number(m.timestamp) >= mediaSince)) {
    const withMedia = new Map(((await service.fetchChatMessages(chatId, mediaSince, 100, true)) as WahaPayload[]).map(m => [m.id, m]));
    missing = missing.map(m => withMedia.get(m.id) ?? m);
  }
  let n = 0;
  for (const p of missing.sort((a, b) => Number(a.timestamp) - Number(b.timestamp))) {
    try { if (await handleMessage(inbox, p, { historical: true })) n++; }
    catch (e) { console.error(`[WahaHistorySync] mensagem ${p.id}:`, (e as Error).message); }
  }
  return n;
}

// --- importação completa (uma vez por caixa, ao conectar) -----------------------------------------
// Puxa TODAS as conversas particulares do WhatsApp pro CRM (grupos ficam de fora, como no Kommo):
// até FULL_MSGS mensagens mais recentes de cada conversa; arquivos só dos últimos FULL_MEDIA_DAYS
// dias (o resto fica como "arquivo não baixado", pra não encher o armazenamento). Mensagem antiga
// nunca dispara robô, IA nem gatilho. Progresso em cache (inbox:ID:history) pra tela da caixa.
const FULL_CHATS = 5000;
const FULL_MSGS = 300;
const FULL_MEDIA_DAYS = 30;

export const historyProgress = (inboxId: number) => cache.read(`inbox:${inboxId}:history`) as { status: string; chats: number; total: number; mensagens: number } | null;

export async function importFullHistory(inboxId: number) {
  const lock = `waha_full_history_lock_${inboxId}`;
  if (cache.exist(lock)) return;
  cache.write(lock, true, 6 * 3600);
  const key = `inbox:${inboxId}:history`;
  try {
    const [inbox] = await db.select().from(inboxes).where(eq(inboxes.id, inboxId));
    if (!inbox || inbox.provider !== 'waha') return;
    const service = new WahaService(inbox);
    if (!service.configured || !(await service.connected())) return;
    const chats = (await service.fetchRecentChats(FULL_CHATS)).map(c => {
      const idObj = c.id as { _serialized?: string } | string | undefined;
      return (typeof idObj === 'object' ? idObj?._serialized : idObj) ?? '';
    }).filter(id => id && id !== 'status@broadcast' && !id.endsWith('@g.us') && !id.endsWith('@newsletter') && !id.endsWith('@broadcast'));
    const mediaSince = nowS() - FULL_MEDIA_DAYS * 86400;
    let mensagens = 0;
    cache.write(key, { status: 'importando', chats: 0, total: chats.length, mensagens }, 24 * 3600);
    console.log(`[WahaHistorico] inbox ${inbox.id} (${inbox.name}): importando ${chats.length} conversas`);
    for (const [i, chatId] of chats.entries()) {
      // WhatsApp caiu no meio: para sem marcar como feito — ao reconectar recomeça (o que já veio não duplica)
      if (i % 15 === 14 && !(await service.connected())) {
        cache.write(key, { status: 'pausado', chats: i, total: chats.length, mensagens }, 24 * 3600);
        console.log(`[WahaHistorico] inbox ${inbox.id}: WhatsApp desconectou, importação pausada em ${i}/${chats.length}`);
        return;
      }
      try { mensagens += await syncChat(inbox, service, chatId, 0, FULL_MSGS, mediaSince); }
      catch (e) { console.error(`[WahaHistorico] inbox ${inbox.id} chat ${chatId}:`, (e as Error).message); }
      cache.write(key, { status: 'importando', chats: i + 1, total: chats.length, mensagens }, 24 * 3600);
    }
    await db.update(inboxes).set({ historyImportedAt: new Date() }).where(eq(inboxes.id, inbox.id));
    cache.write(key, { status: 'concluido', chats: chats.length, total: chats.length, mensagens }, 7 * 24 * 3600);
    console.log(`[WahaHistorico] inbox ${inbox.id}: ${chats.length} conversas, ${mensagens} mensagens importadas`);
  } finally {
    cache.delete(lock);
  }
}

/** Caixas WhatsApp conectadas que ainda não tiveram a importação completa (ex.: conectadas antes disso existir). */
export async function importPendingHistories() {
  for (const inbox of await db.select().from(inboxes).where(and(eq(inboxes.provider, 'waha'), isNull(inboxes.historyImportedAt)))) {
    await importFullHistory(inbox.id).catch(e => console.error('[WahaHistorico]', (e as Error).message));
  }
}
