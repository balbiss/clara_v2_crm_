-- Contas internas do Jueri ("PEDIDO EM ESPERA …", "Conferência Fila impressão") não são revendedoras:
-- saem do Onboarding, com a tarefa "Revendedora iniciou!" que a etapa criou pra elas.
DELETE FROM tarefas t USING contacts c
WHERE t.contact_id = c.id AND t.status = 'pendente' AND t.titulo = 'Revendedora iniciou!'
  AND coalesce(c.name, '') ~* '^\s*(pedido em espera|confer[eê]ncia)';
DELETE FROM pipeline_cards pc USING contacts c, pipelines p
WHERE pc.contact_id = c.id AND pc.pipeline_id = p.id AND p.slug = 'onboarding'
  AND coalesce(c.name, '') ~* '^\s*(pedido em espera|confer[eê]ncia)';
