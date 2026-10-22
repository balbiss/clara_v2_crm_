import { Router, type Request } from 'express';
import crypto from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accounts, jueriWebhookEvents } from '../db/schema.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';

// Webhook do Jueri (Configurações › Webhooks no painel do Jueri). Por enquanto a v2 só RECEBE e
// GUARDA cada evento (corpo + cabeçalhos) pra validar os campos; a sincronização vem depois.
// URL: POST /webhooks/jueri/:token (token único da conta). O campo "Chave" do Jueri assina o corpo
// no cabeçalho HTTP_SIGNATURE — conferimos com HMAC-SHA256 (hex ou base64) e anotamos se bateu.
export const jueriRouter = Router();
/* eslint-disable @typescript-eslint/no-explicit-any */

const HEADERS_GUARDADOS = ['signature', 'http-signature', 'http_signature', 'x-signature', 'x-hub-signature', 'x-jueri-signature', 'x-jueri-event', 'x-event', 'user-agent', 'content-type'];

/** Confere a assinatura do corpo com a chave: aceita HMAC-SHA256 em hex ou base64 (com ou sem "sha256="). */
export function assinaturaConfere(raw: Buffer | undefined, assinatura: string | undefined, chave: string | undefined): boolean | null {
  if (!assinatura || !chave || !raw) return null;
  const sig = assinatura.replace(/^sha256=/i, '').trim();
  const mac = crypto.createHmac('sha256', chave).update(raw);
  const hex = mac.digest('hex');
  const b64 = Buffer.from(hex, 'hex').toString('base64');
  return sig.toLowerCase() === hex || sig === b64;
}

/** Garante token da URL e chave de assinatura da conta (gerados uma vez). */
async function credenciais(accountId: number) {
  const [a] = await db.select({ token: accounts.jueriWebhookToken, settings: accounts.settings }).from(accounts).where(eq(accounts.id, accountId));
  let token = a?.token, chave = (a?.settings as any)?.jueri_webhook_key as string | undefined;
  if (!token || !chave) {
    token ||= crypto.randomBytes(18).toString('base64url');
    chave ||= crypto.randomBytes(24).toString('base64url');
    await db.update(accounts).set({ jueriWebhookToken: token, settings: sql`COALESCE(${accounts.settings}, '{}'::jsonb) || ${JSON.stringify({ jueri_webhook_key: chave })}::jsonb` }).where(eq(accounts.id, accountId));
  }
  return { token: token!, chave: chave! };
}

jueriRouter.post('/webhooks/jueri/:token', async (req: Request & { rawBody?: Buffer }, res) => {
  const [a] = await db.select({ id: accounts.id, settings: accounts.settings }).from(accounts).where(eq(accounts.jueriWebhookToken, String(req.params.token)));
  if (!a) return res.status(404).json({ status: 'not_found' });
  const headers: Record<string, string> = {};
  for (const h of HEADERS_GUARDADOS) { const v = req.headers[h]; if (v) headers[h] = Array.isArray(v) ? v.join(', ') : String(v) }
  const assinatura = headers['signature'] || headers['http-signature'] || headers['http_signature'] || headers['x-signature'] || headers['x-jueri-signature'];
  const body = (req.body && typeof req.body === 'object') ? req.body : { _bruto: req.rawBody?.toString('utf8') ?? '' };
  const event = String(body.event ?? body.evento ?? body.type ?? body.tipo ?? headers['x-jueri-event'] ?? headers['x-event'] ?? '').slice(0, 120) || null;
  await db.insert(jueriWebhookEvents).values({ accountId: a.id, event, payload: body, headers, signatureOk: assinaturaConfere(req.rawBody, assinatura, (a.settings as any)?.jueri_webhook_key) });
  res.json({ status: 'ok' });
});

// tela Configurações › Jueri: URL, chave e os últimos eventos recebidos
jueriRouter.get('/jueri/webhook', requireAuth, requireOwner, async (req, res) => {
  const accountId = req.user!.accountId!;
  const { token, chave } = await credenciais(accountId);
  const base = (process.env.PUBLIC_URL || process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const eventos = await db.select().from(jueriWebhookEvents).where(eq(jueriWebhookEvents.accountId, accountId)).orderBy(desc(jueriWebhookEvents.id)).limit(100);
  res.json({
    url: `${base}/webhooks/jueri/${token}`, chave,
    eventos: eventos.map(e => ({ id: e.id, event: e.event, payload: e.payload, headers: e.headers, signature_ok: e.signatureOk, created_at: e.createdAt.toISOString() })),
  });
});

jueriRouter.delete('/jueri/webhook/eventos', requireAuth, requireOwner, async (req, res) => {
  await db.delete(jueriWebhookEvents).where(eq(jueriWebhookEvents.accountId, req.user!.accountId!));
  res.status(204).end();
});
