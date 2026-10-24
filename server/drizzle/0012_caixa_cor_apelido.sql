-- Cor e apelido curto de cada caixa: aparecem na lista de conversas, no topo da conversa e acima do
-- campo de digitar, pra ninguém mandar mensagem pelo número errado.
ALTER TABLE "inboxes" ADD COLUMN IF NOT EXISTS "color" varchar;
ALTER TABLE "inboxes" ADD COLUMN IF NOT EXISTS "short_name" varchar;
