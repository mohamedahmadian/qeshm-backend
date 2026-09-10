-- AlterTable
ALTER TABLE "projects" ADD COLUMN "code" TEXT;

UPDATE "projects"
SET "code" = NULLIF(btrim(array_to_string((string_to_array(btrim("systemName"), ' '))[1:2], ' ')), '');

UPDATE "projects"
SET "code" = left(btrim("systemName"), 24)
WHERE "code" IS NULL OR "code" = '';

WITH ranked AS (
  SELECT id, code, row_number() OVER (PARTITION BY lower(code) ORDER BY "createdAt", id) AS rn
  FROM "projects"
)
UPDATE "projects" AS p
SET "code" = r.code || '-' || r.rn
FROM ranked AS r
WHERE p.id = r.id AND r.rn > 1;

ALTER TABLE "projects" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

CREATE INDEX "projects_code_idx" ON "projects"("code");

UPDATE "projects" SET "status" = 'NOT_STARTED' WHERE "status" IS NULL;

ALTER TABLE "projects" ALTER COLUMN "status" SET DEFAULT 'NOT_STARTED';
ALTER TABLE "projects" ALTER COLUMN "status" SET NOT NULL;
