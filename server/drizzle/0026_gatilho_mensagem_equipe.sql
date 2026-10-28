ALTER TABLE "pipeline_cards" ADD COLUMN IF NOT EXISTS "agent_message_triggered_at" timestamp(6);
-- Bel (28/10): conversa de disparo nascia fechada e não aparecia na caixa de entrada — reabre as dos
-- disparos dos últimos 7 dias
UPDATE conversations c SET status = 0, snoozed_until = NULL
WHERE c.status IN (2, 3) AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.broadcast_id IS NOT NULL AND m.created_at > now() - interval '7 days');
