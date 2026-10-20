-- Configurações no padrão do Kommo (Configurações de trabalho / de chat). Só acrescenta.
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;
