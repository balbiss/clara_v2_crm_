import { Router } from 'express';
import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { accounts, conversations, users } from '../db/schema.js';
import { requireAuth, requireOwner, roleName } from '../middleware/auth.js';
import { broadcastConversations } from '../lib/realtime.js';
import { triggerOnConversationClosed } from '../lib/salesbot.js';

// Configurações no padrão do Kommo: "Configurações de perfil" (o próprio usuário),
// "Configurações de trabalho" e "Configurações de chat" (só diretoria). As preferências ficam em
// accounts.settings (migration 0003); o que tem efeito real está ligado (fechar conversa
// automaticamente → job autoCloseConversations).
export const settingsRouter = Router();

export const DEFAULT_SETTINGS = {
  timezone: 'America/Sao_Paulo', country: 'BR', date_format: 'dd/mm/aaaa', time_format: '24h', currency: 'BRL',
  name_format: 'first_last', price_decimals: false, allowed_countries: ['BR'], group_chats: 'all',
  // chat
  auto_close: 'never', new_conversation: 'active_lead', slow_reply_minutes: 0,
};
export const AUTO_CLOSE_MS: Record<string, number> = { '1h': 3600_000, '1d': 86400_000, '3d': 3 * 86400_000, '1w': 7 * 86400_000 };
const ENUMS: Record<string, string[]> = {
  date_format: ['dd/mm/aaaa', 'mm/dd/aaaa', 'aaaa-mm-dd'], time_format: ['24h', '12h'], name_format: ['first_last', 'last_first'],
  group_chats: ['all', 'admins', 'none'], auto_close: ['never', '1h', '1d', '3d', '1w'], new_conversation: ['new_lead', 'active_lead', 'any_lead'],
};

const settingsOf = async (accountId: number) => {
  const [a] = await db.select({ id: accounts.id, name: accounts.name, s: accounts.settings }).from(accounts).where(eq(accounts.id, accountId));
  return { id: a.id, name: a.name, settings: { ...DEFAULT_SETTINGS, ...(a.s as object || {}) } };
};

settingsRouter.get('/workspace_settings', requireAuth, async (req, res) => res.json(await settingsOf(req.user!.accountId!)));

settingsRouter.put('/workspace_settings', requireAuth, requireOwner, async (req, res) => {
  const p = (req.body?.settings ?? {}) as Record<string, unknown>;
  const cur = (await settingsOf(req.user!.accountId!)).settings as Record<string, unknown>;
  const next: Record<string, unknown> = { ...cur };
  for (const [k, v] of Object.entries(p)) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    if (ENUMS[k] && !ENUMS[k].includes(String(v))) return res.status(422).json({ message: `Valor inválido para ${k}.` });
    if (k === 'allowed_countries') next[k] = Array.isArray(v) ? v.map(String).filter(Boolean) : cur[k];
    else if (k === 'price_decimals') next[k] = !!v;
    else if (k === 'slow_reply_minutes') next[k] = Math.max(0, Number(v) || 0);
    else next[k] = String(v);
  }
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : undefined;
  if (name === '') return res.status(422).json({ message: 'O nome da área de trabalho não pode ficar vazio.' });
  await db.update(accounts).set({ settings: next, ...(name ? { name } : {}), updatedAt: new Date() }).where(eq(accounts.id, req.user!.accountId!));
  res.json(await settingsOf(req.user!.accountId!));
});

// --- perfil do próprio usuário ------------------------------------------------------------------
settingsRouter.get('/profile', requireAuth, async (req, res) => {
  const u = req.user!;
  res.json({ id: u.id, first_name: u.firstName, last_name: u.lastName, email: u.email, phone: u.phone, role: roleName(u.role), permissions: u.permissions ?? {} });
});
settingsRouter.put('/profile', requireAuth, async (req, res) => {
  const p = req.body?.profile ?? {};
  const set: Record<string, unknown> = {};
  if ('first_name' in p) { if (!String(p.first_name).trim()) return res.status(422).json({ message: 'Informe o nome.' }); set.firstName = String(p.first_name).trim() }
  if ('last_name' in p) set.lastName = String(p.last_name ?? '').trim()
  if ('phone' in p) set.phone = String(p.phone ?? '').trim() || null
  const [u] = await db.update(users).set({ ...set, updatedAt: new Date() }).where(eq(users.id, req.user!.id)).returning();
  res.json({ id: u.id, first_name: u.firstName, last_name: u.lastName, email: u.email, phone: u.phone, role: roleName(u.role) });
});

/** "Fechar conversa automaticamente se a mensagem ainda não foi lida depois de…" (Configurações de chat). */
export async function autoCloseConversations() {
  const accs = await db.select({ id: accounts.id, s: accounts.settings }).from(accounts);
  for (const a of accs) {
    const ms = AUTO_CLOSE_MS[String((a.s as Record<string, unknown> || {}).auto_close || 'never')];
    if (!ms) continue;
    const limite = new Date(Date.now() - ms);
    const fechadas = await db.update(conversations).set({ status: 2, updatedAt: new Date() })
      .where(and(eq(conversations.accountId, a.id), eq(conversations.status, 0), sql`${conversations.unreadCount} > 0`, lt(conversations.lastActivityAt, limite)))
      .returning({ id: conversations.id });
    for (const c of fechadas) { broadcastConversations(a.id, { event: 'conversation_updated', conversation: { id: c.id, status: 'resolved' } }); void triggerOnConversationClosed(c.id).catch(() => {}) }
  }
}
