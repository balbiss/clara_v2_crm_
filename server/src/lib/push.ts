import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pushSubscriptions } from '../db/schema.js';

// WebPushService da v1. Sem VAPID configurado, não faz nada.
const pub = process.env.VAPID_PUBLIC_KEY || '';
const priv = process.env.VAPID_PRIVATE_KEY || '';
if (pub && priv) webpush.setVapidDetails('mailto:' + (process.env.SMTP_USER || 'suporte@clarajoias.com.br'), pub, priv);

export const vapidPublicKey = () => pub;

export async function notifyUser(userId: number, msg: { title: string; body: string; url?: string; tag?: string }) {
  if (!pub || !priv) return;
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url ?? '/conversas', tag: msg.tag ?? 'crm' });
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dhKey, auth: s.authKey } }, payload);
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      else console.error('WebPush:', (e as Error).message);
    }
  }
}
