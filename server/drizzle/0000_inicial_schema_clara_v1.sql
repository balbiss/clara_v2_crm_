CREATE TABLE IF NOT EXISTS "accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"contact_custom_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"facebook_page_access_token" varchar,
	"facebook_page_id" varchar,
	"facebook_page_name" varchar,
	"facebook_token_expires_at" timestamp (6),
	"jueri_webhook_token" varchar,
	"min_pecas_ativa" integer DEFAULT 25 NOT NULL,
	"name" varchar,
	"stripe_customer_id" varchar,
	"stripe_subscription_id" varchar,
	"subscription_status" varchar,
	"trial_ends_at" timestamp (6),
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "active_storage_attachments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"blob_id" bigint NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"name" varchar NOT NULL,
	"record_id" bigint NOT NULL,
	"record_type" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "active_storage_blobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"byte_size" bigint NOT NULL,
	"checksum" varchar,
	"content_type" varchar,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"filename" varchar NOT NULL,
	"key" varchar NOT NULL,
	"metadata" text,
	"service_name" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "active_storage_variant_records" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"blob_id" bigint NOT NULL,
	"variation_digest" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agendamentos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"contact_id" bigint,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"descricao" text,
	"fim_em" timestamp (6),
	"inicio_em" timestamp (6) NOT NULL,
	"tipo" varchar DEFAULT 'outro' NOT NULL,
	"titulo" varchar NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL,
	"user_id" bigint NOT NULL,
	"valor" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"changed_by_id" bigint,
	"contact_id" bigint NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"event_type" varchar NOT NULL,
	"from_value" varchar,
	"to_value" varchar,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_field_groups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"field_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"name" varchar NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_tags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contact_id" bigint NOT NULL,
	"tag_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"address_complement" varchar,
	"address_number" varchar,
	"avatar_url" varchar,
	"bio" text,
	"birth_date" date,
	"cep" varchar,
	"city" varchar,
	"company_name" varchar,
	"country" varchar,
	"cpf" varchar,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"custom_attributes" jsonb DEFAULT '{}'::jsonb,
	"cycle_started_at" timestamp (6),
	"desconsiderado" boolean DEFAULT false NOT NULL,
	"desconsiderado_at" timestamp (6),
	"desconsiderado_motivo" varchar,
	"email" varchar,
	"first_name" varchar,
	"id_jueri" varchar,
	"instagram_id" varchar,
	"intention" varchar,
	"jid" varchar,
	"jueri_synced_at" timestamp (6),
	"last_name" varchar,
	"name" varchar,
	"neighborhood" varchar,
	"nivel" varchar,
	"pecas_abertas_atual" integer DEFAULT 0 NOT NULL,
	"pedidos_abertos_count" integer DEFAULT 0 NOT NULL,
	"phone" varchar,
	"snapshot_calculado_em" timestamp (6),
	"source" varchar,
	"state" varchar,
	"status" varchar,
	"status_changed_at" timestamp (6),
	"street" varchar,
	"temperature" varchar,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL,
	"user_id" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_tags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"conversation_id" bigint NOT NULL,
	"tag_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"contact_id" bigint NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"followup_count" integer DEFAULT 0,
	"inbox_id" bigint,
	"last_activity_at" timestamp (6),
	"snoozed_until" timestamp (6),
	"source" varchar,
	"status" integer DEFAULT 0,
	"unread_count" integer DEFAULT 0,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL,
	"user_id" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flow_edges" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"flow_id" bigint NOT NULL,
	"source_handle" varchar,
	"source_key" varchar NOT NULL,
	"target_handle" varchar,
	"target_key" varchar NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flow_nodes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"flow_id" bigint NOT NULL,
	"key" varchar NOT NULL,
	"node_type" varchar NOT NULL,
	"position" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flow_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contact_id" bigint NOT NULL,
	"conversation_id" bigint NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"current_node_key" varchar,
	"flow_id" bigint NOT NULL,
	"status" varchar DEFAULT 'running' NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flows" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"channel" varchar,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"description" text,
	"inbox_id" bigint,
	"name" varchar NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "global_settings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"key" varchar,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL,
	"value" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbox_members" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"inbox_id" bigint NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL,
	"user_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inboxes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint,
	"ai_enabled" boolean DEFAULT false,
	"ai_name" varchar,
	"ai_prompt" text,
	"ai_temperature" double precision DEFAULT 0.7,
	"api_key" varchar,
	"api_url" varchar,
	"bot_prompt" text,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"followup_closing_message" text,
	"followup_enabled" boolean DEFAULT false,
	"followup_max_attempts" integer DEFAULT 3,
	"followup_send_closing_message" boolean DEFAULT false,
	"followup_wait_time_minutes" integer DEFAULT 120,
	"instagram_access_token" varchar,
	"instagram_business_account_id" varchar,
	"instagram_page_id" varchar,
	"instagram_token_expires_at" timestamp (6),
	"instagram_username" varchar,
	"knowledge_base" text,
	"name" varchar,
	"out_of_office_message" text,
	"phone_number" varchar,
	"provider" varchar,
	"restrict_by_portfolio" boolean DEFAULT false NOT NULL,
	"sign_messages" boolean DEFAULT false NOT NULL,
	"round_robin_group_id" bigint,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL,
	"working_hours" jsonb DEFAULT '[]'::jsonb,
	"working_hours_enabled" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "internal_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"read_at" timestamp (6),
	"recipient_id" bigint NOT NULL,
	"sender_id" bigint NOT NULL,
	"text" text NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jueri_activities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"contact_id" bigint,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"descricao" varchar NOT NULL,
	"evento" varchar NOT NULL,
	"ocorrido_em" timestamp (6) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lifecycle_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"contact_id" bigint NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"event_type" varchar NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"occurred_at" timestamp (6) NOT NULL,
	"pedido_id" bigint,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_templates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"categoria" varchar,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"mensagem" text NOT NULL,
	"nome" varchar NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"conversation_id" bigint NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"is_private" boolean DEFAULT false,
	"sender_id" integer,
	"sender_type" varchar NOT NULL,
	"source_id" varchar,
	"status" integer DEFAULT 0,
	"text" text,
	"transcription" text,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"contact_id" bigint NOT NULL,
	"content" text,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL,
	"user_id" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"audience" varchar,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"link" varchar,
	"message" varchar,
	"read_at" timestamp (6),
	"title" varchar,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pedidos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"contact_id" bigint NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"data_acerto" date,
	"data_baixa" date,
	"data_cancelamento" date,
	"data_criacao" date NOT NULL,
	"jueri_pedido_id" varchar NOT NULL,
	"quantidade" integer DEFAULT 0 NOT NULL,
	"quantidade_antes_baixa" integer,
	"status_id" integer NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL,
	"valor_total" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_cards" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contact_id" bigint NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"pipeline_id" bigint NOT NULL,
	"pipeline_stage_id" bigint NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_stages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"color" varchar DEFAULT '#ff007f',
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"name" varchar NOT NULL,
	"pipeline_id" bigint NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_triggers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"action_type" varchar NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"delay_minutes" integer DEFAULT 0 NOT NULL,
	"pipeline_stage_id" bigint NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipelines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"name" varchar NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"slug" varchar NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"auth_key" text NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh_key" text NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL,
	"user_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "regua_triggers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"action_type" varchar NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"delay_minutes" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" varchar NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reseller_phones" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contact_id" bigint NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"label" varchar,
	"phone" varchar NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "round_robin_groups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"name" varchar NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_team_memberships" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"sales_team_id" bigint NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL,
	"user_id" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_teams" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"jueri_lider_id" varchar NOT NULL,
	"nome" varchar NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"conversation_id" bigint NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"send_at" timestamp (6),
	"status" varchar DEFAULT 'pending',
	"text" text,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"color" varchar DEFAULT '#6b7280',
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"name" varchar NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tarefas" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"concluida_em" timestamp (6),
	"concluida_por_id" bigint,
	"contact_id" bigint NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"descricao" text,
	"prioridade" varchar DEFAULT 'normal' NOT NULL,
	"resultado" text,
	"status" varchar DEFAULT 'pendente' NOT NULL,
	"tipo" varchar NOT NULL,
	"titulo" varchar NOT NULL,
	"updated_at" timestamp (6) DEFAULT now() NOT NULL,
	"user_id" bigint,
	"vencimento_em" timestamp (6)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint,
	"available_for_roundrobin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (6) DEFAULT now() NOT NULL,
	"department" varchar DEFAULT 'corretor' NOT NULL,
	"email" varchar DEFAULT '' NOT NULL,
	"encrypted_password" varchar DEFAULT '' NOT NULL,
	"first_name" varchar,
	"jti" varchar,
	"jueri_gerente_id" varchar,
	"last_name" varchar,
	"permissions" jsonb DEFAULT '{}'::jsonb,
	"phone" varchar,
	"queue_position" integer,
	"remember_created_at" timestamp (6),
	"reset_password_sent_at" timestamp (6),
	"reset_password_token" varchar,
	"role" integer,
	"round_robin_group_id" bigint,
	"status" varchar DEFAULT 'active',
	"updated_at" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "active_storage_attachments" ADD CONSTRAINT "active_storage_attachments_blob_id_active_storage_blobs_id_fk" FOREIGN KEY ("blob_id") REFERENCES "public"."active_storage_blobs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "active_storage_variant_records" ADD CONSTRAINT "active_storage_variant_records_blob_id_active_storage_blobs_id_fk" FOREIGN KEY ("blob_id") REFERENCES "public"."active_storage_blobs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_audit_events" ADD CONSTRAINT "contact_audit_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_audit_events" ADD CONSTRAINT "contact_audit_events_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_audit_events" ADD CONSTRAINT "contact_audit_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_field_groups" ADD CONSTRAINT "contact_field_groups_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_inbox_id_inboxes_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."inboxes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "flow_edges" ADD CONSTRAINT "flow_edges_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "flow_nodes" ADD CONSTRAINT "flow_nodes_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "flows" ADD CONSTRAINT "flows_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "flows" ADD CONSTRAINT "flows_inbox_id_inboxes_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."inboxes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_members" ADD CONSTRAINT "inbox_members_inbox_id_inboxes_id_fk" FOREIGN KEY ("inbox_id") REFERENCES "public"."inboxes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_members" ADD CONSTRAINT "inbox_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inboxes" ADD CONSTRAINT "inboxes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inboxes" ADD CONSTRAINT "inboxes_round_robin_group_id_round_robin_groups_id_fk" FOREIGN KEY ("round_robin_group_id") REFERENCES "public"."round_robin_groups"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "internal_messages" ADD CONSTRAINT "internal_messages_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "internal_messages" ADD CONSTRAINT "internal_messages_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "internal_messages" ADD CONSTRAINT "internal_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jueri_activities" ADD CONSTRAINT "jueri_activities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jueri_activities" ADD CONSTRAINT "jueri_activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lifecycle_events" ADD CONSTRAINT "lifecycle_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lifecycle_events" ADD CONSTRAINT "lifecycle_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lifecycle_events" ADD CONSTRAINT "lifecycle_events_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notes" ADD CONSTRAINT "notes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notes" ADD CONSTRAINT "notes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pipeline_cards" ADD CONSTRAINT "pipeline_cards_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pipeline_cards" ADD CONSTRAINT "pipeline_cards_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pipeline_cards" ADD CONSTRAINT "pipeline_cards_pipeline_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("pipeline_stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pipeline_triggers" ADD CONSTRAINT "pipeline_triggers_pipeline_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("pipeline_stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "regua_triggers" ADD CONSTRAINT "regua_triggers_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reseller_phones" ADD CONSTRAINT "reseller_phones_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "round_robin_groups" ADD CONSTRAINT "round_robin_groups_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_team_memberships" ADD CONSTRAINT "sales_team_memberships_sales_team_id_sales_teams_id_fk" FOREIGN KEY ("sales_team_id") REFERENCES "public"."sales_teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_team_memberships" ADD CONSTRAINT "sales_team_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_teams" ADD CONSTRAINT "sales_teams_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tags" ADD CONSTRAINT "tags_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_concluida_por_id_users_id_fk" FOREIGN KEY ("concluida_por_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_round_robin_group_id_round_robin_groups_id_fk" FOREIGN KEY ("round_robin_group_id") REFERENCES "public"."round_robin_groups"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_accounts_on_facebook_page_id" ON "accounts" USING btree ("facebook_page_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_accounts_on_jueri_webhook_token" ON "accounts" USING btree ("jueri_webhook_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_active_storage_attachments_on_blob_id" ON "active_storage_attachments" USING btree ("blob_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_active_storage_attachments_uniqueness" ON "active_storage_attachments" USING btree ("record_type","record_id","name","blob_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_active_storage_blobs_on_key" ON "active_storage_blobs" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_active_storage_variant_records_uniqueness" ON "active_storage_variant_records" USING btree ("blob_id","variation_digest");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_agendamentos_on_account_id_and_inicio_em" ON "agendamentos" USING btree ("account_id","inicio_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_agendamentos_on_account_id" ON "agendamentos" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_agendamentos_on_contact_id" ON "agendamentos" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_agendamentos_on_user_id_and_inicio_em" ON "agendamentos" USING btree ("user_id","inicio_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_agendamentos_on_user_id" ON "agendamentos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_contact_audit_events_on_account_id_and_event_type" ON "contact_audit_events" USING btree ("account_id","event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_contact_audit_events_on_account_id" ON "contact_audit_events" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_contact_audit_events_on_changed_by_id" ON "contact_audit_events" USING btree ("changed_by_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contact_audit_events_contact_type_time" ON "contact_audit_events" USING btree ("contact_id","event_type","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_contact_audit_events_on_contact_id" ON "contact_audit_events" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_contact_field_groups_on_account_id" ON "contact_field_groups" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_contact_tags_on_contact_and_tag" ON "contact_tags" USING btree ("contact_id","tag_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_contact_tags_on_contact_id" ON "contact_tags" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_contact_tags_on_tag_id" ON "contact_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_account_created_at" ON "contacts" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_contacts_on_account_id_and_desconsiderado" ON "contacts" USING btree ("account_id","desconsiderado");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_contacts_on_account_id_and_id_jueri" ON "contacts" USING btree ("account_id","id_jueri");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_contacts_on_account_id_and_instagram_id" ON "contacts" USING btree ("account_id","instagram_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_contacts_account_jid_unique" ON "contacts" USING btree ("account_id","jid") WHERE (jid IS NOT NULL);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_contacts_on_account_id_and_jid" ON "contacts" USING btree ("account_id","jid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_contacts_on_account_id_and_nivel" ON "contacts" USING btree ("account_id","nivel");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_account_source" ON "contacts" USING btree ("account_id","source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_contacts_on_account_id_and_status" ON "contacts" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contacts_account_temperature" ON "contacts" USING btree ("account_id","temperature");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_contacts_on_account_id" ON "contacts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_contacts_on_instagram_id" ON "contacts" USING btree ("instagram_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_contacts_on_jid" ON "contacts" USING btree ("jid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_contacts_on_pecas_abertas_atual" ON "contacts" USING btree ("pecas_abertas_atual");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_contacts_on_phone" ON "contacts" USING btree ("phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_contacts_on_status_changed_at" ON "contacts" USING btree ("status_changed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_contacts_on_user_id" ON "contacts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_conversation_tags_on_conversation_and_tag" ON "conversation_tags" USING btree ("conversation_id","tag_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_conversation_tags_on_conversation_id" ON "conversation_tags" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_conversation_tags_on_tag_id" ON "conversation_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_conversations_on_account_id_and_status" ON "conversations" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_conversations_on_account_id" ON "conversations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_conversations_on_contact_id" ON "conversations" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_inbox_status" ON "conversations" USING btree ("inbox_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_conversations_on_inbox_id" ON "conversations" USING btree ("inbox_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_conversations_on_last_activity_at" ON "conversations" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_conversations_on_status" ON "conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_conversations_on_user_id" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_flow_edges_on_flow_id" ON "flow_edges" USING btree ("flow_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_flow_nodes_on_flow_id_and_key" ON "flow_nodes" USING btree ("flow_id","key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_flow_nodes_on_flow_id" ON "flow_nodes" USING btree ("flow_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_flow_runs_on_contact_id" ON "flow_runs" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_flow_runs_on_conversation_id_and_status" ON "flow_runs" USING btree ("conversation_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_flow_runs_on_conversation_id" ON "flow_runs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_flow_runs_on_flow_id" ON "flow_runs" USING btree ("flow_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_flows_on_account_id_and_active" ON "flows" USING btree ("account_id","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_flows_on_account_id" ON "flows" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_flows_on_inbox_id" ON "flows" USING btree ("inbox_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_global_settings_on_key" ON "global_settings" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_inbox_members_on_inbox_id_and_user_id" ON "inbox_members" USING btree ("inbox_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_inbox_members_on_inbox_id" ON "inbox_members" USING btree ("inbox_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_inbox_members_on_user_id" ON "inbox_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_inboxes_on_account_id" ON "inboxes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_inboxes_on_instagram_page_id" ON "inboxes" USING btree ("instagram_page_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_inboxes_on_phone_number" ON "inboxes" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_inboxes_on_round_robin_group_id" ON "inboxes" USING btree ("round_robin_group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_internal_messages_on_account_id" ON "internal_messages" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_internal_messages_on_recipient_id_and_read_at" ON "internal_messages" USING btree ("recipient_id","read_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_internal_messages_on_recipient_id_and_sender_id" ON "internal_messages" USING btree ("recipient_id","sender_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_internal_messages_on_sender_id_and_recipient_id" ON "internal_messages" USING btree ("sender_id","recipient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_jueri_activities_on_account_id_and_ocorrido_em" ON "jueri_activities" USING btree ("account_id","ocorrido_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_jueri_activities_on_account_id" ON "jueri_activities" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_jueri_activities_on_contact_id" ON "jueri_activities" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_lifecycle_events_on_account_id_and_event_type" ON "lifecycle_events" USING btree ("account_id","event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_lifecycle_events_on_account_id" ON "lifecycle_events" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lifecycle_events_contact_type_time" ON "lifecycle_events" USING btree ("contact_id","event_type","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_lifecycle_events_iniciada_unica" ON "lifecycle_events" USING btree ("contact_id") WHERE ((event_type)::text = 'iniciada'::text);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_lifecycle_events_on_contact_id" ON "lifecycle_events" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_lifecycle_events_on_pedido_id" ON "lifecycle_events" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_message_templates_on_account_id" ON "message_templates" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_messages_on_account_id" ON "messages" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_messages_on_conversation_id_and_created_at" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_messages_on_conversation_id" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_messages_on_sender_type_and_sender_id" ON "messages" USING btree ("sender_type","sender_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_messages_on_source_id" ON "messages" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_notes_on_account_id" ON "notes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_notes_on_contact_id" ON "notes" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_notes_on_user_id" ON "notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_account_read_at" ON "notifications" USING btree ("account_id","read_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_notifications_on_account_id" ON "notifications" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_pedidos_on_account_id" ON "pedidos" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pedidos_ciclo_vida" ON "pedidos" USING btree ("contact_id","data_criacao","data_baixa","status_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pedidos_abertos" ON "pedidos" USING btree ("contact_id") WHERE (data_baixa IS NULL);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_pedidos_on_contact_id" ON "pedidos" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_pedidos_on_jueri_pedido_id" ON "pedidos" USING btree ("jueri_pedido_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_pipeline_cards_on_contact_id" ON "pipeline_cards" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_pipeline_cards_on_pipeline_id_and_contact_id" ON "pipeline_cards" USING btree ("pipeline_id","contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_pipeline_cards_on_pipeline_id" ON "pipeline_cards" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_pipeline_cards_on_pipeline_stage_id" ON "pipeline_cards" USING btree ("pipeline_stage_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_pipeline_stages_on_pipeline_id" ON "pipeline_stages" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_pipeline_triggers_on_pipeline_stage_id" ON "pipeline_triggers" USING btree ("pipeline_stage_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_pipelines_on_account_id_and_slug" ON "pipelines" USING btree ("account_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_pipelines_on_account_id" ON "pipelines" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_push_subscriptions_on_endpoint" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_push_subscriptions_on_user_id" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_regua_triggers_on_account_id_and_status" ON "regua_triggers" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_regua_triggers_on_account_id" ON "regua_triggers" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_reseller_phones_on_contact_id_and_phone" ON "reseller_phones" USING btree ("contact_id","phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_reseller_phones_on_contact_id" ON "reseller_phones" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_reseller_phones_on_phone" ON "reseller_phones" USING btree ("phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_round_robin_groups_on_account_id" ON "round_robin_groups" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_sales_team_memberships_uniq" ON "sales_team_memberships" USING btree ("sales_team_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_sales_team_memberships_on_sales_team_id" ON "sales_team_memberships" USING btree ("sales_team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_sales_team_memberships_on_user_id" ON "sales_team_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_sales_teams_on_account_and_lider_id" ON "sales_teams" USING btree ("account_id","jueri_lider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_sales_teams_on_account_id" ON "sales_teams" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_scheduled_messages_on_conversation_id" ON "scheduled_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduled_messages_status_send_at" ON "scheduled_messages" USING btree ("status","send_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_tags_on_account_id_and_name" ON "tags" USING btree ("account_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_tags_on_account_id" ON "tags" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_tarefas_on_account_id_and_status" ON "tarefas" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_tarefas_on_account_id" ON "tarefas" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_tarefas_on_concluida_por_id" ON "tarefas" USING btree ("concluida_por_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tarefas_pendente_unica_por_tipo" ON "tarefas" USING btree ("contact_id","tipo") WHERE ((status)::text = 'pendente'::text);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_tarefas_on_contact_id" ON "tarefas" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_tarefas_on_user_id_and_status" ON "tarefas" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_tarefas_on_user_id" ON "tarefas" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_users_on_account_roundrobin_queue" ON "users" USING btree ("account_id","available_for_roundrobin","queue_position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_users_on_account_id" ON "users" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_users_on_department" ON "users" USING btree ("department");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_users_on_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_users_on_jti" ON "users" USING btree ("jti");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_users_on_reset_password_token" ON "users" USING btree ("reset_password_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_users_on_round_robin_group_id" ON "users" USING btree ("round_robin_group_id");