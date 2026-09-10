-- CreateTable
CREATE TABLE "organization_positions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_units" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "eitaa" TEXT,
    "bale" TEXT,
    "rubika" TEXT,
    "instagram" TEXT,
    "telegram" TEXT,
    "whatsapp" TEXT,
    "nutritionRepId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_units_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "orgUnitId" TEXT;
ALTER TABLE "users" ADD COLUMN "positionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "organization_positions_name_key" ON "organization_positions"("name");

-- CreateIndex
CREATE INDEX "organization_positions_name_idx" ON "organization_positions"("name");

-- CreateIndex
CREATE INDEX "organization_positions_createdAt_idx" ON "organization_positions"("createdAt");

-- CreateIndex
CREATE INDEX "organization_units_name_idx" ON "organization_units"("name");

-- CreateIndex
CREATE INDEX "organization_units_phone_idx" ON "organization_units"("phone");

-- CreateIndex
CREATE INDEX "organization_units_nutritionRepId_idx" ON "organization_units"("nutritionRepId");

-- CreateIndex
CREATE INDEX "organization_units_createdAt_idx" ON "organization_units"("createdAt");

-- CreateIndex
CREATE INDEX "users_orgUnitId_idx" ON "users"("orgUnitId");

-- CreateIndex
CREATE INDEX "users_positionId_idx" ON "users"("positionId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "organization_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "organization_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_units" ADD CONSTRAINT "organization_units_nutritionRepId_fkey" FOREIGN KEY ("nutritionRepId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
