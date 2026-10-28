ALTER TABLE "broadcast_recipients" ADD COLUMN IF NOT EXISTS "frio" boolean DEFAULT false NOT NULL;
-- limite antigo (até 1000/dia) passa pro teto novo de 150
UPDATE broadcasts SET daily_limit = 150 WHERE daily_limit > 150;
