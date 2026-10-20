-- Funis no padrão do Kommo (docs/KOMMO_PARIDADE.md). Só ACRESCENTA colunas/tabelas: as colunas da
-- v1 ficam iguais, então a cópia de dados da v1 continua direta.

-- v1 (2026-10-16) já tem estas duas; o schema inicial do v2 foi gerado antes delas.
ALTER TABLE "pipeline_triggers" ADD COLUMN IF NOT EXISTS "event" varchar DEFAULT 'enter' NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_cards" ADD COLUMN IF NOT EXISTS "reply_triggered_at" timestamp(6);--> statement-breakpoint

-- Gatilho: condições (só roda se o campo X = Y) e agenda (diário/semanal/data fixa).
ALTER TABLE "pipeline_triggers" ADD COLUMN IF NOT EXISTS "conditions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_triggers" ADD COLUMN IF NOT EXISTS "schedule" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint

-- Etapa: check-list do topo da coluna e tipo (normal | won | lost).
ALTER TABLE "pipeline_stages" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD COLUMN IF NOT EXISTS "kind" varchar DEFAULT 'normal' NOT NULL;--> statement-breakpoint

-- Card = o "lead" do Kommo: valor, quando entrou na etapa, ganho/perdido + motivo.
ALTER TABLE "pipeline_cards" ADD COLUMN IF NOT EXISTS "stage_entered_at" timestamp(6) DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_cards" ADD COLUMN IF NOT EXISTS "value" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_cards" ADD COLUMN IF NOT EXISTS "loss_reason" varchar;--> statement-breakpoint
ALTER TABLE "pipeline_cards" ADD COLUMN IF NOT EXISTS "closed_at" timestamp(6);--> statement-breakpoint

-- Motivos de venda perdida (Kommo: Desqualificado, Fora do estado...).
CREATE TABLE IF NOT EXISTS "loss_reasons" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL REFERENCES "accounts"("id"),
	"name" varchar NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp(6) DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_loss_reasons_on_account_id" ON "loss_reasons" ("account_id");--> statement-breakpoint

-- Execuções de gatilho: fila dos atrasados ("depois de 72 horas") e trava anti-duplicação dos
-- agendados/por data (1 execução por gatilho + card + run_key).
CREATE TABLE IF NOT EXISTS "pipeline_trigger_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"pipeline_trigger_id" bigint NOT NULL REFERENCES "pipeline_triggers"("id") ON DELETE CASCADE,
	"pipeline_card_id" bigint NOT NULL REFERENCES "pipeline_cards"("id") ON DELETE CASCADE,
	"run_key" varchar NOT NULL,
	"run_at" timestamp(6) NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"chain_depth" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp(6) DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_trigger_runs_unique" ON "pipeline_trigger_runs" ("pipeline_trigger_id", "pipeline_card_id", "run_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trigger_runs_pending" ON "pipeline_trigger_runs" ("status", "run_at");
