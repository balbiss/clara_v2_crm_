CREATE TABLE IF NOT EXISTS "access_profiles" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL REFERENCES "accounts"("id"),
  "name" varchar NOT NULL,
  "base_role" integer NOT NULL DEFAULT 0,
  "permissions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "sistema" boolean NOT NULL DEFAULT false,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "index_access_profiles_on_account_id" ON "access_profiles" ("account_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "index_access_profiles_sistema_unico" ON "access_profiles" ("account_id", "base_role") WHERE "sistema";
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "access_profile_id" bigint;
