-- A 1ª importação de conversas falhou em todas as mensagens (data crua na consulta, corrigido em
-- lib/messages.ts): libera as caixas pra importar de novo ao subir.
UPDATE "inboxes" SET "history_imported_at" = NULL;
