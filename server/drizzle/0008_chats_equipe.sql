-- "Chats da equipe" no modelo do Kommo: conversa particular, grupo e menção (colega marcado numa
-- conversa com cliente). Cada pessoa tem o seu "lido até", destaque e silenciar. As mensagens do
-- chat interno antigo (internal_messages) são migradas como conversas particulares.
CREATE TABLE IF NOT EXISTS "team_chats" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL REFERENCES "accounts"("id"),
	"kind" varchar DEFAULT 'direct' NOT NULL,
	"name" varchar,
	"direct_key" varchar,
	"contact_id" bigint REFERENCES "contacts"("id") ON DELETE SET NULL,
	"conversation_id" bigint REFERENCES "conversations"("id") ON DELETE SET NULL,
	"created_by_id" bigint REFERENCES "users"("id") ON DELETE SET NULL,
	"last_message_at" timestamp(6),
	"created_at" timestamp(6) DEFAULT now() NOT NULL,
	"updated_at" timestamp(6) DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_team_chats_direct" ON "team_chats" ("account_id", "direct_key") WHERE "direct_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_team_chats_mention_conv" ON "team_chats" ("conversation_id") WHERE "kind" = 'mention';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "team_chat_members" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL REFERENCES "team_chats"("id") ON DELETE CASCADE,
	"user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"last_read_at" timestamp(6),
	"starred" boolean DEFAULT false NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp(6) DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_team_chat_members_chat_user" ON "team_chat_members" ("chat_id", "user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_chat_members_user" ON "team_chat_members" ("user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "team_chat_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL REFERENCES "team_chats"("id") ON DELETE CASCADE,
	"sender_id" bigint REFERENCES "users"("id") ON DELETE SET NULL,
	"kind" varchar DEFAULT 'text' NOT NULL,
	"text" text,
	"old_internal_id" bigint,
	"created_at" timestamp(6) DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_chat_messages_chat_created" ON "team_chat_messages" ("chat_id", "created_at");--> statement-breakpoint

-- migração do chat interno antigo: uma conversa particular por par de pessoas
INSERT INTO "team_chats" ("account_id", "kind", "direct_key", "created_by_id", "last_message_at", "created_at", "updated_at")
SELECT im.account_id, 'direct', LEAST(im.sender_id, im.recipient_id)::text || ':' || GREATEST(im.sender_id, im.recipient_id)::text,
       MIN(im.sender_id), MAX(im.created_at), MIN(im.created_at), MAX(im.created_at)
FROM "internal_messages" im
GROUP BY im.account_id, LEAST(im.sender_id, im.recipient_id), GREATEST(im.sender_id, im.recipient_id)
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "team_chat_members" ("chat_id", "user_id", "last_read_at")
SELECT c.id, u.uid, now()
FROM "team_chats" c
CROSS JOIN LATERAL (VALUES (split_part(c.direct_key, ':', 1)::bigint), (split_part(c.direct_key, ':', 2)::bigint)) AS u(uid)
WHERE c.kind = 'direct' AND c.direct_key IS NOT NULL AND EXISTS (SELECT 1 FROM "users" x WHERE x.id = u.uid)
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "team_chat_messages" ("chat_id", "sender_id", "text", "old_internal_id", "created_at")
SELECT c.id, im.sender_id, NULLIF(im.text, ''), im.id, im.created_at
FROM "internal_messages" im
JOIN "team_chats" c ON c.account_id = im.account_id AND c.direct_key = LEAST(im.sender_id, im.recipient_id)::text || ':' || GREATEST(im.sender_id, im.recipient_id)::text
WHERE NOT EXISTS (SELECT 1 FROM "team_chat_messages" t WHERE t.old_internal_id = im.id);--> statement-breakpoint
UPDATE "active_storage_attachments" a SET "record_type" = 'TeamChatMessage', "record_id" = t.id
FROM "team_chat_messages" t WHERE a.record_type = 'InternalMessage' AND a.record_id = t.old_internal_id;
