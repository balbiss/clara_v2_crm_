-- Importação completa das conversas do WhatsApp ao conectar a caixa (uma vez por caixa).
ALTER TABLE "inboxes" ADD COLUMN IF NOT EXISTS "history_imported_at" timestamp(6);
