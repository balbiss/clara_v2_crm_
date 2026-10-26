-- Funil de entrada por caixa (Kommo "etapa de leads de entrada" por canal): contato novo que chega por
-- esta caixa (ou recebe disparo por ela) cai nesta etapa.
ALTER TABLE "inboxes" ADD COLUMN IF NOT EXISTS "entry_stage_id" bigint;
