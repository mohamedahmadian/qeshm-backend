-- AlterTable
ALTER TABLE "board_resolution_contracts" DROP COLUMN "party",
ADD COLUMN "contractorId" TEXT;

-- AlterTable
ALTER TABLE "board_resolution_progress_reports"
ADD COLUMN "actionsDone" TEXT,
ADD COLUMN "nextPlan" TEXT,
ADD COLUMN "blockers" TEXT,
ADD COLUMN "needs" TEXT,
ADD COLUMN "createdById" TEXT,
ADD COLUMN "contractorId" TEXT,
ADD COLUMN "contractId" TEXT;

-- CreateIndex
CREATE INDEX "board_resolution_contracts_contractorId_idx" ON "board_resolution_contracts"("contractorId");

-- CreateIndex
CREATE INDEX "board_resolution_progress_reports_createdById_idx" ON "board_resolution_progress_reports"("createdById");

-- CreateIndex
CREATE INDEX "board_resolution_progress_reports_contractorId_idx" ON "board_resolution_progress_reports"("contractorId");

-- CreateIndex
CREATE INDEX "board_resolution_progress_reports_contractId_idx" ON "board_resolution_progress_reports"("contractId");

-- AddForeignKey
ALTER TABLE "board_resolution_contracts" ADD CONSTRAINT "board_resolution_contracts_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "project_contractors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_resolution_progress_reports" ADD CONSTRAINT "board_resolution_progress_reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_resolution_progress_reports" ADD CONSTRAINT "board_resolution_progress_reports_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "project_contractors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_resolution_progress_reports" ADD CONSTRAINT "board_resolution_progress_reports_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "board_resolution_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
