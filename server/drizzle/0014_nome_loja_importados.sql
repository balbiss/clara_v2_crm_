-- Mesmo defeito em contatos vindos dos dados antigos: o nome é o do próprio WhatsApp da loja (nome de
-- perfil de cada número conectado). Só contato sem Jueri cujo nome se repete em 3+ telefones diferentes.
UPDATE "contacts" c SET "name" = c."phone", "updated_at" = now()
WHERE c."source" = 'WhatsApp' AND c."id_jueri" IS NULL AND c."phone" IS NOT NULL
  AND c."name" IN ('Gerência Expansão Clara Acessórios', 'Clara Ferreira Acessórios', 'Marketing Clara Ferreira Acessorios',
                   'Clara Ferreira', 'Marcela - Clara Ferreira', 'Supervisor De Loja', 'Clara Ferreira Consultora', 'Beatriz', 'Balbis')
  AND c."name" IN (
    SELECT "name" FROM "contacts" WHERE "source" = 'WhatsApp' AND "id_jueri" IS NULL AND "name" IS NOT NULL
    GROUP BY "name" HAVING count(DISTINCT "phone") >= 3
  );
