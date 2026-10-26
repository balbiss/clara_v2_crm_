import { and, asc, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { conversations, contacts, inboxes, inboxMembers, messages, notes, pedidos, resellerPhones, lifecycleEvents, tags, conversationTags } from '../db/schema.js';
import { isFinance, isFullPortfolio, hasPermission, accessibleJueriLiderIds, type User } from '../middleware/auth.js';
import { blobsFor, blobUrl } from './storage.js';
import { accountUsersMap } from './users.js';
import { messageStatusName } from './messages.js';
import { hhmm, iso8601 } from './serialize.js';

export type Conversation = typeof conversations.$inferSelect;

// enum :status da v1
export const CONVERSATION_STATUS = ['open', 'pending', 'resolved', 'snoozed'] as const;
export const convStatusName = (n: number | null) => CONVERSATION_STATUS[n ?? 0] ?? 'open';
export const convStatusValue = (s: string) => {
  const i = CONVERSATION_STATUS.indexOf(s as typeof CONVERSATION_STATUS[number]);
  return i < 0 ? null : i;
};

/** Caixas que o usuário tem liberadas (InboxMember). */
// Cor de cada caixa quando o dono não escolheu: tons da marca Clara (vinho, rosa, ameixa, dourado,
// sálvia...), diferentes entre si e legíveis com texto branco
export const INBOX_COLORS = ['#8e2a46', '#b5546d', '#6d3b5e', '#a07f45', '#5f7d6a', '#4f6d8a', '#9a6a8f', '#7a5548'];
/** Identificação visual da caixa: apelido curto + cor (pra ninguém mandar pelo número errado). */
export function inboxBadge(i: { id: number; name: string | null; color?: string | null; shortName?: string | null }) {
  return { short: (i.shortName || i.name || 'WhatsApp').trim(), color: i.color || INBOX_COLORS[i.id % INBOX_COLORS.length] };
}

export async function assignedInboxes(userId: number) {
  return db.select({ id: inboxes.id, restrictByPortfolio: inboxes.restrictByPortfolio, provider: inboxes.provider, createdAt: inboxes.createdAt })
    .from(inboxMembers).innerJoin(inboxes, eq(inboxes.id, inboxMembers.inboxId))
    .where(eq(inboxMembers.userId, userId)).orderBy(asc(inboxes.id));
}

/**
 * ConversationsController#visible_conversations_scope (condição SQL; exige join com contacts).
 * Gerente/diretoria/financeiro/permissão admin: tudo. Consultor: conversas em que é atendente,
 * dos times de vendas dele, das caixas liberadas sem carteira, e das caixas com carteira só
 * quando a revendedora é dele ou está sem responsável (e a conversa não é de outra pessoa).
 */
export async function visibleConversationsWhere(u: User): Promise<SQL> {
  const base = eq(conversations.accountId, u.accountId!);
  if (isFullPortfolio(u) || isFinance(u) || hasPermission(u, 'admin')) return base;
  const liderIds = await accessibleJueriLiderIds(u.id);
  const assigned = await assignedInboxes(u.id);
  const unrestricted = assigned.filter(i => !i.restrictByPortfolio).map(i => i.id);
  const restricted = assigned.filter(i => i.restrictByPortfolio).map(i => i.id);
  const conds: SQL[] = [eq(conversations.userId, u.id)];
  if (liderIds.length) conds.push(inArray(sql`${contacts.customAttributes} ->> 'gerente_jueri_id'`, liderIds));
  if (unrestricted.length) conds.push(inArray(conversations.inboxId, unrestricted));
  // caixa com carteira: revendedora dela; sem responsável, só se a conversa não está atribuída a outra pessoa
  if (restricted.length) conds.push(and(inArray(conversations.inboxId, restricted), or(eq(contacts.userId, u.id), sql`(${contacts.userId} IS NULL AND (${conversations.userId} IS NULL OR ${conversations.userId} = ${u.id}))`))!);
  return and(base, or(...conds))!;
}

/** Busca conversa visível pelo id (com join em contacts). */
export async function findVisibleConversation(u: User, id: number): Promise<Conversation | null> {
  const [row] = await db.select({ c: conversations }).from(conversations)
    .leftJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(and(await visibleConversationsWhere(u), eq(conversations.id, id))).limit(1);
  return row?.c ?? null;
}

export async function conversationTagsOf(conversationId: number) {
  return db.select({ id: tags.id, name: tags.name, color: tags.color }).from(conversationTags)
    .innerJoin(tags, eq(tags.id, conversationTags.tagId)).where(eq(conversationTags.conversationId, conversationId));
}

/**
 * format_conversation da v1, em lote (sem N+1).
 * `fullMessages`: a v1 mandava TODAS as mensagens de cada conversa até na lista (100 conversas),
 * o que deixava a tela pesada. Na v2 a lista traz só a última (`messages_loaded: false`) e o
 * detalhe (GET /conversations/:id) traz o histórico completo.
 */
export async function formatConversations(convs: Conversation[], accountId: number, opts: { fullMessages: boolean }) {
  if (!convs.length) return [];
  const convIds = convs.map(c => c.id);
  const contactIds = [...new Set(convs.map(c => c.contactId))];
  const inboxIds = [...new Set(convs.map(c => c.inboxId).filter((x): x is number => !!x))];
  const usersMap = await accountUsersMap(accountId);

  const [contactRows, inboxRows, noteRows, pedidoRows, phoneRows, lifeRows, tagRows] = await Promise.all([
    db.select().from(contacts).where(inArray(contacts.id, contactIds)),
    inboxIds.length ? db.select({ id: inboxes.id, name: inboxes.name, phoneNumber: inboxes.phoneNumber, color: inboxes.color, shortName: inboxes.shortName }).from(inboxes).where(inArray(inboxes.id, inboxIds)) : Promise.resolve([]),
    db.select().from(notes).where(inArray(notes.contactId, contactIds)).orderBy(desc(notes.createdAt)),
    db.select().from(pedidos).where(inArray(pedidos.contactId, contactIds)),
    db.select().from(resellerPhones).where(inArray(resellerPhones.contactId, contactIds)),
    db.select().from(lifecycleEvents).where(inArray(lifecycleEvents.contactId, contactIds)).orderBy(desc(lifecycleEvents.occurredAt)),
    db.select({ conversationId: conversationTags.conversationId, id: tags.id, name: tags.name, color: tags.color })
      .from(conversationTags).innerJoin(tags, eq(tags.id, conversationTags.tagId)).where(inArray(conversationTags.conversationId, convIds)),
  ]);

  const msgRows = opts.fullMessages
    ? await db.select().from(messages).where(inArray(messages.conversationId, convIds)).orderBy(asc(messages.createdAt), asc(messages.id))
    : await db.select().from(messages).where(sql`${messages.id} IN (
        SELECT DISTINCT ON (conversation_id) id FROM messages
        WHERE conversation_id IN (${sql.join(convIds.map(i => sql`${i}`), sql`, `)})
        ORDER BY conversation_id, created_at DESC, id DESC)`);
  const atts = await blobsFor('Message', msgRows.map(m => m.id), 'attachment');

  const group = <T, K>(rows: T[], key: (r: T) => K) => {
    const m = new Map<K, T[]>();
    for (const r of rows) { const k = key(r); const l = m.get(k) ?? []; l.push(r); m.set(k, l); }
    return m;
  };
  const contactsById = new Map(contactRows.map(c => [c.id, c]));
  const inboxById = new Map(inboxRows.map(i => [i.id, i]));
  const notesBy = group(noteRows, r => r.contactId);
  const pedidosBy = group(pedidoRows, r => r.contactId);
  const phonesBy = group(phoneRows, r => r.contactId);
  const lifeBy = group(lifeRows, r => r.contactId);
  const tagsBy = group(tagRows, r => r.conversationId);
  const msgsBy = group(msgRows, r => r.conversationId);

  return convs.map(conv => {
    const c = contactsById.get(conv.contactId)!;
    const inbox = conv.inboxId ? inboxById.get(conv.inboxId) : undefined;
    const msgs = msgsBy.get(conv.id) ?? [];
    const last = msgs[msgs.length - 1];
    const assignee = conv.userId ? usersMap.get(conv.userId) : undefined;
    return {
      id: conv.id,
      contact: {
        id: c.id, name: c.name, email: c.email, phone: c.phone, jid: c.jid, avatar_url: c.avatarUrl,
        avatarInitials: String(c.name ?? '').slice(0, 2).toUpperCase(), avatarBg: '#d49ba7',
        status: c.status, id_jueri: c.idJueri, cpf: c.cpf, birth_date: c.birthDate, bio: c.bio,
        company_name: c.companyName, country: c.country, city: c.city, cep: c.cep, street: c.street,
        neighborhood: c.neighborhood, state: c.state, address_number: c.addressNumber,
        address_complement: c.addressComplement, custom_attributes: c.customAttributes,
        pecas_abertas_atual: c.pecasAbertasAtual,
        // a v1 não mandava estes: "Editar campos" salvava o responsável como vazio (apagava a
        // carteira) e Data de cadastro / Nível / Dias na etapa ficavam sempre "..." no painel
        user_id: c.userId, nivel: c.nivel, created_at: c.createdAt, status_changed_at: c.statusChangedAt,
        pedidos: (pedidosBy.get(c.id) ?? []).map(p => ({
          id: p.id, jueri_pedido_id: p.jueriPedidoId, data_criacao: p.dataCriacao, data_baixa: p.dataBaixa,
          data_cancelamento: p.dataCancelamento, quantidade: p.quantidade, valor_total: p.valorTotal, status_id: p.statusId,
        })),
        reseller_phones: (phonesBy.get(c.id) ?? []).map(rp => ({ id: rp.id, phone: rp.phone, label: rp.label })),
        lifecycle_events: (lifeBy.get(c.id) ?? []).map(e => ({ id: e.id, event_type: e.eventType, occurred_at: e.occurredAt, metadata: e.metadata })),
        notes: (notesBy.get(c.id) ?? []).map(n => ({
          id: n.id, content: n.content, created_at: n.createdAt,
          author: (n.userId && usersMap.get(n.userId)?.firstName) || 'Sistema',
        })),
      },
      inbox_id: conv.inboxId,
      inbox_name: inbox?.name ?? null,
      inbox_phone: inbox?.phoneNumber ?? null,
      inbox_short: inbox ? inboxBadge(inbox).short : null,
      inbox_color: inbox ? inboxBadge(inbox).color : null,
      source: conv.source || 'whatsapp',
      preview: last?.text ?? 'Nova Conversa',
      timestamp: hhmm(last?.createdAt ?? conv.createdAt),
      last_activity_iso: iso8601(last?.createdAt ?? conv.lastActivityAt ?? conv.createdAt),
      created_at_iso: iso8601(conv.createdAt),
      unread: conv.unreadCount,
      messages_loaded: opts.fullMessages,
      messages: msgs.map(m => {
        const att = atts.get(m.id)?.[0];
        const sender = m.senderType.toLowerCase();
        const agent = m.senderType === 'User' && m.senderId ? usersMap.get(m.senderId) : undefined;
        return {
          id: m.id,
          senderType: sender === 'user' ? 'agent' : sender,
          text: m.text,
          timestamp: iso8601(m.createdAt),
          status: messageStatusName(m.status),
          agentName: m.senderType === 'User' ? (agent?.firstName || 'Agente') : null,
          agentAvatarUrl: m.senderType === 'User' ? agent?.avatarUrl ?? null : null,
          isPrivate: m.isPrivate,
          broadcast: !!m.broadcastId,
          attachmentUrl: att ? blobUrl(att) : null,
          attachmentType: att ? att.contentType : null,
          transcription: m.transcription,
        };
      }),
      assignee: assignee?.firstName ?? null,
      assignee_id: conv.userId,
      status: convStatusName(conv.status),
      snoozed_until: conv.snoozedUntil,
      tags: (tagsBy.get(conv.id) ?? []).map(t => ({ id: t.id, name: t.name, color: t.color })),
    };
  });
}

export async function formatConversation(conv: Conversation, accountId: number) {
  return (await formatConversations([conv], accountId, { fullMessages: true }))[0];
}

/** Conversation.find_or_create_by(contact:, inbox:) */
export async function findOrCreateConversation(contactId: number, inboxId: number, init: Partial<typeof conversations.$inferInsert> & { accountId: number }): Promise<Conversation> {
  const [existing] = await db.select().from(conversations).where(and(eq(conversations.contactId, contactId), eq(conversations.inboxId, inboxId))).orderBy(asc(conversations.id)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(conversations).values({ status: 0, ...init, contactId, inboxId }).returning();
  return created;
}

/** Tag find_or_create_by!(name:) { color } da conta. */
export async function findOrCreateTag(accountId: number, name: string, color: string) {
  const [t] = await db.select().from(tags).where(and(eq(tags.accountId, accountId), eq(tags.name, name))).limit(1);
  if (t) return t;
  const [created] = await db.insert(tags).values({ accountId, name, color }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(tags).where(and(eq(tags.accountId, accountId), eq(tags.name, name))).limit(1))[0];
}

export async function addConversationTag(conversationId: number, tagId: number) {
  await db.insert(conversationTags).values({ conversationId, tagId }).onConflictDoNothing();
}

