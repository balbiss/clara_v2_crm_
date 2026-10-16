import { Router, type Request, type Response } from 'express';
import { and, asc, desc, eq, gte, inArray, isNotNull, max, min, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts, resellerPhones, pedidos, agendamentos, conversations, messages, notes, tags, contactTags, contactAuditEvents, users, accounts, contactFieldGroups } from '../db/schema.js';
import { requireAuth, requireOwner, requireFullPortfolio, isFullPortfolio, isFinance, isOwner, visibleContactsWhere } from '../middleware/auth.js';
import { createContact, updateContact, searchByNameOrPhoneWhere, channelIdentifier, type Contact } from '../lib/contacts.js';
import { deleteContactCascade } from '../lib/wahaIngestion.js';
import { cache } from '../lib/cache.js';
import { railsJson } from '../lib/serialize.js';

// ContactsController + ContactTagsController + ContactFieldGroupsController + ContactCustomFieldsController da v1.
export const contactsRouter = Router();
contactsRouter.use(['/contacts', '/contact_field_groups', '/contact_custom_fields'], requireAuth);

const USER_HIDDEN = ['encrypted_password', 'jti', 'reset_password_token'];
const acc = (req: Request) => req.user!.accountId!;
const TODAY = sql`(now() AT TIME ZONE 'America/Sao_Paulo')::date`;

/** Pedido.open_now (aberto na data de hoje, sem status terminal 3/4). */
const pedidoOpenNow = and(
  sql`${pedidos.dataCriacao} <= ${TODAY}`,
  sql`(${pedidos.dataBaixa} IS NULL OR ${pedidos.dataBaixa} > ${TODAY})`,
  sql`(${pedidos.dataCancelamento} IS NULL OR ${pedidos.dataCancelamento} > ${TODAY})`,
  sql`${pedidos.statusId} NOT IN (3, 4)`,
)!;

async function loadContact(req: Request, res: Response, key = 'id'): Promise<Contact | null> {
  const [c] = await db.select().from(contacts).where(and(await visibleContactsWhere(req.user!), eq(contacts.id, Number(req.params[key])))).limit(1);
  if (!c) { res.status(404).json({ error: 'not_found', message: 'Contato não encontrado ou fora da sua carteira.' }); return null; }
  return c;
}

async function phonesOf(ids: number[]) {
  const rows = ids.length ? await db.select().from(resellerPhones).where(inArray(resellerPhones.contactId, ids)) : [];
  const m = new Map<number, Record<string, unknown>[]>();
  for (const r of rows) { const l = m.get(r.contactId) ?? []; l.push(railsJson(r)); m.set(r.contactId, l); }
  return m;
}

const toMap = <K, V>(rows: { k: K; v: V }[]) => new Map(rows.map(r => [r.k, r.v]));

// GET /contacts — carteira visível (sem desconsiderados), com métricas agregadas sem N+1
contactsRouter.get('/contacts', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(200, Math.max(1, Number(req.query.per_page) || 50));
  const conds = [await visibleContactsWhere(req.user!), eq(contacts.desconsiderado, false)];
  if (req.query.q) { const w = searchByNameOrPhoneWhere(String(req.query.q)); if (w) conds.push(w); }
  const rows = await db.select().from(contacts).where(and(...conds)).orderBy(desc(contacts.createdAt)).offset((page - 1) * perPage).limit(perPage);
  const ids = rows.map(r => r.id);
  if (!ids.length) return res.json([]);

  const [phones, valores, tempo, primeiro, proximos, ultimas, previstas] = await Promise.all([
    phonesOf(ids),
    db.select({ k: pedidos.contactId, v: sql<string>`sum(${pedidos.valorTotal})` }).from(pedidos).where(and(pedidoOpenNow, inArray(pedidos.contactId, ids))).groupBy(pedidos.contactId),
    db.select({ k: pedidos.contactId, v: sql<number>`count(DISTINCT DATE_TRUNC('month', ${pedidos.dataBaixa}))::int` }).from(pedidos).where(and(inArray(pedidos.contactId, ids), isNotNull(pedidos.dataBaixa))).groupBy(pedidos.contactId),
    db.select({ k: pedidos.contactId, v: min(pedidos.dataCriacao) }).from(pedidos).where(inArray(pedidos.contactId, ids)).groupBy(pedidos.contactId),
    db.select({ k: agendamentos.contactId, v: min(agendamentos.inicioEm) }).from(agendamentos).where(and(inArray(agendamentos.contactId, ids), gte(agendamentos.inicioEm, new Date()))).groupBy(agendamentos.contactId),
    db.select({ k: conversations.contactId, v: max(conversations.lastActivityAt) }).from(conversations).where(inArray(conversations.contactId, ids)).groupBy(conversations.contactId),
    db.select({ k: pedidos.contactId, v: min(pedidos.dataAcerto) }).from(pedidos).where(and(pedidoOpenNow, inArray(pedidos.contactId, ids), isNotNull(pedidos.dataAcerto))).groupBy(pedidos.contactId),
  ]);
  const vMap = toMap(valores), tMap = toMap(tempo), pMap = toMap(primeiro), proxMap = toMap(proximos), uMap = toMap(ultimas), prevMap = toMap(previstas);
  res.json(rows.map(c => ({
    ...railsJson(c), reseller_phones: phones.get(c.id) ?? [],
    valor_aberto: Number(vMap.get(c.id) ?? 0), tempo_revenda_meses: tMap.get(c.id) ?? 0, primeiro_pedido_em: pMap.get(c.id) ?? null,
    proximo_agendamento_em: proxMap.get(c.id) ?? null, ultima_interacao_em: uMap.get(c.id) ?? null, data_prevista_acerto: prevMap.get(c.id) ?? null,
  })));
});

contactsRouter.get('/contacts/:id', async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  const c = await loadContact(req, res);
  if (!c) return;
  const convs = await db.select().from(conversations).where(eq(conversations.contactId, c.id));
  const msgs = convs.length ? await db.select().from(messages).where(inArray(messages.conversationId, convs.map(x => x.id))).orderBy(asc(messages.id)) : [];
  const noteRows = await db.select({ n: notes, u: users }).from(notes).leftJoin(users, eq(users.id, notes.userId)).where(eq(notes.contactId, c.id)).orderBy(asc(notes.id));
  const tagRows = await db.select({ t: tags }).from(contactTags).innerJoin(tags, eq(tags.id, contactTags.tagId)).where(eq(contactTags.contactId, c.id));
  const audit = await db.select({ e: contactAuditEvents, u: { id: users.id, first_name: users.firstName, last_name: users.lastName } })
    .from(contactAuditEvents).leftJoin(users, eq(users.id, contactAuditEvents.changedById)).where(eq(contactAuditEvents.contactId, c.id)).orderBy(asc(contactAuditEvents.id));
  const ultima = convs.reduce<Date | null>((m, x) => (x.lastActivityAt && (!m || x.lastActivityAt > m) ? x.lastActivityAt : m), null);
  res.json({
    ...railsJson(c),
    conversations: convs.map(cv => ({ ...railsJson(cv), status: ['open', 'pending', 'resolved', 'snoozed'][cv.status ?? 0], messages: msgs.filter(m => m.conversationId === cv.id).map(m => ({ ...railsJson(m), status: ['sent', 'delivered', 'read', 'failed'][m.status ?? 0] })) })),
    notes: noteRows.map(r => ({ ...railsJson(r.n), user: r.u ? { ...railsJson(r.u, USER_HIDDEN), role: ['consultor', 'gerente', 'diretoria', 'financeiro'][r.u.role ?? 0] } : null })),
    reseller_phones: (await phonesOf([c.id])).get(c.id) ?? [],
    tags: tagRows.map(r => railsJson(r.t)),
    contact_audit_events: audit.map(r => ({ ...railsJson(r.e), changed_by: r.u?.id ? r.u : null })),
    ultima_interacao_em: ultima,
  });
});

// contact_params da v1 (+ user_id só pra quem vê a carteira toda, + desconsiderado pra gerência/financeiro)
const CONTACT_FIELDS: Record<string, keyof typeof contacts.$inferInsert> = {
  name: 'name', email: 'email', phone: 'phone', jid: 'jid', avatar_url: 'avatarUrl', status: 'status', first_name: 'firstName', last_name: 'lastName',
  city: 'city', country: 'country', bio: 'bio', company_name: 'companyName', temperature: 'temperature', source: 'source', intention: 'intention',
  cpf: 'cpf', birth_date: 'birthDate', cep: 'cep', street: 'street', neighborhood: 'neighborhood', state: 'state', address_number: 'addressNumber',
  address_complement: 'addressComplement', custom_attributes: 'customAttributes',
};
function contactParams(req: Request): Partial<typeof contacts.$inferInsert> {
  const p = (req.body.contact ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(CONTACT_FIELDS)) if (k in p) out[col] = p[k] === '' && col === 'birthDate' ? null : p[k];
  const u = req.user!;
  if (isFullPortfolio(u) && 'user_id' in p) out.userId = p.user_id === '' || p.user_id === null ? null : Number(p.user_id);
  if (isFullPortfolio(u) || isFinance(u)) {
    if ('desconsiderado' in p) out.desconsiderado = p.desconsiderado === true || p.desconsiderado === 'true' || p.desconsiderado === '1';
    if ('desconsiderado_motivo' in p) out.desconsideradoMotivo = p.desconsiderado_motivo;
    if (out.desconsiderado === true) out.desconsideradoAt = new Date();
  }
  return out;
}

contactsRouter.post('/contacts', async (req, res) => {
  const v = contactParams(req);
  const c = await createContact({ ...v, accountId: acc(req), userId: v.userId ?? req.user!.id });
  res.status(201).json(railsJson(c));
});

async function updateContactRoute(req: Request, res: Response) {
  const c = await loadContact(req, res);
  if (!c) return;
  const updated = await updateContact(c, contactParams(req), req.user!.id);
  res.json({ ...railsJson(updated), reseller_phones: (await phonesOf([c.id])).get(c.id) ?? [] });
}
contactsRouter.put('/contacts/:id', updateContactRoute);
contactsRouter.patch('/contacts/:id', updateContactRoute);

contactsRouter.delete('/contacts/:id', requireFullPortfolio, async (req, res) => {
  const c = await loadContact(req, res);
  if (!c) return;
  await deleteContactCascade(c.id);
  res.status(204).end();
});

// mesclar: conversas vão pro contato alvo e o duplicado é apagado
contactsRouter.post('/contacts/:id/merge', requireFullPortfolio, async (req, res) => {
  const c = await loadContact(req, res);
  if (!c) return;
  const [target] = await db.select().from(contacts).where(and(eq(contacts.accountId, acc(req)), eq(contacts.id, Number(req.body.target_contact_id))));
  if (!target || target.id === c.id) return res.status(422).json({ error: 'Invalid target contact' });
  await db.update(conversations).set({ contactId: target.id }).where(eq(conversations.contactId, c.id));
  await deleteContactCascade(c.id);
  res.json({ message: 'Contacts merged successfully', contact: railsJson(target) });
});

contactsRouter.post('/contacts/:id/add_note', async (req, res) => {
  const c = await loadContact(req, res);
  if (!c) return;
  const [n] = await db.insert(notes).values({ contactId: c.id, accountId: c.accountId, userId: req.user!.id, content: req.body.content ?? null }).returning();
  const u = req.user!;
  res.status(201).json({ ...railsJson(n), user: { ...railsJson(u, USER_HIDDEN), role: ['consultor', 'gerente', 'diretoria', 'financeiro'][u.role ?? 0] } });
});

async function inboxIdsOf(contactId: number) {
  return (await db.selectDistinct({ id: conversations.inboxId }).from(conversations).where(and(eq(conversations.contactId, contactId), isNotNull(conversations.inboxId)))).map(r => r.id!);
}
contactsRouter.patch('/contacts/:id/block', async (req, res) => {
  const c = await loadContact(req, res);
  if (!c) return;
  const updated = await updateContact(c, { status: 'blocked' }, req.user!.id);
  const jid = channelIdentifier(updated);
  if (jid) for (const i of await inboxIdsOf(c.id)) cache.write(`ai_paused_${i}_${jid}`, Math.floor(Date.now() / 1000));
  res.json({ message: 'Contato bloqueado com sucesso', status: 'blocked' });
});
contactsRouter.patch('/contacts/:id/unblock', async (req, res) => {
  const c = await loadContact(req, res);
  if (!c) return;
  const updated = await updateContact(c, { status: 'active' }, req.user!.id);
  const jid = channelIdentifier(updated);
  if (jid) for (const i of await inboxIdsOf(c.id)) cache.delete(`ai_paused_${i}_${jid}`);
  res.json({ message: 'Contato desbloqueado com sucesso', status: 'active' });
});

// atribui (ou tira) o responsável de várias revendedoras — passa pelos callbacks (auditoria)
contactsRouter.patch('/contacts/bulk_assign', requireFullPortfolio, async (req, res) => {
  const ids = (Array.isArray(req.body.contact_ids) ? req.body.contact_ids : [req.body.contact_ids]).filter(Boolean).map(Number);
  const userId = req.body.user_id ? Number(req.body.user_id) : null;
  if (!ids.length) return res.status(422).json({ error: 'Selecione ao menos uma revendedora.' });
  if (userId) {
    const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.accountId, acc(req)), eq(users.id, userId)));
    if (!u) return res.status(422).json({ error: 'Consultor não encontrado nesta conta.' });
  }
  let updated = 0;
  for (const c of await db.select().from(contacts).where(and(eq(contacts.accountId, acc(req)), inArray(contacts.id, ids)))) {
    await updateContact(c, { userId }, req.user!.id);
    updated++;
  }
  res.json({ updated });
});

// --- etiquetas da revendedora ------------------------------------------------------------------
const contactTagsOf = async (contactId: number) => db.select({ id: tags.id, name: tags.name, color: tags.color }).from(contactTags).innerJoin(tags, eq(tags.id, contactTags.tagId)).where(eq(contactTags.contactId, contactId));
contactsRouter.get('/contacts/:contact_id/tags', async (req, res) => {
  const c = await loadContact(req, res, 'contact_id');
  if (c) res.json(await contactTagsOf(c.id));
});
contactsRouter.post('/contacts/:contact_id/tags', async (req, res) => {
  const c = await loadContact(req, res, 'contact_id');
  if (!c) return;
  const name = String(req.body.name ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!name) return res.status(422).json({ error: 'Nome obrigatório' });
  let [tag] = await db.select().from(tags).where(and(eq(tags.accountId, acc(req)), eq(tags.name, name))).limit(1);
  if (!tag) {
    if (!isOwner(req.user!)) return res.status(403).json({ error: 'forbidden', message: 'Só a diretoria pode criar etiquetas novas. Escolha uma já existente.' });
    [tag] = await db.insert(tags).values({ accountId: acc(req), name, color: req.body.color || '#6b7280' }).returning();
  }
  await db.insert(contactTags).values({ contactId: c.id, tagId: tag.id }).onConflictDoNothing();
  res.json({ id: tag.id, name: tag.name, color: tag.color });
});
contactsRouter.delete('/contacts/:contact_id/tags/:id', async (req, res) => {
  const c = await loadContact(req, res, 'contact_id');
  if (!c) return;
  await db.delete(contactTags).where(and(eq(contactTags.contactId, c.id), eq(contactTags.tagId, Number(req.params.id))));
  res.status(204).end();
});

// --- grupos de campos e campos personalizados --------------------------------------------------
export const ASSIGNABLE_FIELD_KEYS = ['venda', 'proximo_agendamento', 'limite_inicial', 'dia_fechamento', 'data_agendamento', 'obs_fechamento',
  'dia_pf_fechamento', 'horario_fechamento', 'atraso', 'observacao_mes', 'meta', 'desafio_combinado', 'como_chegar_meta'];

async function customFieldsOf(accountId: number): Promise<{ key: string; label: string }[]> {
  const [a] = await db.select({ f: accounts.contactCustomFields }).from(accounts).where(eq(accounts.id, accountId));
  return Array.isArray(a?.f) ? a.f as { key: string; label: string }[] : [];
}
const assignableKeysFor = async (accountId: number) => [...ASSIGNABLE_FIELD_KEYS, ...(await customFieldsOf(accountId)).map(f => f.key)];

contactsRouter.get('/contact_field_groups', async (req, res) => {
  const [existing] = await db.select({ id: contactFieldGroups.id }).from(contactFieldGroups).where(eq(contactFieldGroups.accountId, acc(req))).limit(1);
  if (!existing) await db.insert(contactFieldGroups).values({ accountId: acc(req), name: 'Principal', position: 0, fieldKeys: ASSIGNABLE_FIELD_KEYS });
  res.json((await db.select().from(contactFieldGroups).where(eq(contactFieldGroups.accountId, acc(req))).orderBy(asc(contactFieldGroups.position), asc(contactFieldGroups.id))).map(g => railsJson(g)));
});
async function groupParams(req: Request) {
  const p = (req.body.contact_field_group ?? {}) as { name?: string; field_keys?: string[] };
  const out: Record<string, unknown> = {};
  if ('name' in p) out.name = p.name;
  if (Array.isArray(p.field_keys)) { const ok = await assignableKeysFor(acc(req)); out.fieldKeys = p.field_keys.filter(k => ok.includes(k)); }
  return out;
}
contactsRouter.post('/contact_field_groups', requireOwner, async (req, res) => {
  const v = await groupParams(req);
  if (!v.name) return res.status(422).json({ name: ["can't be blank"] });
  const [{ m }] = await db.select({ m: max(contactFieldGroups.position) }).from(contactFieldGroups).where(eq(contactFieldGroups.accountId, acc(req)));
  const [g] = await db.insert(contactFieldGroups).values({ accountId: acc(req), name: String(v.name), fieldKeys: (v.fieldKeys as string[]) ?? [], position: (m ?? -1) + 1 }).returning();
  res.status(201).json(railsJson(g));
});
async function updateGroup(req: Request, res: Response) {
  const v = await groupParams(req);
  if ('name' in v && !v.name) return res.status(422).json({ name: ["can't be blank"] });
  const [g] = await db.update(contactFieldGroups).set({ ...v, updatedAt: new Date() }).where(and(eq(contactFieldGroups.accountId, acc(req)), eq(contactFieldGroups.id, Number(req.params.id)))).returning();
  if (!g) return res.status(404).json({ error: 'not_found' });
  res.json(railsJson(g));
}
contactsRouter.put('/contact_field_groups/:id', requireOwner, updateGroup);
contactsRouter.patch('/contact_field_groups/:id', requireOwner, updateGroup);
contactsRouter.delete('/contact_field_groups/:id', requireOwner, async (req, res) => {
  await db.delete(contactFieldGroups).where(and(eq(contactFieldGroups.accountId, acc(req)), eq(contactFieldGroups.id, Number(req.params.id))));
  res.status(204).end();
});

contactsRouter.get('/contact_custom_fields', async (req, res) => res.json(await customFieldsOf(acc(req))));
contactsRouter.post('/contact_custom_fields', requireOwner, async (req, res) => {
  const label = String(req.body.label ?? '').trim();
  if (!label) return res.status(422).json({ message: 'Dê um nome pro campo.' });
  const campos = await customFieldsOf(acc(req));
  if (campos.some(f => String(f.label).toLowerCase() === label.toLowerCase())) return res.status(422).json({ message: 'Já existe um campo com esse nome.' });
  const translit = label.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const base = ('cf_' + translit.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')).slice(0, 40);
  let key = base;
  for (let n = 2; campos.some(f => f.key === key) || ASSIGNABLE_FIELD_KEYS.includes(key); n++) key = `${base}_${n}`;
  const campo = { key, label };
  await db.update(accounts).set({ contactCustomFields: [...campos, campo], updatedAt: new Date() }).where(eq(accounts.id, acc(req)));
  res.status(201).json(campo);
});
contactsRouter.delete('/contact_custom_fields/:id', requireOwner, async (req, res) => {
  const key = req.params.id;
  await db.update(accounts).set({ contactCustomFields: (await customFieldsOf(acc(req))).filter(f => f.key !== key), updatedAt: new Date() }).where(eq(accounts.id, acc(req)));
  for (const g of await db.select().from(contactFieldGroups).where(eq(contactFieldGroups.accountId, acc(req)))) {
    const keys = Array.isArray(g.fieldKeys) ? g.fieldKeys as string[] : [];
    if (keys.includes(key)) await db.update(contactFieldGroups).set({ fieldKeys: keys.filter(k => k !== key) }).where(eq(contactFieldGroups.id, g.id));
  }
  res.status(204).end();
});
