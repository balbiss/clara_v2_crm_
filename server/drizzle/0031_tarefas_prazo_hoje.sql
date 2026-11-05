-- Tarefas pendentes criadas HOJE (horário de Brasília) que venceram no mesmo minuto em que nasceram
-- (gatilho com prazo 0) passam a vencer no fim do dia, igual às novas (lib/pipelines taskDeadline).
UPDATE "tarefas"
SET "vencimento_em" = ((date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '23 hours 59 minutes') AT TIME ZONE 'America/Sao_Paulo'),
    "updated_at" = now()
WHERE "status" = 'pendente'
  AND "vencimento_em" IS NOT NULL
  AND "vencimento_em" - "created_at" < interval '5 minutes'
  AND ("created_at" AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date;
