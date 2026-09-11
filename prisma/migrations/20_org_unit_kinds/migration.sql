-- CreateTable
CREATE TABLE "organization_unit_kinds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_unit_kinds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_unit_kinds_name_key" ON "organization_unit_kinds"("name");

-- CreateIndex
CREATE INDEX "organization_unit_kinds_name_idx" ON "organization_unit_kinds"("name");

-- CreateIndex
CREATE INDEX "organization_unit_kinds_createdAt_idx" ON "organization_unit_kinds"("createdAt");

INSERT INTO "organization_unit_kinds" ("id", "name", "createdAt", "updatedAt")
VALUES
    (gen_random_uuid()::text, 'هیئت مدیره', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'مشاورین', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'دفتر', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'معاونت', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'مدیریت', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'اداره', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "organization_units" ADD COLUMN "kindId" TEXT;

UPDATE "organization_units" AS u
SET "kindId" = k."id"
FROM "organization_unit_kinds" AS k
WHERE (u."kind"::text = 'BOARD' AND k."name" = 'هیئت مدیره')
   OR (u."kind"::text = 'ADVISORS' AND k."name" = 'مشاورین')
   OR (u."kind"::text = 'OFFICE' AND k."name" = 'دفتر')
   OR (u."kind"::text = 'VICE' AND k."name" = 'معاونت')
   OR (u."kind"::text = 'MANAGEMENT' AND k."name" = 'مدیریت')
   OR (u."kind"::text = 'DEPARTMENT' AND k."name" = 'اداره');

UPDATE "organization_units"
SET "kindId" = (SELECT "id" FROM "organization_unit_kinds" WHERE "name" = 'اداره' LIMIT 1)
WHERE "kindId" IS NULL;

ALTER TABLE "organization_units" ALTER COLUMN "kindId" SET NOT NULL;

-- DropIndex
DROP INDEX IF EXISTS "organization_units_kind_idx";

ALTER TABLE "organization_units" DROP COLUMN "kind";

DROP TYPE "OrganizationUnitKind";

-- CreateIndex
CREATE INDEX "organization_units_kindId_idx" ON "organization_units"("kindId");

-- AddForeignKey
ALTER TABLE "organization_units" ADD CONSTRAINT "organization_units_kindId_fkey" FOREIGN KEY ("kindId") REFERENCES "organization_unit_kinds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
