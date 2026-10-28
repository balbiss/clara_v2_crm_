ALTER TABLE "broadcasts" ADD COLUMN IF NOT EXISTS "assignee_id" bigint REFERENCES "users"("id") ON DELETE SET NULL;
