// GERADO a partir do db/schema.rb da Clara v1 (crm_clara_ferreira_pro) — mesmas tabelas e colunas,
// pra migração de dados ser cópia direta. Não renomear colunas: a v1 e a v2 precisam bater 1:1.
// Ficaram de fora: solid_queue/solid_cache/solid_cable (infra do Rails) e support_tickets (sem uso).
import { pgTable, bigserial, index, uniqueIndex, timestamp, jsonb, varchar, integer, bigint, text, numeric, date, boolean, doublePrecision, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const accounts = pgTable('accounts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  contactCustomFields: jsonb('contact_custom_fields').default([]).notNull(),
  // 0003_configuracoes: preferências da área de trabalho e do chat (padrão Kommo)
  settings: jsonb('settings').default({}).notNull(),
  facebookPageAccessToken: varchar('facebook_page_access_token'),
  facebookPageId: varchar('facebook_page_id'),
  facebookPageName: varchar('facebook_page_name'),
  facebookTokenExpiresAt: timestamp('facebook_token_expires_at', { precision: 6, mode: 'date' }),
  jueriWebhookToken: varchar('jueri_webhook_token'),
  minPecasAtiva: integer('min_pecas_ativa').default(25).notNull(),
  name: varchar('name'),
  stripeCustomerId: varchar('stripe_customer_id'),
  stripeSubscriptionId: varchar('stripe_subscription_id'),
  subscriptionStatus: varchar('subscription_status'),
  trialEndsAt: timestamp('trial_ends_at', { precision: 6, mode: 'date' }),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('index_accounts_on_facebook_page_id').on(t.facebookPageId),
  uniqueIndex('index_accounts_on_jueri_webhook_token').on(t.jueriWebhookToken),
]);

export const activeStorageAttachments = pgTable('active_storage_attachments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  blobId: bigint('blob_id', { mode: 'number' }).notNull().references((): AnyPgColumn => activeStorageBlobs.id),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  name: varchar('name').notNull(),
  recordId: bigint('record_id', { mode: 'number' }).notNull(),
  recordType: varchar('record_type').notNull(),
}, (t) => [
  index('index_active_storage_attachments_on_blob_id').on(t.blobId),
  uniqueIndex('index_active_storage_attachments_uniqueness').on(t.recordType, t.recordId, t.name, t.blobId),
]);

export const activeStorageBlobs = pgTable('active_storage_blobs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
  checksum: varchar('checksum'),
  contentType: varchar('content_type'),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  filename: varchar('filename').notNull(),
  key: varchar('key').notNull(),
  metadata: text('metadata'),
  serviceName: varchar('service_name').notNull(),
}, (t) => [
  uniqueIndex('index_active_storage_blobs_on_key').on(t.key),
]);

export const activeStorageVariantRecords = pgTable('active_storage_variant_records', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  blobId: bigint('blob_id', { mode: 'number' }).notNull().references((): AnyPgColumn => activeStorageBlobs.id),
  variationDigest: varchar('variation_digest').notNull(),
}, (t) => [
  uniqueIndex('index_active_storage_variant_records_uniqueness').on(t.blobId, t.variationDigest),
]);

export const agendamentos = pgTable('agendamentos', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  contactId: bigint('contact_id', { mode: 'number' }).references((): AnyPgColumn => contacts.id),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  descricao: text('descricao'),
  fimEm: timestamp('fim_em', { precision: 6, mode: 'date' }),
  inicioEm: timestamp('inicio_em', { precision: 6, mode: 'date' }).notNull(),
  tipo: varchar('tipo').default('outro').notNull(),
  titulo: varchar('titulo').notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  userId: bigint('user_id', { mode: 'number' }).notNull().references((): AnyPgColumn => users.id),
  valor: numeric('valor', { precision: 12, scale: 2 }),
}, (t) => [
  index('index_agendamentos_on_account_id_and_inicio_em').on(t.accountId, t.inicioEm),
  index('index_agendamentos_on_account_id').on(t.accountId),
  index('index_agendamentos_on_contact_id').on(t.contactId),
  index('index_agendamentos_on_user_id_and_inicio_em').on(t.userId, t.inicioEm),
  index('index_agendamentos_on_user_id').on(t.userId),
]);

export const contactAuditEvents = pgTable('contact_audit_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  changedById: bigint('changed_by_id', { mode: 'number' }).references((): AnyPgColumn => users.id),
  contactId: bigint('contact_id', { mode: 'number' }).notNull().references((): AnyPgColumn => contacts.id),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  eventType: varchar('event_type').notNull(),
  fromValue: varchar('from_value'),
  toValue: varchar('to_value'),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('index_contact_audit_events_on_account_id_and_event_type').on(t.accountId, t.eventType),
  index('index_contact_audit_events_on_account_id').on(t.accountId),
  index('index_contact_audit_events_on_changed_by_id').on(t.changedById),
  index('idx_contact_audit_events_contact_type_time').on(t.contactId, t.eventType, t.createdAt),
  index('index_contact_audit_events_on_contact_id').on(t.contactId),
]);

export const contactFieldGroups = pgTable('contact_field_groups', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  fieldKeys: jsonb('field_keys').default([]).notNull(),
  name: varchar('name').notNull(),
  position: integer('position').default(0).notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('index_contact_field_groups_on_account_id').on(t.accountId),
]);

export const contactTags = pgTable('contact_tags', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  contactId: bigint('contact_id', { mode: 'number' }).notNull().references((): AnyPgColumn => contacts.id),
  tagId: bigint('tag_id', { mode: 'number' }).notNull().references((): AnyPgColumn => tags.id),
}, (t) => [
  uniqueIndex('index_contact_tags_on_contact_and_tag').on(t.contactId, t.tagId),
  index('index_contact_tags_on_contact_id').on(t.contactId),
  index('index_contact_tags_on_tag_id').on(t.tagId),
]);

export const contacts = pgTable('contacts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  addressComplement: varchar('address_complement'),
  addressNumber: varchar('address_number'),
  avatarUrl: varchar('avatar_url'),
  bio: text('bio'),
  birthDate: date('birth_date'),
  cep: varchar('cep'),
  city: varchar('city'),
  companyName: varchar('company_name'),
  country: varchar('country'),
  cpf: varchar('cpf'),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  customAttributes: jsonb('custom_attributes').default({}),
  cycleStartedAt: timestamp('cycle_started_at', { precision: 6, mode: 'date' }),
  desconsiderado: boolean('desconsiderado').default(false).notNull(),
  desconsideradoAt: timestamp('desconsiderado_at', { precision: 6, mode: 'date' }),
  desconsideradoMotivo: varchar('desconsiderado_motivo'),
  email: varchar('email'),
  firstName: varchar('first_name'),
  idJueri: varchar('id_jueri'),
  instagramId: varchar('instagram_id'),
  intention: varchar('intention'),
  jid: varchar('jid'),
  jueriSyncedAt: timestamp('jueri_synced_at', { precision: 6, mode: 'date' }),
  lastName: varchar('last_name'),
  name: varchar('name'),
  neighborhood: varchar('neighborhood'),
  nivel: varchar('nivel'),
  pecasAbertasAtual: integer('pecas_abertas_atual').default(0).notNull(),
  pedidosAbertosCount: integer('pedidos_abertos_count').default(0).notNull(),
  phone: varchar('phone'),
  snapshotCalculadoEm: timestamp('snapshot_calculado_em', { precision: 6, mode: 'date' }),
  source: varchar('source'),
  state: varchar('state'),
  status: varchar('status'),
  statusChangedAt: timestamp('status_changed_at', { precision: 6, mode: 'date' }),
  street: varchar('street'),
  temperature: varchar('temperature'),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  userId: bigint('user_id', { mode: 'number' }).references((): AnyPgColumn => users.id),
}, (t) => [
  index('idx_contacts_account_created_at').on(t.accountId, t.createdAt),
  index('index_contacts_on_account_id_and_desconsiderado').on(t.accountId, t.desconsiderado),
  uniqueIndex('index_contacts_on_account_id_and_id_jueri').on(t.accountId, t.idJueri),
  index('index_contacts_on_account_id_and_instagram_id').on(t.accountId, t.instagramId),
  uniqueIndex('idx_contacts_account_jid_unique').on(t.accountId, t.jid).where(sql`(jid IS NOT NULL)`),
  index('index_contacts_on_account_id_and_jid').on(t.accountId, t.jid),
  index('index_contacts_on_account_id_and_nivel').on(t.accountId, t.nivel),
  index('idx_contacts_account_source').on(t.accountId, t.source),
  index('index_contacts_on_account_id_and_status').on(t.accountId, t.status),
  index('idx_contacts_account_temperature').on(t.accountId, t.temperature),
  index('index_contacts_on_account_id').on(t.accountId),
  index('index_contacts_on_instagram_id').on(t.instagramId),
  index('index_contacts_on_jid').on(t.jid),
  index('index_contacts_on_pecas_abertas_atual').on(t.pecasAbertasAtual),
  index('index_contacts_on_phone').on(t.phone),
  index('index_contacts_on_status_changed_at').on(t.statusChangedAt),
  index('index_contacts_on_user_id').on(t.userId),
]);

export const conversationTags = pgTable('conversation_tags', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  conversationId: bigint('conversation_id', { mode: 'number' }).notNull().references((): AnyPgColumn => conversations.id),
  tagId: bigint('tag_id', { mode: 'number' }).notNull().references((): AnyPgColumn => tags.id),
}, (t) => [
  uniqueIndex('index_conversation_tags_on_conversation_and_tag').on(t.conversationId, t.tagId),
  index('index_conversation_tags_on_conversation_id').on(t.conversationId),
  index('index_conversation_tags_on_tag_id').on(t.tagId),
]);

export const conversations = pgTable('conversations', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  contactId: bigint('contact_id', { mode: 'number' }).notNull().references((): AnyPgColumn => contacts.id),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  followupCount: integer('followup_count').default(0),
  inboxId: bigint('inbox_id', { mode: 'number' }).references((): AnyPgColumn => inboxes.id),
  lastActivityAt: timestamp('last_activity_at', { precision: 6, mode: 'date' }),
  snoozedUntil: timestamp('snoozed_until', { precision: 6, mode: 'date' }),
  source: varchar('source'),
  status: integer('status').default(0),
  unreadCount: integer('unread_count').default(0),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  userId: bigint('user_id', { mode: 'number' }).references((): AnyPgColumn => users.id),
}, (t) => [
  index('index_conversations_on_account_id_and_status').on(t.accountId, t.status),
  index('index_conversations_on_account_id').on(t.accountId),
  index('index_conversations_on_contact_id').on(t.contactId),
  index('idx_conversations_inbox_status').on(t.inboxId, t.status),
  index('index_conversations_on_inbox_id').on(t.inboxId),
  index('index_conversations_on_last_activity_at').on(t.lastActivityAt),
  index('index_conversations_on_status').on(t.status),
  index('index_conversations_on_user_id').on(t.userId),
]);

export const flowEdges = pgTable('flow_edges', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  flowId: bigint('flow_id', { mode: 'number' }).notNull().references((): AnyPgColumn => flows.id),
  sourceHandle: varchar('source_handle'),
  sourceKey: varchar('source_key').notNull(),
  targetHandle: varchar('target_handle'),
  targetKey: varchar('target_key').notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('index_flow_edges_on_flow_id').on(t.flowId),
]);

export const flowNodes = pgTable('flow_nodes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  data: jsonb('data').default({}).notNull(),
  flowId: bigint('flow_id', { mode: 'number' }).notNull().references((): AnyPgColumn => flows.id),
  key: varchar('key').notNull(),
  nodeType: varchar('node_type').notNull(),
  position: jsonb('position').default({}).notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('index_flow_nodes_on_flow_id_and_key').on(t.flowId, t.key),
  index('index_flow_nodes_on_flow_id').on(t.flowId),
]);

export const flowRuns = pgTable('flow_runs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  contactId: bigint('contact_id', { mode: 'number' }).notNull().references((): AnyPgColumn => contacts.id),
  conversationId: bigint('conversation_id', { mode: 'number' }).references((): AnyPgColumn => conversations.id),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  currentNodeKey: varchar('current_node_key'),
  flowId: bigint('flow_id', { mode: 'number' }).notNull().references((): AnyPgColumn => flows.id),
  status: varchar('status').default('running').notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  variables: jsonb('variables').default({}).notNull(),
  // 0004_salesbot
  waitKind: varchar('wait_kind'),
  resumeAt: timestamp('resume_at', { precision: 6, mode: 'date' }),
  trigger: varchar('trigger'),
  stepsLog: jsonb('steps_log').default([]).notNull(),
}, (t) => [
  index('index_flow_runs_on_contact_id').on(t.contactId),
  index('index_flow_runs_on_conversation_id_and_status').on(t.conversationId, t.status),
  index('index_flow_runs_on_conversation_id').on(t.conversationId),
  index('index_flow_runs_on_flow_id').on(t.flowId),
]);

export const flows = pgTable('flows', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  active: boolean('active').default(true).notNull(),
  channel: varchar('channel'),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  description: text('description'),
  inboxId: bigint('inbox_id', { mode: 'number' }).references((): AnyPgColumn => inboxes.id),
  name: varchar('name').notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  // 0004_salesbot
  definition: jsonb('definition').default({}).notNull(),
  triggerConfig: jsonb('trigger_config').default({}).notNull(),
  settings: jsonb('settings').default({}).notNull(),
  kind: varchar('kind').default('salesbot').notNull(),
}, (t) => [
  index('index_flows_on_account_id_and_active').on(t.accountId, t.active),
  index('index_flows_on_account_id').on(t.accountId),
  index('index_flows_on_inbox_id').on(t.inboxId),
]);

export const globalSettings = pgTable('global_settings', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  key: varchar('key'),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  value: text('value'),
}, (t) => [
  uniqueIndex('index_global_settings_on_key').on(t.key),
]);

export const inboxMembers = pgTable('inbox_members', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  inboxId: bigint('inbox_id', { mode: 'number' }).notNull().references((): AnyPgColumn => inboxes.id),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  userId: bigint('user_id', { mode: 'number' }).notNull().references((): AnyPgColumn => users.id),
}, (t) => [
  uniqueIndex('index_inbox_members_on_inbox_id_and_user_id').on(t.inboxId, t.userId),
  index('index_inbox_members_on_inbox_id').on(t.inboxId),
  index('index_inbox_members_on_user_id').on(t.userId),
]);

export const inboxes = pgTable('inboxes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).references((): AnyPgColumn => accounts.id),
  aiEnabled: boolean('ai_enabled').default(false),
  aiName: varchar('ai_name'),
  aiPrompt: text('ai_prompt'),
  aiTemperature: doublePrecision('ai_temperature').default(0.7),
  apiKey: varchar('api_key'),
  apiUrl: varchar('api_url'),
  botPrompt: text('bot_prompt'),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  followupClosingMessage: text('followup_closing_message'),
  followupEnabled: boolean('followup_enabled').default(false),
  followupMaxAttempts: integer('followup_max_attempts').default(3),
  followupSendClosingMessage: boolean('followup_send_closing_message').default(false),
  followupWaitTimeMinutes: integer('followup_wait_time_minutes').default(120),
  instagramAccessToken: varchar('instagram_access_token'),
  instagramBusinessAccountId: varchar('instagram_business_account_id'),
  instagramPageId: varchar('instagram_page_id'),
  instagramTokenExpiresAt: timestamp('instagram_token_expires_at', { precision: 6, mode: 'date' }),
  instagramUsername: varchar('instagram_username'),
  knowledgeBase: text('knowledge_base'),
  name: varchar('name'),
  outOfOfficeMessage: text('out_of_office_message'),
  phoneNumber: varchar('phone_number'),
  provider: varchar('provider'),
  restrictByPortfolio: boolean('restrict_by_portfolio').default(false).notNull(),
  // 0010_historico_whatsapp: quando a importação completa das conversas terminou
  historyImportedAt: timestamp('history_imported_at', { precision: 6, mode: 'date' }),
  // 0012_caixa_cor_apelido: identificação visual da caixa (lib/conversations inboxBadge)
  color: varchar('color'),
  shortName: varchar('short_name'),
  signMessages: boolean('sign_messages').default(false).notNull(),
  roundRobinGroupId: bigint('round_robin_group_id', { mode: 'number' }).references((): AnyPgColumn => roundRobinGroups.id),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  workingHours: jsonb('working_hours').default([]),
  workingHoursEnabled: boolean('working_hours_enabled').default(false),
}, (t) => [
  index('index_inboxes_on_account_id').on(t.accountId),
  index('index_inboxes_on_instagram_page_id').on(t.instagramPageId),
  index('index_inboxes_on_phone_number').on(t.phoneNumber),
  index('index_inboxes_on_round_robin_group_id').on(t.roundRobinGroupId),
]);

export const internalMessages = pgTable('internal_messages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  readAt: timestamp('read_at', { precision: 6, mode: 'date' }),
  recipientId: bigint('recipient_id', { mode: 'number' }).notNull().references((): AnyPgColumn => users.id),
  senderId: bigint('sender_id', { mode: 'number' }).notNull().references((): AnyPgColumn => users.id),
  text: text('text').notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('index_internal_messages_on_account_id').on(t.accountId),
  index('index_internal_messages_on_recipient_id_and_read_at').on(t.recipientId, t.readAt),
  index('index_internal_messages_on_recipient_id_and_sender_id').on(t.recipientId, t.senderId),
  index('index_internal_messages_on_sender_id_and_recipient_id').on(t.senderId, t.recipientId),
]);

export const jueriActivities = pgTable('jueri_activities', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  contactId: bigint('contact_id', { mode: 'number' }).references((): AnyPgColumn => contacts.id),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  descricao: varchar('descricao').notNull(),
  evento: varchar('evento').notNull(),
  ocorridoEm: timestamp('ocorrido_em', { precision: 6, mode: 'date' }).notNull(),
  payload: jsonb('payload').default({}),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('index_jueri_activities_on_account_id_and_ocorrido_em').on(t.accountId, t.ocorridoEm),
  index('index_jueri_activities_on_account_id').on(t.accountId),
  index('index_jueri_activities_on_contact_id').on(t.contactId),
]);

export const lifecycleEvents = pgTable('lifecycle_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  contactId: bigint('contact_id', { mode: 'number' }).notNull().references((): AnyPgColumn => contacts.id),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  eventType: varchar('event_type').notNull(),
  metadata: jsonb('metadata').default({}),
  occurredAt: timestamp('occurred_at', { precision: 6, mode: 'date' }).notNull(),
  pedidoId: bigint('pedido_id', { mode: 'number' }).references((): AnyPgColumn => pedidos.id),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('index_lifecycle_events_on_account_id_and_event_type').on(t.accountId, t.eventType),
  index('index_lifecycle_events_on_account_id').on(t.accountId),
  index('idx_lifecycle_events_contact_type_time').on(t.contactId, t.eventType, t.occurredAt),
  uniqueIndex('idx_lifecycle_events_iniciada_unica').on(t.contactId).where(sql`((event_type)::text = 'iniciada'::text)`),
  index('index_lifecycle_events_on_contact_id').on(t.contactId),
  index('index_lifecycle_events_on_pedido_id').on(t.pedidoId),
]);

export const messages = pgTable('messages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  conversationId: bigint('conversation_id', { mode: 'number' }).notNull().references((): AnyPgColumn => conversations.id),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  isPrivate: boolean('is_private').default(false),
  senderId: integer('sender_id'),
  senderType: varchar('sender_type').notNull(),
  sourceId: varchar('source_id'),
  status: integer('status').default(0),
  text: text('text'),
  transcription: text('transcription'),
  // 0015_disparos: mensagem enviada por um disparo em massa
  broadcastId: bigint('broadcast_id', { mode: 'number' }),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('index_messages_on_account_id').on(t.accountId),
  index('index_messages_on_conversation_id_and_created_at').on(t.conversationId, t.createdAt),
  index('index_messages_on_conversation_id').on(t.conversationId),
  index('index_messages_on_sender_type_and_sender_id').on(t.senderType, t.senderId),
  index('index_messages_on_source_id').on(t.sourceId),
]);

export const messageTemplates = pgTable('message_templates', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  categoria: varchar('categoria'),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  mensagem: text('mensagem').notNull(),
  nome: varchar('nome').notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('index_message_templates_on_account_id').on(t.accountId),
]);

export const notes = pgTable('notes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  contactId: bigint('contact_id', { mode: 'number' }).notNull().references((): AnyPgColumn => contacts.id),
  content: text('content'),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  userId: bigint('user_id', { mode: 'number' }).references((): AnyPgColumn => users.id),
}, (t) => [
  index('index_notes_on_account_id').on(t.accountId),
  index('index_notes_on_contact_id').on(t.contactId),
  index('index_notes_on_user_id').on(t.userId),
]);

export const notifications = pgTable('notifications', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  audience: varchar('audience'),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  link: varchar('link'),
  message: varchar('message'),
  readAt: timestamp('read_at', { precision: 6, mode: 'date' }),
  title: varchar('title'),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_notifications_account_read_at').on(t.accountId, t.readAt),
  index('index_notifications_on_account_id').on(t.accountId),
]);

export const pedidos = pgTable('pedidos', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  contactId: bigint('contact_id', { mode: 'number' }).notNull().references((): AnyPgColumn => contacts.id),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  dataAcerto: date('data_acerto'),
  dataBaixa: date('data_baixa'),
  dataCancelamento: date('data_cancelamento'),
  dataCriacao: date('data_criacao').notNull(),
  jueriPedidoId: varchar('jueri_pedido_id').notNull(),
  quantidade: integer('quantidade').default(0).notNull(),
  quantidadeAntesBaixa: integer('quantidade_antes_baixa'),
  statusId: integer('status_id').notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  valorTotal: numeric('valor_total', { precision: 12, scale: 2 }),
}, (t) => [
  index('index_pedidos_on_account_id').on(t.accountId),
  index('idx_pedidos_ciclo_vida').on(t.contactId, t.dataCriacao, t.dataBaixa, t.statusId),
  index('idx_pedidos_abertos').on(t.contactId).where(sql`(data_baixa IS NULL)`),
  index('index_pedidos_on_contact_id').on(t.contactId),
  uniqueIndex('index_pedidos_on_jueri_pedido_id').on(t.jueriPedidoId),
]);

export const pipelineCards = pgTable('pipeline_cards', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  contactId: bigint('contact_id', { mode: 'number' }).notNull().references((): AnyPgColumn => contacts.id),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  pipelineId: bigint('pipeline_id', { mode: 'number' }).notNull().references((): AnyPgColumn => pipelines.id),
  pipelineStageId: bigint('pipeline_stage_id', { mode: 'number' }).notNull().references((): AnyPgColumn => pipelineStages.id),
  position: integer('position').default(0).notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  replyTriggeredAt: timestamp('reply_triggered_at', { precision: 6, mode: 'date' }),
  // 0001_funis_kommo
  stageEnteredAt: timestamp('stage_entered_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  value: numeric('value', { precision: 14, scale: 2 }).default('0').notNull(),
  lossReason: varchar('loss_reason'),
  closedAt: timestamp('closed_at', { precision: 6, mode: 'date' }),
}, (t) => [
  index('index_pipeline_cards_on_contact_id').on(t.contactId),
  uniqueIndex('index_pipeline_cards_on_pipeline_id_and_contact_id').on(t.pipelineId, t.contactId),
  index('index_pipeline_cards_on_pipeline_id').on(t.pipelineId),
  index('index_pipeline_cards_on_pipeline_stage_id').on(t.pipelineStageId),
]);

export const pipelineStages = pgTable('pipeline_stages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  color: varchar('color').default('#ff007f'),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  name: varchar('name').notNull(),
  pipelineId: bigint('pipeline_id', { mode: 'number' }).notNull().references((): AnyPgColumn => pipelines.id),
  position: integer('position').default(0).notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  // 0001_funis_kommo
  description: text('description'),
  kind: varchar('kind').default('normal').notNull(),
  // 0009_funil_consignado: etapa do funil Consignado = este status da régua
  statusKey: varchar('status_key'),
}, (t) => [
  index('index_pipeline_stages_on_pipeline_id').on(t.pipelineId),
]);

export const pipelineTriggers = pgTable('pipeline_triggers', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actionType: varchar('action_type').notNull(),
  active: boolean('active').default(true).notNull(),
  config: jsonb('config').default({}).notNull(),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  delayMinutes: integer('delay_minutes').default(0).notNull(),
  pipelineStageId: bigint('pipeline_stage_id', { mode: 'number' }).notNull().references((): AnyPgColumn => pipelineStages.id),
  position: integer('position').default(0).notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  event: varchar('event').default('enter').notNull(),
  // 0001_funis_kommo
  conditions: jsonb('conditions').default([]).notNull(),
  schedule: jsonb('schedule').default({}).notNull(),
}, (t) => [
  index('index_pipeline_triggers_on_pipeline_stage_id').on(t.pipelineStageId),
]);

export const pipelines = pgTable('pipelines', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  name: varchar('name').notNull(),
  position: integer('position').default(0).notNull(),
  slug: varchar('slug').notNull(),
  system: boolean('system').default(false).notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('index_pipelines_on_account_id_and_slug').on(t.accountId, t.slug),
  index('index_pipelines_on_account_id').on(t.accountId),
]);

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  authKey: text('auth_key').notNull(),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  endpoint: text('endpoint').notNull(),
  p256dhKey: text('p256dh_key').notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  userId: bigint('user_id', { mode: 'number' }).notNull().references((): AnyPgColumn => users.id),
}, (t) => [
  uniqueIndex('index_push_subscriptions_on_endpoint').on(t.endpoint),
  index('index_push_subscriptions_on_user_id').on(t.userId),
]);

export const reguaTriggers = pgTable('regua_triggers', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  actionType: varchar('action_type').notNull(),
  active: boolean('active').default(true).notNull(),
  config: jsonb('config').default({}).notNull(),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  delayMinutes: integer('delay_minutes').default(0).notNull(),
  position: integer('position').default(0).notNull(),
  status: varchar('status').notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('index_regua_triggers_on_account_id_and_status').on(t.accountId, t.status),
  index('index_regua_triggers_on_account_id').on(t.accountId),
]);

export const resellerPhones = pgTable('reseller_phones', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  contactId: bigint('contact_id', { mode: 'number' }).notNull().references((): AnyPgColumn => contacts.id),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  label: varchar('label'),
  phone: varchar('phone').notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('index_reseller_phones_on_contact_id_and_phone').on(t.contactId, t.phone),
  index('index_reseller_phones_on_contact_id').on(t.contactId),
  index('index_reseller_phones_on_phone').on(t.phone),
]);

export const roundRobinGroups = pgTable('round_robin_groups', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  name: varchar('name').notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('index_round_robin_groups_on_account_id').on(t.accountId),
]);

export const salesTeamMemberships = pgTable('sales_team_memberships', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  salesTeamId: bigint('sales_team_id', { mode: 'number' }).notNull().references((): AnyPgColumn => salesTeams.id),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  userId: bigint('user_id', { mode: 'number' }).notNull().references((): AnyPgColumn => users.id),
}, (t) => [
  uniqueIndex('index_sales_team_memberships_uniq').on(t.salesTeamId, t.userId),
  index('index_sales_team_memberships_on_sales_team_id').on(t.salesTeamId),
  index('index_sales_team_memberships_on_user_id').on(t.userId),
]);

export const salesTeams = pgTable('sales_teams', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  jueriLiderId: varchar('jueri_lider_id').notNull(),
  nome: varchar('nome').notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('index_sales_teams_on_account_and_lider_id').on(t.accountId, t.jueriLiderId),
  index('index_sales_teams_on_account_id').on(t.accountId),
]);

export const scheduledMessages = pgTable('scheduled_messages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  conversationId: bigint('conversation_id', { mode: 'number' }).notNull().references((): AnyPgColumn => conversations.id),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  sendAt: timestamp('send_at', { precision: 6, mode: 'date' }),
  status: varchar('status').default('pending'),
  text: text('text'),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('index_scheduled_messages_on_conversation_id').on(t.conversationId),
  index('idx_scheduled_messages_status_send_at').on(t.status, t.sendAt),
]);

export const tags = pgTable('tags', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  color: varchar('color').default('#6b7280'),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  name: varchar('name').notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('index_tags_on_account_id_and_name').on(t.accountId, t.name),
  index('index_tags_on_account_id').on(t.accountId),
]);

export const tarefas = pgTable('tarefas', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  concluidaEm: timestamp('concluida_em', { precision: 6, mode: 'date' }),
  concluidaPorId: bigint('concluida_por_id', { mode: 'number' }).references((): AnyPgColumn => users.id),
  contactId: bigint('contact_id', { mode: 'number' }).notNull().references((): AnyPgColumn => contacts.id),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  descricao: text('descricao'),
  prioridade: varchar('prioridade').default('normal').notNull(),
  resultado: text('resultado'),
  status: varchar('status').default('pendente').notNull(),
  tipo: varchar('tipo').notNull(),
  titulo: varchar('titulo').notNull(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  userId: bigint('user_id', { mode: 'number' }).references((): AnyPgColumn => users.id),
  vencimentoEm: timestamp('vencimento_em', { precision: 6, mode: 'date' }),
}, (t) => [
  index('index_tarefas_on_account_id_and_status').on(t.accountId, t.status),
  index('index_tarefas_on_account_id').on(t.accountId),
  index('index_tarefas_on_concluida_por_id').on(t.concluidaPorId),
  uniqueIndex('idx_tarefas_pendente_unica_por_tipo').on(t.contactId, t.tipo).where(sql`((status)::text = 'pendente'::text)`),
  index('index_tarefas_on_contact_id').on(t.contactId),
  index('index_tarefas_on_user_id_and_status').on(t.userId, t.status),
  index('index_tarefas_on_user_id').on(t.userId),
]);

export const users = pgTable('users', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }),
  availableForRoundrobin: boolean('available_for_roundrobin').default(false).notNull(),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  department: varchar('department').default('corretor').notNull(),
  email: varchar('email').default('').notNull(),
  encryptedPassword: varchar('encrypted_password').default('').notNull(),
  firstName: varchar('first_name'),
  jti: varchar('jti'),
  jueriGerenteId: varchar('jueri_gerente_id'),
  lastName: varchar('last_name'),
  permissions: jsonb('permissions').default({}),
  phone: varchar('phone'),
  queuePosition: integer('queue_position'),
  rememberCreatedAt: timestamp('remember_created_at', { precision: 6, mode: 'date' }),
  resetPasswordSentAt: timestamp('reset_password_sent_at', { precision: 6, mode: 'date' }),
  resetPasswordToken: varchar('reset_password_token'),
  role: integer('role'),
  roundRobinGroupId: bigint('round_robin_group_id', { mode: 'number' }).references((): AnyPgColumn => roundRobinGroups.id),
  status: varchar('status').default('active'),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('index_users_on_account_roundrobin_queue').on(t.accountId, t.availableForRoundrobin, t.queuePosition),
  index('index_users_on_account_id').on(t.accountId),
  index('index_users_on_department').on(t.department),
  uniqueIndex('index_users_on_email').on(t.email),
  index('index_users_on_jti').on(t.jti),
  uniqueIndex('index_users_on_reset_password_token').on(t.resetPasswordToken),
  index('index_users_on_round_robin_group_id').on(t.roundRobinGroupId),
]);


// --- 0001_funis_kommo ---------------------------------------------------------------------------
export const lossReasons = pgTable('loss_reasons', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  name: varchar('name').notNull(),
  position: integer('position').default(0).notNull(),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('index_loss_reasons_on_account_id').on(t.accountId),
]);

export const pipelineTriggerRuns = pgTable('pipeline_trigger_runs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  pipelineTriggerId: bigint('pipeline_trigger_id', { mode: 'number' }).notNull().references((): AnyPgColumn => pipelineTriggers.id, { onDelete: 'cascade' }),
  pipelineCardId: bigint('pipeline_card_id', { mode: 'number' }).notNull().references((): AnyPgColumn => pipelineCards.id, { onDelete: 'cascade' }),
  runKey: varchar('run_key').notNull(),
  runAt: timestamp('run_at', { precision: 6, mode: 'date' }).notNull(),
  status: varchar('status').default('pending').notNull(),
  chainDepth: integer('chain_depth').default(0).notNull(),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('idx_trigger_runs_unique').on(t.pipelineTriggerId, t.pipelineCardId, t.runKey),
  index('idx_trigger_runs_pending').on(t.status, t.runAt),
]);

// --- 0002_eventos_metas --------------------------------------------------------------------------
export const activityEvents = pgTable('activity_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  userId: bigint('user_id', { mode: 'number' }).references((): AnyPgColumn => users.id),
  contactId: bigint('contact_id', { mode: 'number' }).references((): AnyPgColumn => contacts.id, { onDelete: 'cascade' }),
  objectType: varchar('object_type').notNull(),
  objectId: bigint('object_id', { mode: 'number' }),
  objectName: varchar('object_name'),
  eventType: varchar('event_type').notNull(),
  valueBefore: text('value_before'),
  valueAfter: text('value_after'),
  meta: jsonb('meta').default({}).notNull(),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_activity_events_account_created').on(t.accountId, t.createdAt),
  index('idx_activity_events_contact').on(t.contactId),
  index('idx_activity_events_type').on(t.accountId, t.eventType, t.createdAt),
]);

export const salesGoals = pgTable('sales_goals', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  userId: bigint('user_id', { mode: 'number' }).notNull().references((): AnyPgColumn => users.id),
  month: varchar('month').notNull(),
  valueGoal: numeric('value_goal', { precision: 14, scale: 2 }).default('0').notNull(),
  countGoal: integer('count_goal').default(0).notNull(),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('idx_sales_goals_user_month').on(t.userId, t.month),
]);

// --- 0005_agente_ia -----------------------------------------------------------------------------
export const aiAgents = pgTable('ai_agents', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  name: varchar('name').notNull(),
  active: boolean('active').default(false).notNull(),
  persona: jsonb('persona').default({}).notNull(),
  actions: jsonb('actions').default([]).notNull(),
  settings: jsonb('settings').default({}).notNull(),
  channels: jsonb('channels').default([]).notNull(),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_ai_agents_account').on(t.accountId),
]);

export const aiAgentSources = pgTable('ai_agent_sources', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  agentId: bigint('agent_id', { mode: 'number' }).notNull().references((): AnyPgColumn => aiAgents.id, { onDelete: 'cascade' }),
  kind: varchar('kind').default('text').notNull(),
  title: varchar('title').notNull(),
  content: text('content').default('').notNull(),
  url: varchar('url'),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_ai_agent_sources_agent').on(t.agentId),
]);

export const aiAgentSessions = pgTable('ai_agent_sessions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  agentId: bigint('agent_id', { mode: 'number' }).notNull().references((): AnyPgColumn => aiAgents.id, { onDelete: 'cascade' }),
  conversationId: bigint('conversation_id', { mode: 'number' }).notNull().references((): AnyPgColumn => conversations.id, { onDelete: 'cascade' }),
  contactId: bigint('contact_id', { mode: 'number' }).notNull().references((): AnyPgColumn => contacts.id, { onDelete: 'cascade' }),
  status: varchar('status').default('active').notNull(),
  replies: integer('replies').default(0).notNull(),
  meta: jsonb('meta').default({}).notNull(),
  startedAt: timestamp('started_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('idx_ai_agent_sessions_agent_conv').on(t.agentId, t.conversationId),
  index('idx_ai_agent_sessions_conv_status').on(t.conversationId, t.status),
]);

export const aiAgentLogs = pgTable('ai_agent_logs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  agentId: bigint('agent_id', { mode: 'number' }).notNull().references((): AnyPgColumn => aiAgents.id, { onDelete: 'cascade' }),
  conversationId: bigint('conversation_id', { mode: 'number' }).references((): AnyPgColumn => conversations.id, { onDelete: 'set null' }),
  contactId: bigint('contact_id', { mode: 'number' }).references((): AnyPgColumn => contacts.id, { onDelete: 'set null' }),
  kind: varchar('kind').notNull(),
  detail: jsonb('detail').default({}).notNull(),
  tokens: integer('tokens').default(0).notNull(),
  responseMs: integer('response_ms'),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_ai_agent_logs_agent_created').on(t.agentId, t.createdAt),
]);

// --- 0006_jueri_webhook --------------------------------------------------------------------------
export const jueriWebhookEvents = pgTable('jueri_webhook_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  event: varchar('event'),
  payload: jsonb('payload').default({}).notNull(),
  headers: jsonb('headers').default({}).notNull(),
  signatureOk: boolean('signature_ok'),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_jueri_webhook_events_account_created').on(t.accountId, t.createdAt),
]);

// --- 0008_chats_equipe ---------------------------------------------------------------------------
export const teamChats = pgTable('team_chats', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  kind: varchar('kind').default('direct').notNull(),
  name: varchar('name'),
  directKey: varchar('direct_key'),
  contactId: bigint('contact_id', { mode: 'number' }).references((): AnyPgColumn => contacts.id, { onDelete: 'set null' }),
  conversationId: bigint('conversation_id', { mode: 'number' }).references((): AnyPgColumn => conversations.id, { onDelete: 'set null' }),
  createdById: bigint('created_by_id', { mode: 'number' }).references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
  lastMessageAt: timestamp('last_message_at', { precision: 6, mode: 'date' }),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
});

export const teamChatMembers = pgTable('team_chat_members', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  chatId: bigint('chat_id', { mode: 'number' }).notNull().references((): AnyPgColumn => teamChats.id, { onDelete: 'cascade' }),
  userId: bigint('user_id', { mode: 'number' }).notNull().references((): AnyPgColumn => users.id, { onDelete: 'cascade' }),
  lastReadAt: timestamp('last_read_at', { precision: 6, mode: 'date' }),
  starred: boolean('starred').default(false).notNull(),
  muted: boolean('muted').default(false).notNull(),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('idx_team_chat_members_chat_user').on(t.chatId, t.userId),
  index('idx_team_chat_members_user').on(t.userId),
]);

export const teamChatMessages = pgTable('team_chat_messages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  chatId: bigint('chat_id', { mode: 'number' }).notNull().references((): AnyPgColumn => teamChats.id, { onDelete: 'cascade' }),
  senderId: bigint('sender_id', { mode: 'number' }).references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
  kind: varchar('kind').default('text').notNull(),
  text: text('text'),
  oldInternalId: bigint('old_internal_id', { mode: 'number' }),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('idx_team_chat_messages_chat_created').on(t.chatId, t.createdAt),
]);

// 0015_disparos — disparo em massa (lib/disparos.ts)
export const broadcasts = pgTable('broadcasts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  accountId: bigint('account_id', { mode: 'number' }).notNull().references((): AnyPgColumn => accounts.id),
  inboxId: bigint('inbox_id', { mode: 'number' }).references((): AnyPgColumn => inboxes.id),
  createdById: bigint('created_by_id', { mode: 'number' }).references((): AnyPgColumn => users.id),
  name: varchar('name').notNull(),
  filters: jsonb('filters').default({}).notNull(),
  text: text('text'),
  flowId: bigint('flow_id', { mode: 'number' }),
  status: varchar('status').default('draft').notNull(),
  pauseReason: varchar('pause_reason'),
  scheduledAt: timestamp('scheduled_at', { precision: 6, mode: 'date' }),
  startedAt: timestamp('started_at', { precision: 6, mode: 'date' }),
  finishedAt: timestamp('finished_at', { precision: 6, mode: 'date' }),
  nextSendAt: timestamp('next_send_at', { precision: 6, mode: 'date' }),
  minIntervalSeconds: integer('min_interval_seconds').default(30).notNull(),
  maxIntervalSeconds: integer('max_interval_seconds').default(90).notNull(),
  dailyLimit: integer('daily_limit').default(200).notNull(),
  startHour: integer('start_hour').default(8).notNull(),
  endHour: integer('end_hour').default(20).notNull(),
  cooldownDays: integer('cooldown_days').default(0).notNull(),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('index_broadcasts_on_account_id').on(t.accountId),
  index('index_broadcasts_on_status').on(t.status),
]);

export const broadcastRecipients = pgTable('broadcast_recipients', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  broadcastId: bigint('broadcast_id', { mode: 'number' }).notNull().references((): AnyPgColumn => broadcasts.id),
  contactId: bigint('contact_id', { mode: 'number' }).notNull().references((): AnyPgColumn => contacts.id),
  status: varchar('status').default('pending').notNull(),
  error: varchar('error'),
  messageId: bigint('message_id', { mode: 'number' }),
  sentAt: timestamp('sent_at', { precision: 6, mode: 'date' }),
  repliedAt: timestamp('replied_at', { precision: 6, mode: 'date' }),
  createdAt: timestamp('created_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 6, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('index_broadcast_recipients_unique').on(t.broadcastId, t.contactId),
  index('index_broadcast_recipients_on_contact_id').on(t.contactId),
  index('index_broadcast_recipients_on_status').on(t.broadcastId, t.status),
]);
