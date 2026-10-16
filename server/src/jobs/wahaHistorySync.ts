import { eq, max } from 'drizzle-orm';
import { db } from '../db/client.js';
import { inboxes, messages, conversations } from '../db/schema.js';
import { WahaService } from '../lib/waha.js';
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

async function syncChat(inbox: typeof inboxes.$inferSelect, service: WahaService, chatId: string, since: number) {
  const msgs = (await service.fetchChatMessages(chatId, since)) as WahaPayload[];
  let missing: WahaPayload[] = [];
  for (const m of msgs) {
    if (Number(m.timestamp) < since) continue;
    if (!String(m.body ?? '').trim() && !m.hasMedia) continue;
    if (await alreadyImported(inbox, m)) continue;
    missing.push(m);
  }
  if (!missing.length) return 0;
  // só pede pra WAHA baixar mídia quando realmente falta alguma mensagem com anexo
  if (missing.some(m => m.hasMedia)) {
    const withMedia = new Map(((await service.fetchChatMessages(chatId, since, 100, true)) as WahaPayload[]).map(m => [m.id, m]));
    missing = missing.map(m => withMedia.get(m.id) ?? m);
  }
  let n = 0;
  for (const p of missing.sort((a, b) => Number(a.timestamp) - Number(b.timestamp))) {
    try { if (await handleMessage(inbox, p, { historical: true })) n++; }
    catch (e) { console.error(`[WahaHistorySync] mensagem ${p.id}:`, (e as Error).message); }
  }
  return n;
}
