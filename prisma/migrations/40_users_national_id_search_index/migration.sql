CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "users_nationalId_trgm_idx"
ON "users"
USING gin ("nationalId" gin_trgm_ops);
