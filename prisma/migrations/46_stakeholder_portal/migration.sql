-- CreateEnum
CREATE TYPE "StakeholderCorrespondenceKind" AS ENUM ('ACTION_REQUEST', 'INQUIRY', 'NOTICE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "StakeholderCorrespondenceStatus" AS ENUM ('SENT', 'IN_REVIEW', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "StakeholderActionResult" AS ENUM ('ACCEPTED', 'REJECTED', 'DONE');

-- CreateEnum
CREATE TYPE "StakeholderMessageSide" AS ENUM ('CONTRACTOR', 'ORGANIZATION');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "contractorId" TEXT;

-- CreateTable
CREATE TABLE "stakeholder_progress_reports" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "occurredAt" DATE NOT NULL,
    "progressPercent" INTEGER,
    "actionsDone" TEXT,
    "nextPlan" TEXT,
    "blockers" TEXT,
    "needs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stakeholder_progress_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stakeholder_correspondences" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "projectId" TEXT,
    "kind" "StakeholderCorrespondenceKind" NOT NULL,
    "status" "StakeholderCorrespondenceStatus" NOT NULL DEFAULT 'SENT',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dueDate" DATE,
    "actionResult" "StakeholderActionResult",
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stakeholder_correspondences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stakeholder_messages" (
    "id" TEXT NOT NULL,
    "correspondenceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "side" "StakeholderMessageSide" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stakeholder_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stakeholder_attachments" (
    "id" TEXT NOT NULL,
    "reportId" TEXT,
    "correspondenceId" TEXT,
    "imageId" TEXT,
    "fileId" TEXT,
    "originalName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stakeholder_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_contractorId_idx" ON "users"("contractorId");

-- CreateIndex
CREATE INDEX "stakeholder_progress_reports_projectId_occurredAt_idx" ON "stakeholder_progress_reports"("projectId", "occurredAt");

-- CreateIndex
CREATE INDEX "stakeholder_progress_reports_contractorId_occurredAt_idx" ON "stakeholder_progress_reports"("contractorId", "occurredAt");

-- CreateIndex
CREATE INDEX "stakeholder_progress_reports_createdById_idx" ON "stakeholder_progress_reports"("createdById");

-- CreateIndex
CREATE INDEX "stakeholder_progress_reports_createdAt_idx" ON "stakeholder_progress_reports"("createdAt");

-- CreateIndex
CREATE INDEX "stakeholder_correspondences_contractorId_createdAt_idx" ON "stakeholder_correspondences"("contractorId", "createdAt");

-- CreateIndex
CREATE INDEX "stakeholder_correspondences_projectId_idx" ON "stakeholder_correspondences"("projectId");

-- CreateIndex
CREATE INDEX "stakeholder_correspondences_kind_status_idx" ON "stakeholder_correspondences"("kind", "status");

-- CreateIndex
CREATE INDEX "stakeholder_correspondences_status_idx" ON "stakeholder_correspondences"("status");

-- CreateIndex
CREATE INDEX "stakeholder_correspondences_dueDate_idx" ON "stakeholder_correspondences"("dueDate");

-- CreateIndex
CREATE INDEX "stakeholder_correspondences_subject_idx" ON "stakeholder_correspondences"("subject");

-- CreateIndex
CREATE INDEX "stakeholder_correspondences_createdById_idx" ON "stakeholder_correspondences"("createdById");

-- CreateIndex
CREATE INDEX "stakeholder_correspondences_createdAt_idx" ON "stakeholder_correspondences"("createdAt");

-- CreateIndex
CREATE INDEX "stakeholder_messages_correspondenceId_createdAt_idx" ON "stakeholder_messages"("correspondenceId", "createdAt");

-- CreateIndex
CREATE INDEX "stakeholder_messages_authorId_idx" ON "stakeholder_messages"("authorId");

-- CreateIndex
CREATE INDEX "stakeholder_attachments_reportId_sortOrder_idx" ON "stakeholder_attachments"("reportId", "sortOrder");

-- CreateIndex
CREATE INDEX "stakeholder_attachments_correspondenceId_sortOrder_idx" ON "stakeholder_attachments"("correspondenceId", "sortOrder");

-- CreateIndex
CREATE INDEX "stakeholder_attachments_imageId_idx" ON "stakeholder_attachments"("imageId");

-- CreateIndex
CREATE INDEX "stakeholder_attachments_fileId_idx" ON "stakeholder_attachments"("fileId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "project_contractors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholder_progress_reports" ADD CONSTRAINT "stakeholder_progress_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholder_progress_reports" ADD CONSTRAINT "stakeholder_progress_reports_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "project_contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholder_progress_reports" ADD CONSTRAINT "stakeholder_progress_reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholder_correspondences" ADD CONSTRAINT "stakeholder_correspondences_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "project_contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholder_correspondences" ADD CONSTRAINT "stakeholder_correspondences_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholder_correspondences" ADD CONSTRAINT "stakeholder_correspondences_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholder_messages" ADD CONSTRAINT "stakeholder_messages_correspondenceId_fkey" FOREIGN KEY ("correspondenceId") REFERENCES "stakeholder_correspondences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholder_messages" ADD CONSTRAINT "stakeholder_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholder_attachments" ADD CONSTRAINT "stakeholder_attachments_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "stakeholder_progress_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholder_attachments" ADD CONSTRAINT "stakeholder_attachments_correspondenceId_fkey" FOREIGN KEY ("correspondenceId") REFERENCES "stakeholder_correspondences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholder_attachments" ADD CONSTRAINT "stakeholder_attachments_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "stored_images"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholder_attachments" ADD CONSTRAINT "stakeholder_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
