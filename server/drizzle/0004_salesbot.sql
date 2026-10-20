-- Salesbot no padrão do Kommo (docs/KOMMO_DOCS_CHECKLIST.md). Reaproveita flows / flow_runs da v1
-- e só ACRESCENTA colunas: a definição do robô (passos), os gatilhos, as configurações e o
-- controle de espera das execuções (resposta do cliente / timer).
ALTER TABLE "flows" ADD COLUMN IF NOT EXISTS "definition" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "flows" ADD COLUMN IF NOT EXISTS "trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "flows" ADD COLUMN IF NOT EXISTS "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "flows" ADD COLUMN IF NOT EXISTS "kind" varchar DEFAULT 'salesbot' NOT NULL;--> statement-breakpoint
-- robô disparado pelo funil pode não ter conversa (contato sem WhatsApp aberto)
ALTER TABLE "flow_runs" ALTER COLUMN "conversation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD COLUMN IF NOT EXISTS "wait_kind" varchar;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD COLUMN IF NOT EXISTS "resume_at" timestamp(6);--> statement-breakpoint
ALTER TABLE "flow_runs" ADD COLUMN IF NOT EXISTS "trigger" varchar;--> statement-breakpoint
ALTER TABLE "flow_runs" ADD COLUMN IF NOT EXISTS "steps_log" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_flow_runs_waiting" ON "flow_runs" ("status", "resume_at");
