-- De-para dos ids da v1 → v2 na importação das revendedoras (deixa a importação rodar de novo
-- sem duplicar nada). Só acrescenta tabela.
CREATE TABLE IF NOT EXISTS "v1_import_map" (
	"table_name" varchar NOT NULL,
	"old_id" bigint NOT NULL,
	"new_id" bigint NOT NULL,
	"created_at" timestamp(6) DEFAULT now() NOT NULL,
	PRIMARY KEY ("table_name", "old_id")
);
