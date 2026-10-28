-- O job da régua gravava o mesmo churn de novo a cada hora (comparação de data sem o fuso de Brasília).
-- Fica só o primeiro churn de cada revendedora em cada mês.
DELETE FROM lifecycle_events e
USING lifecycle_events k
WHERE e.event_type = 'churn' AND k.event_type = 'churn'
  AND e.contact_id = k.contact_id
  AND date_trunc('month', e.occurred_at AT TIME ZONE 'America/Sao_Paulo') = date_trunc('month', k.occurred_at AT TIME ZONE 'America/Sao_Paulo')
  AND e.id > k.id;
