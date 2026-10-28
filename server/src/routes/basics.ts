import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, isNotNull, max, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tags, notifications, messageTemplates, pushSubscriptions, roundRobinGroups, users, contacts, inboxes, notes, agendamentos, conversations, tarefas, inboxMembers, salesTeamMemberships, internalMessages } from '../db/schema.js';
import { requireAuth, requireOwner, isFullPortfolio, roleName, roleValue, ROLES } from '../middleware/auth.js';
import { railsJson } from '../lib/serialize.js';
import { attach, blobFor, blobUrl, purge, blobsFor } from '../lib/storage.js';
import { avatarUrl } from '../lib/users.js';
import { vapidPublicKey } from '../lib/push.js';

// Controllers pequenos da v1 que a tela de Conversas (e outras) usam:
// Tags, Notifications, MessageTemplates, PushSubscriptions, Profile, RoundRobinGroups, Agents.
export const basicsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
const nf = (res: Response) => res.status(404).json({ error: 'not_found' });
const acc = (req: Request) => req.user!.accountId!;
const utf8 = (name: string) => Buffer.from(name, 'latin1').toString('utf8');

// --- Tags ---------------------------------------------------------------------------------------
basicsRouter.get('/tags', requireAuth, async (req, res) => {
  res.json((await db.select().from(tags).where(eq(tags.accountId, acc(req))).orderBy(asc(tags.name))).map(t => railsJson(t)));
});
basicsRouter.post('/tags', requireAuth, requireOwner, async (req, res) => {
  const p = req.body.tag ?? {};
  if (!p.name) return res.status(422).json({ name: ["can't be blank"] });
  const [dup] = await db.select({ id: tags.id }).from(tags).where(and(eq(tags.accountId, acc(req)), eq(tags.name, p.name)));
  if (dup) return res.status(422).json({ name: ['has already been taken'] });
  const [t] = await db.insert(tags).values({ accountId: acc(req), name: p.name, color: p.color || '#6b7280' }).returning();
  res.status(201).json(railsJson(t));
});
async function updateTag(req: Request, res: Response) {
  const p = req.body.tag ?? {};
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if ('name' in p) set.name = p.name;
  if ('color' in p) set.color = p.color;
  const [t] = await db.update(tags).set(set).where(and(eq(tags.accountId, acc(req)), eq(tags.id, Number(req.params.id)))).returning();
  if (!t) return nf(res);
  res.json(railsJson(t));
}
basicsRouter.put('/tags/:id', requireAuth, requireOwner, updateTag);
basicsRouter.patch('/tags/:id', requireAuth, requireOwner, updateTag);
basicsRouter.delete('/tags/:id', requireAuth, requireOwner, async (req, res) => {
  const [t] = await db.select().from(tags).where(and(eq(tags.accountId, acc(req)), eq(tags.id, Number(req.params.id))));
  if (!t) return nf(res);
  await db.execute(sql`DELETE FROM conversation_tags WHERE tag_id = ${t.id}`);
  await db.execute(sql`DELETE FROM contact_tags WHERE tag_id = ${t.id}`);
  await db.delete(tags).where(eq(tags.id, t.id));
  res.status(204).end();
});

// --- Notificações (sino) ------------------------------------------------------------------------
const visibleNotifications = (req: Request) => {
  const audiences = isFullPortfolio(req.user!) ? sql`(${notifications.audience} IS NULL OR ${notifications.audience} = 'owner_level')` : isNull(notifications.audience);
  return and(eq(notifications.accountId, acc(req)), audiences);
};
basicsRouter.get('/notifications', requireAuth, async (req, res) => {
  const unread = await db.select().from(notifications).where(and(visibleNotifications(req), isNull(notifications.readAt))).orderBy(desc(notifications.createdAt));
  const read = await db.select().from(notifications).where(and(visibleNotifications(req), isNotNull(notifications.readAt))).orderBy(desc(notifications.createdAt)).limit(5);
  res.json({ unread: unread.map(n => railsJson(n)), read: read.map(n => railsJson(n)), unread_count: unread.length });
});
basicsRouter.put('/notifications/mark_all_read', requireAuth, async (req, res) => {
  await db.update(notifications).set({ readAt: new Date() }).where(and(visibleNotifications(req), isNull(notifications.readAt)));
  res.json({ message: 'Todas marcadas como lidas' });
});
basicsRouter.put('/notifications/:id/mark_as_read', requireAuth, async (req, res) => {
  const [n] = await db.update(notifications).set({ readAt: new Date() }).where(and(visibleNotifications(req), eq(notifications.id, Number(req.params.id)))).returning();
  if (!n) return nf(res);
  res.json({ message: 'Marcada como lida' });
});

// --- Modelos de mensagem (usados com "/" na conversa) ---------------------------------------
async function serializeTemplate(t: typeof messageTemplates.$inferSelect) {
  const b = await blobFor('MessageTemplate', t.id, 'attachment');
  return { ...railsJson(t), attachment_url: b ? blobUrl(b) : null, attachment_type: b?.contentType ?? null };
}
basicsRouter.get('/message_templates', requireAuth, async (req, res) => {
  const rows = await db.select().from(messageTemplates).where(eq(messageTemplates.accountId, acc(req))).orderBy(asc(messageTemplates.nome));
  const atts = await blobsFor('MessageTemplate', rows.map(r => r.id), 'attachment');
  res.json(rows.map(t => { const b = atts.get(t.id)?.[0]; return { ...railsJson(t), attachment_url: b ? blobUrl(b) : null, attachment_type: b?.contentType ?? null }; }));
});
// FormData vem como message_template[nome] etc.
const tplField = (body: Record<string, unknown>, k: string) => {
  const nested = body.message_template as Record<string, unknown> | undefined;
  return nested?.[k] ?? body[`message_template[${k}]`];
};
basicsRouter.post('/message_templates', requireAuth, requireOwner, upload.single('message_template[attachment]'), async (req, res) => {
  const nome = tplField(req.body, 'nome') as string | undefined;
  const mensagem = tplField(req.body, 'mensagem') as string | undefined;
  if (!nome) return res.status(422).json({ nome: ["can't be blank"] });
  if (!mensagem && !req.file) return res.status(422).json({ mensagem: ["can't be blank"] });
  const [t] = await db.insert(messageTemplates).values({ accountId: acc(req), nome, mensagem: mensagem ?? '', categoria: (tplField(req.body, 'categoria') as string) || null }).returning();
  if (req.file) await attach('MessageTemplate', t.id, 'attachment', req.file.buffer, utf8(req.file.originalname), req.file.mimetype);
  res.status(201).json(await serializeTemplate(t));
});
async function updateTemplate(req: Request, res: Response) {
  const [t] = await db.select().from(messageTemplates).where(and(eq(messageTemplates.accountId, acc(req)), eq(messageTemplates.id, Number(req.params.id))));
  if (!t) return nf(res);
  if (String(tplField(req.body, 'remove_attachment')) === 'true') await purge('MessageTemplate', t.id, 'attachment');
  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ['nome', 'categoria', 'mensagem']) { const v = tplField(req.body, k); if (v !== undefined) set[k] = v; }
  if (req.file) { await purge('MessageTemplate', t.id, 'attachment'); await attach('MessageTemplate', t.id, 'attachment', req.file.buffer, utf8(req.file.originalname), req.file.mimetype); }
  const hasAtt = !!(await blobFor('MessageTemplate', t.id, 'attachment'));
  if (('nome' in set && !set.nome) ) return res.status(422).json({ nome: ["can't be blank"] });
  if ('mensagem' in set && !set.mensagem && !hasAtt) return res.status(422).json({ mensagem: ["can't be blank"] });
  const [u] = await db.update(messageTemplates).set(set).where(eq(messageTemplates.id, t.id)).returning();
  res.json(await serializeTemplate(u));
}
basicsRouter.put('/message_templates/:id', requireAuth, requireOwner, upload.single('message_template[attachment]'), updateTemplate);
basicsRouter.patch('/message_templates/:id', requireAuth, requireOwner, upload.single('message_template[attachment]'), updateTemplate);
basicsRouter.delete('/message_templates/:id', requireAuth, requireOwner, async (req, res) => {
  const [t] = await db.select().from(messageTemplates).where(and(eq(messageTemplates.accountId, acc(req)), eq(messageTemplates.id, Number(req.params.id))));
  if (!t) return nf(res);
  await purge('MessageTemplate', t.id, 'attachment');
  await db.delete(messageTemplates).where(eq(messageTemplates.id, t.id));
  res.status(204).end();
});

// --- Push --------------------------------------------------------------------------------------
basicsRouter.get('/push_subscriptions/vapid_public_key', requireAuth, (_req, res) => res.json({ vapid_public_key: vapidPublicKey() }));
basicsRouter.post('/push_subscriptions', requireAuth, async (req, res) => {
  try {
    await db.insert(pushSubscriptions).values({ userId: req.user!.id, endpoint: req.body.endpoint, p256dhKey: req.body.p256dh, authKey: req.body.auth })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: req.user!.id, p256dhKey: req.body.p256dh, authKey: req.body.auth, updatedAt: new Date() } });
    res.status(200).end();
  } catch (e) { res.status(422).json({ error: (e as Error).message }); }
});
basicsRouter.delete('/push_subscriptions/unsubscribe', requireAuth, async (req, res) => {
  const endpoint = req.body?.endpoint ?? req.query.endpoint;
  if (endpoint) await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, req.user!.id), eq(pushSubscriptions.endpoint, String(endpoint))));
  res.status(200).end();
});

// --- Foto de perfil ----------------------------------------------------------------------------
basicsRouter.patch('/profile/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(422).json({ error: 'Nenhuma imagem enviada.' });
  await purge('User', req.user!.id, 'avatar');
  await attach('User', req.user!.id, 'avatar', req.file.buffer, utf8(req.file.originalname), req.file.mimetype);
  res.json({ avatar_url: await avatarUrl(req.user!.id) });
});
basicsRouter.delete('/profile/avatar', requireAuth, async (req, res) => {
  await purge('User', req.user!.id, 'avatar');
  res.json({ avatar_url: null });
});

// --- Grupos de rodízio -------------------------------------------------------------------------
basicsRouter.get('/round_robin_groups', requireAuth, requireOwner, async (req, res) => {
  res.json((await db.select().from(roundRobinGroups).where(eq(roundRobinGroups.accountId, acc(req))).orderBy(asc(roundRobinGroups.name))).map(g => railsJson(g)));
});
basicsRouter.post('/round_robin_groups', requireAuth, requireOwner, async (req, res) => {
  const name = req.body.round_robin_group?.name;
  if (!name) return res.status(422).json({ name: ["can't be blank"] });
  const [g] = await db.insert(roundRobinGroups).values({ accountId: acc(req), name }).returning();
  res.status(201).json(railsJson(g));
});
async function updateGroup(req: Request, res: Response) {
  const name = req.body.round_robin_group?.name;
  if (name !== undefined && !name) return res.status(422).json({ name: ["can't be blank"] });
  const [g] = await db.update(roundRobinGroups).set({ ...(name ? { name } : {}), updatedAt: new Date() }).where(and(eq(roundRobinGroups.accountId, acc(req)), eq(roundRobinGroups.id, Number(req.params.id)))).returning();
  if (!g) return nf(res);
  res.json(railsJson(g));
}
basicsRouter.put('/round_robin_groups/:id', requireAuth, requireOwner, updateGroup);
basicsRouter.patch('/round_robin_groups/:id', requireAuth, requireOwner, updateGroup);
basicsRouter.delete('/round_robin_groups/:id', requireAuth, requireOwner, async (req, res) => {
  const id = Number(req.params.id);
  const [g] = await db.select().from(roundRobinGroups).where(and(eq(roundRobinGroups.accountId, acc(req)), eq(roundRobinGroups.id, id)));
  if (!g) return nf(res);
  await db.update(users).set({ roundRobinGroupId: null }).where(eq(users.roundRobinGroupId, id));
  await db.update(inboxes).set({ roundRobinGroupId: null }).where(eq(inboxes.roundRobinGroupId, id));
  await db.delete(roundRobinGroups).where(eq(roundRobinGroups.id, id));
  res.status(204).end();
});

// --- Agentes (usuários da equipe) ----------------------------------------------------------------
type UserRow = typeof users.$inferSelect;
const HIDDEN = ['encrypted_password', 'jti', 'reset_password_token'];
const agentJson = (u: UserRow, avatar?: string | null) => ({ ...railsJson(u, HIDDEN), role: roleName(u.role), ...(avatar !== undefined ? { avatar_url: avatar } : {}) });

async function loadAgent(req: Request, res: Response): Promise<UserRow | null> {
  const [u] = await db.select().from(users).where(and(eq(users.accountId, acc(req)), eq(users.id, Number(req.params.id))));
  if (!u) { nf(res); return null; }
  return u;
}

const AGENT_FIELDS: Record<string, keyof typeof users.$inferInsert> = {
  first_name: 'firstName', last_name: 'lastName', email: 'email', phone: 'phone', status: 'status',
  department: 'department', round_robin_group_id: 'roundRobinGroupId', jueri_gerente_id: 'jueriGerenteId', permissions: 'permissions',
};
async function agentParams(body: Record<string, unknown>) {
  const p = (body.agent ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(AGENT_FIELDS)) if (k in p) out[col] = col === 'roundRobinGroupId' ? (p[k] ? Number(p[k]) : null) : p[k];
  if (typeof out.email === 'string') out.email = out.email.trim().toLowerCase();
  if (p.password) {
    if (String(p.password).length < 6) throw new Error('password:is too short (minimum is 6 characters)');
    out.encryptedPassword = await bcrypt.hash(String(p.password), 12);
  }
  if (p.role) {
    if (!ROLES.includes(p.role as typeof ROLES[number])) throw new RangeError(`Perfil inválido. Use: ${ROLES.join(', ')}.`);
    out.role = roleValue(String(p.role));
  }
  return out;
}

basicsRouter.get('/agents', requireAuth, async (req, res) => {
  const rows = await db.select().from(users).where(eq(users.accountId, acc(req))).orderBy(desc(users.createdAt));
  const avatars = await blobsFor('User', rows.map(r => r.id), 'avatar');
  res.json(rows.map(u => { const b = avatars.get(u.id)?.[0]; return agentJson(u, b ? blobUrl(b) : null); }));
});
basicsRouter.get('/agents/queue', requireAuth, async (req, res) => {
  const rows = await db.select().from(users).where(and(eq(users.accountId, acc(req)), eq(users.status, 'active'), eq(users.availableForRoundrobin, true)))
    .orderBy(sql`${users.queuePosition} ASC NULLS FIRST`, asc(users.id));
  res.json(rows.map(u => ({ id: u.id, first_name: u.firstName, last_name: u.lastName, queue_position: u.queuePosition })));
});
basicsRouter.get('/agents/:id', requireAuth, async (req, res) => {
  const u = await loadAgent(req, res);
  if (u) res.json(agentJson(u, await avatarUrl(u.id)));
});

function handleAgentError(res: Response, e: unknown) {
  if (e instanceof RangeError) return res.status(422).json({ error: e.message });
  const msg = (e as Error).message;
  if (msg.startsWith('password:')) return res.status(422).json({ password: [msg.slice(9)] });
  if (/users_email|index_users_on_email/.test(msg) || (e as { code?: string }).code === '23505') return res.status(422).json({ email: ['has already been taken'] });
  return res.status(422).json({ error: msg });
}

basicsRouter.post('/agents', requireAuth, requireOwner, async (req, res) => {
  try {
    const v = await agentParams(req.body);
    if (!v.email) return res.status(422).json({ email: ["can't be blank"] });
    if (!v.encryptedPassword) return res.status(422).json({ password: ["can't be blank"] });
    const [u] = await db.insert(users).values({ role: 0, ...v, accountId: acc(req), jti: crypto.randomUUID() } as typeof users.$inferInsert).returning();
    // (e-mail de boas-vindas da v1 depende de SMTP — entra junto com a configuração de e-mail)
    res.status(201).json(agentJson(u));
  } catch (e) { handleAgentError(res, e); }
});
async function updateAgent(req: Request, res: Response) {
  const u = await loadAgent(req, res);
  if (!u) return;
  try {
    const v = await agentParams(req.body);
    const [updated] = await db.update(users).set({ ...v, updatedAt: new Date() }).where(eq(users.id, u.id)).returning();
    res.json(agentJson(updated));
  } catch (e) { handleAgentError(res, e); }
}
basicsRouter.put('/agents/:id', requireAuth, requireOwner, updateAgent);
basicsRouter.patch('/agents/:id', requireAuth, requireOwner, updateAgent);
basicsRouter.patch('/agents/:id/block', requireAuth, requireOwner, async (req, res) => {
  const u = await loadAgent(req, res);
  if (!u) return;
  await db.update(users).set({ status: 'blocked', updatedAt: new Date() }).where(eq(users.id, u.id));
  res.json({ message: 'Agent blocked' });
});
basicsRouter.patch('/agents/:id/unblock', requireAuth, requireOwner, async (req, res) => {
  const u = await loadAgent(req, res);
  if (!u) return;
  await db.update(users).set({ status: 'active', updatedAt: new Date() }).where(eq(users.id, u.id));
  res.json({ message: 'Agent unblocked' });
});
basicsRouter.patch('/agents/:id/toggle_roundrobin', requireAuth, requireOwner, async (req, res) => {
  const u = await loadAgent(req, res);
  if (!u) return;
  let updated: UserRow;
  if (u.availableForRoundrobin) {
    [updated] = await db.update(users).set({ availableForRoundrobin: false, queuePosition: null }).where(eq(users.id, u.id)).returning();
  } else {
    const [{ m }] = await db.select({ m: max(users.queuePosition) }).from(users).where(and(eq(users.accountId, acc(req)), eq(users.availableForRoundrobin, true)));
    [updated] = await db.update(users).set({ availableForRoundrobin: true, queuePosition: (m ?? 0) + 1 }).where(eq(users.id, u.id)).returning();
  }
  res.json(agentJson(updated));
});
basicsRouter.post('/agents/:id/assign_unassigned_by_gerente', requireAuth, requireOwner, async (req, res) => {
  const u = await loadAgent(req, res);
  if (!u) return;
  if (!u.jueriGerenteId) return res.status(422).json({ error: 'sem_gerente_id', message: 'Esse agente não tem "ID do Gerente no Jueri" preenchido.' });
  // pode ter mais de um gerente do Jueri (ex.: Geovana = Vendas 6 e Vendas 10): "522041, 613730"
  const ids = String(u.jueriGerenteId).split(/[,;\s]+/).filter(Boolean);
  const where = and(eq(contacts.accountId, acc(req)), isNull(contacts.userId), inArray(sql`${contacts.customAttributes} ->> 'gerente_jueri_id'`, ids));
  // update_all na v1 (sem callbacks)
  const updated = await db.update(contacts).set({ userId: u.id }).where(where).returning({ id: contacts.id });
  res.json({ assigned_count: updated.length });
});
basicsRouter.delete('/agents/:id', requireAuth, requireOwner, async (req, res) => {
  const u = await loadAgent(req, res);
  if (!u) return;
  try {
    await db.transaction(async tx => {
      await tx.delete(notes).where(eq(notes.userId, u.id));
      await tx.update(contacts).set({ userId: null }).where(eq(contacts.userId, u.id));
      await tx.update(tarefas).set({ userId: null }).where(eq(tarefas.userId, u.id));
      await tx.delete(agendamentos).where(eq(agendamentos.userId, u.id));
      await tx.update(conversations).set({ userId: null }).where(eq(conversations.userId, u.id));
      await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, u.id));
      await tx.delete(inboxMembers).where(eq(inboxMembers.userId, u.id));
      await tx.delete(salesTeamMemberships).where(eq(salesTeamMemberships.userId, u.id));
      await tx.delete(internalMessages).where(or(eq(internalMessages.senderId, u.id), eq(internalMessages.recipientId, u.id)));
      await tx.delete(users).where(eq(users.id, u.id));
    });
    await purge('User', u.id, 'avatar');
    res.status(204).end();
  } catch (e) {
    // mesmo comportamento da v1: usuário com histórico (chat interno, auditoria) não pode ser apagado
    res.status(422).json({ error: 'Não foi possível remover: esse usuário tem histórico vinculado. Bloqueie em vez de remover.' });
  }
});

