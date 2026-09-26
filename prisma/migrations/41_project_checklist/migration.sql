-- CreateEnum
CREATE TYPE "ProjectProgressMode" AS ENUM ('MANUAL', 'PROJECT_CHECKLIST', 'PHASE_CHECKLIST');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN "progressMode" "ProjectProgressMode" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "project_checklist_items" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phaseId" TEXT,
    "title" TEXT NOT NULL,
    "weightPercent" INTEGER NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_checklist_items_projectId_phaseId_sortOrder_idx" ON "project_checklist_items"("projectId", "phaseId", "sortOrder");

-- CreateIndex
CREATE INDEX "project_checklist_items_phaseId_idx" ON "project_checklist_items"("phaseId");

-- CreateIndex
CREATE INDEX "project_checklist_items_title_idx" ON "project_checklist_items"("title");

-- CreateIndex
CREATE INDEX "project_checklist_items_isDone_idx" ON "project_checklist_items"("isDone");

-- CreateIndex
CREATE INDEX "project_checklist_items_createdAt_idx" ON "project_checklist_items"("createdAt");

-- AddForeignKey
ALTER TABLE "project_checklist_items" ADD CONSTRAINT "project_checklist_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_checklist_items" ADD CONSTRAINT "project_checklist_items_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "project_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
