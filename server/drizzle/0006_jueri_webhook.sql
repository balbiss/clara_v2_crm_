-- Webhook do Jueri na v2: guarda cada evento recebido do jeito que chegou (corpo + cabeçalhos),
-- pra validar os campos antes de ligar a sincronização. Só acrescenta tabela; nada da v1 muda.
CREATE TABLE IF NOT EXISTS "jueri_webhook_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL REFERENCES "accounts"("id"),
	"event" varchar,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"signature_ok" boolean,
	"created_at" timestamp(6) DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_jueri_webhook_events_account_created" ON "jueri_webhook_events" ("account_id", "created_at");
