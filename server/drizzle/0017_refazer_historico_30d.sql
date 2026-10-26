-- A 1ª importação rodou 30 s depois de conectar, antes do WhatsApp Web carregar as conversas, e trouxe
-- só uma parte (ex.: Prospecção 53 de 462). Libera as caixas pra importar de novo (últimos 30 dias,
-- o que já veio não duplica).
UPDATE "inboxes" SET "history_imported_at" = NULL;
