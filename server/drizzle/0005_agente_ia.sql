-- Agente de IA no padrão do Kommo (support.kommo.com/docs/ai-agent-manual-setup): cada agente tem
-- Fontes (base de conhecimento), Ações (QUANDO → FAÇA → Mais), Persona e Configurações (canal +
-- etapas onde ele atende). Só acrescenta tabelas; nada da v1 muda.
CREATE TABLE IF NOT EXISTS "ai_agents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL REFERENCES "accounts"("id"),
	"name" varchar NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"persona" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp(6) DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_agents_account" ON "ai_agents" ("account_id");--> statement-breakpoint

-- Fontes de conhecimento: texto livre, perguntas e respostas, site (texto baixado) ou arquivo.
CREATE TABLE IF NOT EXISTS "ai_agent_sources" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_id" bigint NOT NULL REFERENCES "ai_agents"("id") ON DELETE CASCADE,
	"kind" varchar DEFAULT 'text' NOT NULL,
	"title" varchar NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"url" varchar,
	"created_at" timestamp(6) DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_agent_sources_agent" ON "ai_agent_sources" ("agent_id");--> statement-breakpoint

-- Uma sessão por agente × conversa: ativa, pausada, parada ou transferida (painel "Agentes de IA ativos").
CREATE TABLE IF NOT EXISTS "ai_agent_sessions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_id" bigint NOT NULL REFERENCES "ai_agents"("id") ON DELETE CASCADE,
	"conversation_id" bigint NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
	"contact_id" bigint NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
	"status" varchar DEFAULT 'active' NOT NULL,
	"replies" integer DEFAULT 0 NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp(6) DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ai_agent_sessions_agent_conv" ON "ai_agent_sessions" ("agent_id", "conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_agent_sessions_conv_status" ON "ai_agent_sessions" ("conversation_id", "status");--> statement-breakpoint

-- Registro do que o agente fez (resposta, ação, transferência, lacuna de conhecimento, teste),
-- com os tokens gastos — alimenta o Painel do agente e o Registro de atividades.
CREATE TABLE IF NOT EXISTS "ai_agent_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_id" bigint NOT NULL REFERENCES "ai_agents"("id") ON DELETE CASCADE,
	"conversation_id" bigint REFERENCES "conversations"("id") ON DELETE SET NULL,
	"contact_id" bigint REFERENCES "contacts"("id") ON DELETE SET NULL,
	"kind" varchar NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tokens" integer DEFAULT 0 NOT NULL,
	"response_ms" integer,
	"created_at" timestamp(6) DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_agent_logs_agent_created" ON "ai_agent_logs" ("agent_id", "created_at");
