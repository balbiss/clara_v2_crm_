-- Bel (28/10): "em cada funil os vendedores devem ver somente os seus clientes". Consultoras criadas com
-- "Ver todos os clientes" ligado (vinha marcado por padrão no cadastro) passam a ver só a própria carteira.
UPDATE users SET permissions = coalesce(permissions, '{}'::jsonb) || '{"view_all_contacts": false}'::jsonb WHERE role = 0;
