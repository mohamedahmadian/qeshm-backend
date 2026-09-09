-- CreateEnum
CREATE TYPE "VehicleAssignmentStatus" AS ENUM ('LENT', 'RETURNED');

-- AlterTable
ALTER TABLE "vehicle_assignments" ADD COLUMN "returnedAt" DATE;
ALTER TABLE "vehicle_assignments" ADD COLUMN "status" "VehicleAssignmentStatus" NOT NULL DEFAULT 'LENT';

-- CreateIndex
CREATE INDEX "vehicle_assignments_status_idx" ON "vehicle_assignments"("status");

-- CreateIndex
CREATE INDEX "vehicle_assignments_returnedAt_idx" ON "vehicle_assignments"("returnedAt");
