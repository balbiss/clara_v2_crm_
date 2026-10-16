import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { inboxes } from '../db/schema.js';
import { handleMessage, type WahaPayload } from '../lib/wahaIngestion.js';
import { cache } from '../lib/cache.js';
import { broadcastConversations } from '../lib/realtime.js';
import { historySinceFor, syncInboxHistory } from '../jobs/wahaHistorySync.js';

// Webhooks::WahaController da v1. A caixa vem por ?inbox_id= (não pelo telefone).
// Na v2, se WAHA_WEBHOOK_SECRET estiver definido, exige ?secret= igual (a v1 não tinha trava).
export const webhooksRouter = Router();

webhooksRouter.post('/webhooks/waha', async (req, res) => {
  const secret = process.env.WAHA_WEBHOOK_SECRET;
  if (secret && req.query.secret !== secret) return res.status(401).json({ status: 'unauthorized' });
  const [inbox] = await db.select().from(inboxes).where(and(eq(inboxes.id, Number(req.query.inbox_id)), eq(inboxes.provider, 'waha'))).limit(1);
  if (!inbox) return res.json({ status: 'ignored' });
  const event = req.body?.event;
  const payload = (req.body?.payload ?? {}) as Record<string, unknown>;
  try {
    if (event === 'message.any') await handleMessage(inbox, payload as WahaPayload);
    else if (event === 'session.status') handleSessionStatus(inbox, payload);
    res.json({ status: 'ok' });
  } catch (e) {
    console.error('Waha webhook error:', (e as Error).message);
    res.status(500).json({ status: 'error', message: (e as Error).message });
  }
});

function handleSessionStatus(inbox: typeof inboxes.$inferSelect, payload: Record<string, unknown>) {
  const status = payload.status as string | undefined;
  if (!status) return;
  const open = status === 'WORKING';
  cache.write(`inbox:${inbox.id}:status`, open ? 'open' : 'close');
  broadcastConversations(inbox.accountId!, { event: 'inbox_updated', inbox_id: inbox.id, connection_status: open ? 'open' : 'close', qr_code: null });

  // reconectou: importa o que foi conversado pelo celular enquanto o CRM não recebia (2 rodadas)
  const lock = `waha_history_sync_lock_${inbox.id}`;
  if (open && !cache.exist(lock)) {
    cache.write(lock, true, 10 * 60);
    void historySinceFor(inbox).then(since => {
      setTimeout(() => syncInboxHistory(inbox.id, since).catch(e => console.error('[WahaHistorySync]', e.message)), 60 * 1000);
      setTimeout(() => syncInboxHistory(inbox.id, since).catch(e => console.error('[WahaHistorySync]', e.message)), 5 * 60 * 1000);
    });
  }
}
