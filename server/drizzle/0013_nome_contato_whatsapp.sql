-- Contatos criados pela importação do WhatsApp em que a 1ª mensagem era da loja receberam o nome do
-- próprio WhatsApp da loja (ex.: "Gerência Expansão Clara Acessórios"). Volta o nome pro telefone; o
-- nome certo entra quando o cliente escrever (lib/wahaIngestion). Só contato sem Jueri, criado pela
-- importação, cujo nome se repete em 3+ contatos de telefones diferentes (sinal de que é o nome da loja).
UPDATE "contacts" c SET "name" = c."phone", "updated_at" = now()
WHERE c."source" = 'WhatsApp' AND c."id_jueri" IS NULL AND c."phone" IS NOT NULL
  AND c."created_at" >= '2026-10-24'
  AND c."name" IN (
    SELECT "name" FROM "contacts"
    WHERE "source" = 'WhatsApp' AND "id_jueri" IS NULL AND "created_at" >= '2026-10-24' AND "name" IS NOT NULL
    GROUP BY "name" HAVING count(DISTINCT "phone") >= 3
  );
