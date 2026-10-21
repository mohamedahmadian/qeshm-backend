-- AlterTable
ALTER TABLE "organization_units" ADD COLUMN "code" TEXT;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS rn
  FROM "organization_units"
)
UPDATE "organization_units" AS u
SET "code" = 'U-' || lpad(n.rn::text, 3, '0')
FROM numbered AS n
WHERE u.id = n.id;

ALTER TABLE "organization_units" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX "organization_units_code_key" ON "organization_units"("code");

CREATE INDEX "organization_units_code_idx" ON "organization_units"("code");
