-- CreateTable
CREATE TABLE "vehicle_brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_brands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_brands_name_key" ON "vehicle_brands"("name");

-- CreateIndex
CREATE INDEX "vehicle_brands_name_idx" ON "vehicle_brands"("name");

-- CreateIndex
CREATE INDEX "vehicle_brands_createdAt_idx" ON "vehicle_brands"("createdAt");

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN "brandId" TEXT;

-- Migrate existing brand names
INSERT INTO "vehicle_brands" ("id", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, trimmed, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT btrim("brand") AS trimmed
    FROM "vehicles"
    WHERE btrim("brand") <> ''
) AS brands;

UPDATE "vehicles" AS v
SET "brandId" = b."id"
FROM "vehicle_brands" AS b
WHERE btrim(v."brand") = b."name";

INSERT INTO "vehicle_brands" ("id", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'نامشخص', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "vehicles" WHERE "brandId" IS NULL)
  AND NOT EXISTS (SELECT 1 FROM "vehicle_brands" WHERE "name" = 'نامشخص');

UPDATE "vehicles"
SET "brandId" = (SELECT "id" FROM "vehicle_brands" WHERE "name" = 'نامشخص' LIMIT 1)
WHERE "brandId" IS NULL;

-- DropIndex
DROP INDEX IF EXISTS "vehicles_brand_idx";

-- DropTable column
ALTER TABLE "vehicles" DROP COLUMN "brand";

-- Require brand
ALTER TABLE "vehicles" ALTER COLUMN "brandId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "vehicles_brandId_idx" ON "vehicles"("brandId");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "vehicle_brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
