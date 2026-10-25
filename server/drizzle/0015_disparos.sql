-- Disparos em massa (Comunicações › Disparos): uma mensagem/robô pra uma lista filtrada, saindo por
-- um número escolhido, um de cada vez, com intervalo aleatório, limite diário por número e horário.
CREATE TABLE IF NOT EXISTS "broadcasts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL REFERENCES "accounts"("id"),
	"inbox_id" bigint REFERENCES "inboxes"("id") ON DELETE SET NULL,
	"created_by_id" bigint REFERENCES "users"("id") ON DELETE SET NULL,
	"name" varchar NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"text" text,
	"flow_id" bigint,
	"status" varchar DEFAULT 'draft' NOT NULL,
	"pause_reason" varchar,
	"scheduled_at" timestamp(6),
	"started_at" timestamp(6),
	"finished_at" timestamp(6),
	"next_send_at" timestamp(6),
	"min_interval_seconds" integer DEFAULT 30 NOT NULL,
	"max_interval_seconds" integer DEFAULT 90 NOT NULL,
	"daily_limit" integer DEFAULT 200 NOT NULL,
	"start_hour" integer DEFAULT 8 NOT NULL,
	"end_hour" integer DEFAULT 20 NOT NULL,
	"cooldown_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp(6) DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "index_broadcasts_on_account_id" ON "broadcasts" ("account_id");
CREATE INDEX IF NOT EXISTS "index_broadcasts_on_status" ON "broadcasts" ("status");

CREATE TABLE IF NOT EXISTS "broadcast_recipients" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"broadcast_id" bigint NOT NULL REFERENCES "broadcasts"("id") ON DELETE CASCADE,
	"contact_id" bigint NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"error" varchar,
	"message_id" bigint,
	"sent_at" timestamp(6),
	"replied_at" timestamp(6),
	"created_at" timestamp(6) DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "index_broadcast_recipients_unique" ON "broadcast_recipients" ("broadcast_id", "contact_id");
CREATE INDEX IF NOT EXISTS "index_broadcast_recipients_on_contact_id" ON "broadcast_recipients" ("contact_id");
CREATE INDEX IF NOT EXISTS "index_broadcast_recipients_on_status" ON "broadcast_recipients" ("broadcast_id", "status");

-- mensagem que saiu de um disparo (rótulo "Disparo" na conversa)
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "broadcast_id" bigint;
