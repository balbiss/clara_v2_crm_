-- Funil Consignado do Kommo dentro da v2: um funil de sistema cujas etapas são os status da régua
-- (contact.status). O card do contato acompanha o status e os gatilhos do Automatize rodam ao entrar.
ALTER TABLE "pipeline_stages" ADD COLUMN IF NOT EXISTS "status_key" varchar;
