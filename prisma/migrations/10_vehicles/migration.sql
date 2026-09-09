-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('SEDAN', 'PICKUP', 'TRUCK', 'MINIBUS', 'MOTORCYCLE', 'OTHER');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'IN_REPAIR', 'SCRAPPED', 'TRANSFERRED', 'MISSING');

-- CreateEnum
CREATE TYPE "VehicleAssignmentType" AS ENUM ('UNIT', 'PERSON');

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "color" TEXT,
    "year" INTEGER,
    "chassisNumber" TEXT,
    "engineNumber" TEXT,
    "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_assignments" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "organizationUnitId" TEXT,
    "personId" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "type" "VehicleAssignmentType" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_assetCode_key" ON "vehicles"("assetCode");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_key" ON "vehicles"("plate");

-- CreateIndex
CREATE INDEX "vehicles_type_idx" ON "vehicles"("type");

-- CreateIndex
CREATE INDEX "vehicles_status_idx" ON "vehicles"("status");

-- CreateIndex
CREATE INDEX "vehicles_brand_idx" ON "vehicles"("brand");

-- CreateIndex
CREATE INDEX "vehicles_createdAt_idx" ON "vehicles"("createdAt");

-- CreateIndex
CREATE INDEX "vehicle_assignments_vehicleId_startDate_idx" ON "vehicle_assignments"("vehicleId", "startDate");

-- CreateIndex
CREATE INDEX "vehicle_assignments_organizationUnitId_idx" ON "vehicle_assignments"("organizationUnitId");

-- CreateIndex
CREATE INDEX "vehicle_assignments_personId_idx" ON "vehicle_assignments"("personId");

-- CreateIndex
CREATE INDEX "vehicle_assignments_endDate_idx" ON "vehicle_assignments"("endDate");

-- AddForeignKey
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_organizationUnitId_fkey" FOREIGN KEY ("organizationUnitId") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_personId_fkey" FOREIGN KEY ("personId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
