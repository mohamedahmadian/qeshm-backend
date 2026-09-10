-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUSPENDED', 'COMPLETED');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN "status" "ProjectStatus";
ALTER TABLE "projects" ADD COLUMN "progressPercent" INTEGER;
ALTER TABLE "projects" ADD COLUMN "startDate" DATE;
ALTER TABLE "projects" ADD COLUMN "endDate" DATE;
ALTER TABLE "projects" ADD COLUMN "latitude" DECIMAL(10,7);
ALTER TABLE "projects" ADD COLUMN "longitude" DECIMAL(10,7);

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "projects_startDate_idx" ON "projects"("startDate");

-- CreateIndex
CREATE INDEX "projects_endDate_idx" ON "projects"("endDate");
