import { and, eq, inArray, ne, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contacts, resellerPhones, contactAuditEvents, conversations, inboxes, users } from '../db/schema.js';
import { broadcastConversations } from './realtime.js';

// Porte do model Contact da v1: constantes, buscas e TODOS os callbacks de save
// (régua, telefones adicionais, auditoria, broadcast, gatilhos da régua, atendente da conversa).
// Toda gravação de contato no servidor deve passar por createContact/updateContact.

export type Contact = typeof contacts.$inferSelect;
type NewContact = typeof contacts.$inferInsert;

export const CYCLE_RESTART_STATUS = 'revendedor_ativo';
export const INACTIVE_STATUSES = ['sem_maleta', 'inativa_pendencia', 'suspensa_atraso', 'negativado_juridico', 'resgate', 'reativacao', 'descadastrada'];
export const ACTIVE_STATUSES = ['revendedor_ativo', 'terceiro_dia', 'decimo_dia', 'vigesimo_dia', 'agendado', 'reagendar', 'atrasada'];
export const STATUS_OVERRIDE_PERMANENTE = ['resgate', 'negativado_juridico', 'descadastrada'];
export const DIAS_MINIMOS_PARA_REATIVACAO = 60;
const BROADCAST_FIELDS = ['name', 'firstName', 'lastName', 'phone', 'temperature', 'status', 'source', 'intention', 'userId', 'avatarUrl'] as const;

export const ACENTOS_DE = 'áàâãäéèêëíìîïóòôõöúùûüçñ';
export const ACENTOS_PARA = 'aaaaaeeeeiiiiooooouuuucn';
export const semAcento = (s: string) => s.toLowerCase().replace(/./g, ch => {
  const i = ACENTOS_DE.indexOf(ch);
  return i >= 0 ? ACENTOS_PARA[i] : ch;
});
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, m => '\\' + m);

export const channelIdentifier = (c: Pick<Contact, 'jid' | 'instagramId' | 'phone'>) => c.jid || c.instagramId || c.phone;

/** Contact.find_by_any_phone — telefone principal OU qualquer reseller_phone. */
export async function findByAnyPhone(accountId: number, phone: string | null | undefined): Promise<Contact | null> {
  if (!phone) return null;
  const [row] = await db.select({ c: contacts }).from(contacts)
    .leftJoin(resellerPhones, eq(resellerPhones.contactId, contacts.id))
    .where(and(eq(contacts.accountId, accountId), or(eq(contacts.phone, phone), eq(resellerPhones.phone, phone))))
    .limit(1);
  return row?.c ?? null;
}

/**
 * Contact.search_by_name_or_phone: nome = todas as palavras (qualquer ordem, sem acento);
 * telefone = só dígitos pelos 8 últimos, no principal ou em reseller_phones.
 * Retorna `undefined` (= sem filtro, "all") ou uma condição SQL (pode ser `false` = none).
 */
export function searchByNameOrPhoneWhere(termo: string): SQL | undefined {
  termo = String(termo ?? '').trim();
  if (!termo) return undefined;
  const conds: SQL[] = [];
  const palavras = termo.replace(/[\d()+\-.]/g, ' ').split(/\s+/).filter(Boolean).map(semAcento);
  if (palavras.length) {
    const nome = sql`translate(lower(coalesce(${contacts.name}, '')), ${ACENTOS_DE}, ${ACENTOS_PARA})`;
    conds.push(sql`(${sql.join(palavras.map(p => sql`${nome} LIKE ${'%' + likeEscape(p) + '%'}`), sql` AND `)})`);
  }
  const digitos = termo.replace(/\D/g, '');
  if (digitos.length >= 4) {
    const fone = '%' + (digitos.length > 8 ? digitos.slice(-8) : digitos) + '%';
    conds.push(sql`(regexp_replace(coalesce(${contacts.phone}, ''), '\\D', '', 'g') LIKE ${fone} OR EXISTS (SELECT 1 FROM reseller_phones rp WHERE rp.contact_id = ${contacts.id} AND regexp_replace(rp.phone, '\\D', '', 'g') LIKE ${fone}))`);
  }
  if (!conds.length) return sql`false`;
  return sql`(${sql.join(conds, sql` OR `)})`;
}

// --- callbacks -----------------------------------------------------------------------------

// Gatilhos da régua (ReguaTriggerRunnerService) — registrado pela Fase 3; até lá não faz nada.
let reguaTriggerRunner: (c: Contact) => Promise<void> = async () => {};
export function setReguaTriggerRunner(fn: (c: Contact) => Promise<void>) { reguaTriggerRunner = fn; }

type Telefone = { label?: string; numero?: string };

/** before_save: régua (status_changed_at/cycle_started_at) + tira telefones_adicionais do jsonb. */
function beforeSave(values: Partial<NewContact>, statusChanged: boolean): { values: Partial<NewContact>; telefones?: Telefone[] } {
  const v = { ...values };
  if (statusChanged) {
    if (!('statusChangedAt' in values)) v.statusChangedAt = new Date();
    if ((v.status === CYCLE_RESTART_STATUS || !v.status) && !('cycleStartedAt' in values)) v.cycleStartedAt = new Date();
  }
  let telefones: Telefone[] | undefined;
  const ca = v.customAttributes as Record<string, unknown> | undefined;
  if (ca && typeof ca === 'object' && !Array.isArray(ca) && 'telefones_adicionais' in ca) {
    telefones = Array.isArray(ca.telefones_adicionais) ? ca.telefones_adicionais as Telefone[] : [];
    const { telefones_adicionais: _t, ...rest } = ca;
    v.customAttributes = rest;
  }
  return { values: v, telefones };
}

async function persistirTelefones(contactId: number, tels: Telefone[]) {
  const numeros = tels.map(t => t?.numero).filter((n): n is string => !!n && !!String(n).trim());
  if (numeros.length) {
    await db.delete(resellerPhones).where(and(eq(resellerPhones.contactId, contactId), sql`${resellerPhones.phone} NOT IN (${sql.join(numeros.map(n => sql`${n}`), sql`, `)})`));
  } else {
    await db.delete(resellerPhones).where(eq(resellerPhones.contactId, contactId));
  }
  for (const t of tels) {
    if (!t?.numero || !String(t.numero).trim()) continue;
    const [existing] = await db.select().from(resellerPhones).where(and(eq(resellerPhones.contactId, contactId), eq(resellerPhones.phone, t.numero)));
    if (existing) {
      if (t.label) await db.update(resellerPhones).set({ label: t.label, updatedAt: new Date() }).where(eq(resellerPhones.id, existing.id));
    } else {
      await db.insert(resellerPhones).values({ contactId, phone: t.numero, label: t.label || null });
    }
  }
}

/** Contact#sync_conversations_user_id: nas caixas com carteira, o atendente acompanha o responsável. */
async function syncConversationsUserId(c: Contact) {
  if (!c.userId) return;
  const rows = await db.select({ id: conversations.id }).from(conversations)
    .innerJoin(inboxes, eq(inboxes.id, conversations.inboxId))
    .where(and(eq(conversations.contactId, c.id), eq(inboxes.restrictByPortfolio, true), sql`${conversations.userId} IS DISTINCT FROM ${c.userId}`));
  if (!rows.length) return;
  const ids = rows.map(r => r.id);
  await db.update(conversations).set({ userId: c.userId }).where(inArray(conversations.id, ids));
  const [u] = await db.select({ firstName: users.firstName }).from(users).where(eq(users.id, c.userId));
  for (const id of ids) {
    broadcastConversations(c.accountId, { event: 'conversation_updated', conversation: { id, assignee_id: c.userId, assignee: u?.firstName ?? null } });
  }
}

async function afterSave(c: Contact, changed: Set<string>, telefones?: Telefone[]) {
  if (telefones) await persistirTelefones(c.id, telefones);
  if ([...changed].some(k => (BROADCAST_FIELDS as readonly string[]).includes(k))) {
    broadcastConversations(c.accountId, { event: 'contact_updated', contact_id: c.id });
  }
  if (changed.has('status') && c.status) {
    await reguaTriggerRunner(c).catch(e => console.error('Régua triggers:', e.message));
  }
  if (changed.has('userId') && c.userId) await syncConversationsUserId(c);
}

/** Contact.create! com os callbacks. */
export async function createContact(values: NewContact): Promise<Contact> {
  const { values: v, telefones } = beforeSave(values, !!values.status);
  const [c] = await db.insert(contacts).values(v as NewContact).returning();
  const changed = new Set(Object.keys(v).filter(k => (v as Record<string, unknown>)[k] !== null && (v as Record<string, unknown>)[k] !== undefined));
  await afterSave(c, changed, telefones);
  return c;
}

/**
 * contact.update(attrs) com os callbacks, incluindo auditoria (after_update) de status e
 * responsável. `actorId` = Current.user (nulo = sistema).
 */
export async function updateContact(contact: Contact, attrs: Partial<NewContact>, actorId: number | null = null): Promise<Contact> {
  const changed = new Set<string>();
  for (const [k, v] of Object.entries(attrs)) {
    const old = (contact as Record<string, unknown>)[k];
    const same = old instanceof Date && v instanceof Date ? old.getTime() === v.getTime() : JSON.stringify(old) === JSON.stringify(v);
    if (!same) changed.add(k);
  }
  const telefonesNoJson = !!attrs.customAttributes && typeof attrs.customAttributes === 'object' && 'telefones_adicionais' in (attrs.customAttributes as object);
  if (!changed.size && !telefonesNoJson) return contact;

  const { values: v, telefones } = beforeSave(attrs, changed.has('status'));
  const [c] = await db.update(contacts).set({ ...v, updatedAt: new Date() }).where(eq(contacts.id, contact.id)).returning();

  if (changed.has('status')) {
    await db.insert(contactAuditEvents).values({ accountId: c.accountId, contactId: c.id, changedById: actorId, eventType: 'status', fromValue: contact.status, toValue: c.status });
  }
  if (changed.has('userId')) {
    await db.insert(contactAuditEvents).values({ accountId: c.accountId, contactId: c.id, changedById: actorId, eventType: 'responsavel', fromValue: contact.userId?.toString() ?? null, toValue: c.userId?.toString() ?? null });
  }
  await afterSave(c, changed, telefones);
  return c;
}

/** Só grava o jid se nenhum OUTRO contato da conta já for dono dele (índice único). */
export async function setJidIfFree(c: Contact, jid: string) {
  if (c.jid === jid) return c;
  const [other] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.accountId, c.accountId), eq(contacts.jid, jid), ne(contacts.id, c.id))).limit(1);
  if (other) return c;
  return updateContact(c, { jid });
}
