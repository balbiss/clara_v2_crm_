-- Insights no padrão do Kommo (docs/KOMMO_DOCS_CHECKLIST.md): lista de eventos e metas.
-- Só acrescenta tabelas; nada da v1 muda.

-- "Lista de eventos" do Kommo: tudo o que acontece com o lead (etapa, tag, campo, tarefa, nota),
-- por quem (user_id) ou pela automação (user_id nulo = "Robô"). Também alimenta a Análise de vendas
-- ("entrou na etapa") e o Relatório consolidado.
CREATE TABLE IF NOT EXISTS "activity_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL REFERENCES "accounts"("id"),
	"user_id" bigint REFERENCES "users"("id"),
	"contact_id" bigint REFERENCES "contacts"("id") ON DELETE CASCADE,
	"object_type" varchar NOT NULL,
	"object_id" bigint,
	"object_name" varchar,
	"event_type" varchar NOT NULL,
	"value_before" text,
	"value_after" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp(6) DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_events_account_created" ON "activity_events" ("account_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_events_contact" ON "activity_events" ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_activity_events_type" ON "activity_events" ("account_id", "event_type", "created_at");--> statement-breakpoint

-- "Relatório de meta": meta mensal por usuário, em valor (R$) e em quantidade de vendas.
CREATE TABLE IF NOT EXISTS "sales_goals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL REFERENCES "accounts"("id"),
	"user_id" bigint NOT NULL REFERENCES "users"("id"),
	"month" varchar NOT NULL,
	"value_goal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"count_goal" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp(6) DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_sales_goals_user_month" ON "sales_goals" ("user_id", "month");
