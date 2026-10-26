-- Critérios de Revendedoras Ativas (Bel, 26/10): o ciclo da maleta começa no pedido aberto mais antigo
-- com MAIS de min_pecas_ativa peças (pedido pequeno esquecido em aberto não segura o ciclo). Acerta o
-- início do ciclo de quem tinha um pedido pequeno antigo — direto no banco, sem disparar automação.
UPDATE "contacts" c SET "cycle_started_at" = x.d, "updated_at" = now()
FROM (
  SELECT p."contact_id", MIN(p."data_criacao")::timestamp AS d
  FROM "pedidos" p
  JOIN "contacts" c2 ON c2."id" = p."contact_id"
  JOIN "accounts" a ON a."id" = c2."account_id"
  WHERE p."status_id" = 1 AND p."data_baixa" IS NULL AND p."data_cancelamento" IS NULL
    AND (CASE WHEN p."quantidade_antes_baixa" > 0 THEN p."quantidade_antes_baixa" ELSE p."quantidade" END) > a."min_pecas_ativa"
  GROUP BY p."contact_id"
) x
WHERE c."id" = x."contact_id" AND c."id_jueri" IS NOT NULL
  AND (c."cycle_started_at" IS NULL OR x.d::date > c."cycle_started_at"::date);
