-- AlterTable
ALTER TABLE "project_contractors" ADD COLUMN "registrationNumber" TEXT;
ALTER TABLE "project_contractors" ADD COLUMN "phone" TEXT;
ALTER TABLE "project_contractors" ADD COLUMN "email" TEXT;
ALTER TABLE "project_contractors" ADD COLUMN "website" TEXT;
ALTER TABLE "project_contractors" ADD COLUMN "contractStartDate" DATE;
ALTER TABLE "project_contractors" ADD COLUMN "contractEndDate" DATE;
ALTER TABLE "project_contractors" ADD COLUMN "supportStartDate" DATE;
ALTER TABLE "project_contractors" ADD COLUMN "supportEndDate" DATE;

-- CreateIndex
CREATE INDEX "project_contractors_registrationNumber_idx" ON "project_contractors"("registrationNumber");

-- CreateIndex
CREATE INDEX "project_contractors_phone_idx" ON "project_contractors"("phone");

-- CreateIndex
CREATE INDEX "project_contractors_contractStartDate_idx" ON "project_contractors"("contractStartDate");
