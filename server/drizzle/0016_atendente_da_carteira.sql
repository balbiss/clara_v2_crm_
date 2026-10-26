-- Caixas por carteira: conversas que ficaram sem atendente passam pra dona da revendedora
-- (o campo "Usuário responsável" do card mostrava "Não atribuído" mesmo com a revendedora tendo dona).
UPDATE "conversations" cv SET "user_id" = c."user_id"
FROM "contacts" c, "inboxes" i
WHERE cv."contact_id" = c."id" AND cv."inbox_id" = i."id" AND i."restrict_by_portfolio" = true
  AND cv."user_id" IS NULL AND c."user_id" IS NOT NULL;
