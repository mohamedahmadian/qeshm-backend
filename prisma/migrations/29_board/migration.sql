-- AlterTable
ALTER TABLE "organization_positions" ADD COLUMN "code" TEXT;
ALTER TABLE "organization_positions" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "organization_positions_code_key" ON "organization_positions"("code");

-- CreateIndex
CREATE INDEX "organization_positions_isSystem_idx" ON "organization_positions"("isSystem");

-- CreateEnum
CREATE TYPE "BoardRequestStatus" AS ENUM ('PENDING_REVIEW', 'PENDING_LEGAL', 'PENDING_BUDGET', 'PENDING_SECRETARY', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BoardStage" AS ENUM ('REQUEST', 'MANAGEMENT', 'LEGAL', 'BUDGET', 'SECRETARY');

-- CreateEnum
CREATE TYPE "BoardAttachmentKind" AS ENUM ('IMAGE', 'FILE');

-- CreateTable
CREATE TABLE "board_requests" (
    "id" TEXT NOT NULL,
    "status" "BoardRequestStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "requestedAt" DATE NOT NULL,
    "unitId" TEXT NOT NULL,
    "orgPositionText" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "justification" TEXT,
    "topicHistory" TEXT,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "managementComment" TEXT,
    "managementAt" DATE,
    "managementById" TEXT,
    "legalOrgMatch" BOOLEAN,
    "legalRegulationsMatch" BOOLEAN,
    "legalComment" TEXT,
    "legalAt" DATE,
    "legalById" TEXT,
    "budgetProgramHistory" BOOLEAN,
    "budgetCurrentYearFunding" BOOLEAN,
    "budgetComment" TEXT,
    "budgetAt" DATE,
    "budgetById" TEXT,
    "secretaryComment" TEXT,
    "secretaryAt" DATE,
    "secretaryById" TEXT,
    "rejectedStage" "BoardStage",
    "rejectedComment" TEXT,
    "rejectedAt" DATE,
    "rejectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_attachments" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "stage" "BoardStage" NOT NULL,
    "kind" "BoardAttachmentKind" NOT NULL,
    "imageId" TEXT,
    "fileId" TEXT,
    "originalName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_resolutions" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_stage_units" (
    "stage" "BoardStage" NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_stage_units_pkey" PRIMARY KEY ("stage","unitId")
);

-- CreateTable
CREATE TABLE "board_stage_positions" (
    "stage" "BoardStage" NOT NULL,
    "positionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_stage_positions_pkey" PRIMARY KEY ("stage","positionId")
);

-- CreateIndex
CREATE INDEX "board_requests_status_idx" ON "board_requests"("status");

-- CreateIndex
CREATE INDEX "board_requests_unitId_idx" ON "board_requests"("unitId");

-- CreateIndex
CREATE INDEX "board_requests_createdById_idx" ON "board_requests"("createdById");

-- CreateIndex
CREATE INDEX "board_requests_requestedAt_idx" ON "board_requests"("requestedAt");

-- CreateIndex
CREATE INDEX "board_requests_subject_idx" ON "board_requests"("subject");

-- CreateIndex
CREATE INDEX "board_requests_createdAt_idx" ON "board_requests"("createdAt");

-- CreateIndex
CREATE INDEX "board_attachments_requestId_sortOrder_idx" ON "board_attachments"("requestId", "sortOrder");

-- CreateIndex
CREATE INDEX "board_attachments_stage_idx" ON "board_attachments"("stage");

-- CreateIndex
CREATE INDEX "board_attachments_imageId_idx" ON "board_attachments"("imageId");

-- CreateIndex
CREATE INDEX "board_attachments_fileId_idx" ON "board_attachments"("fileId");

-- CreateIndex
CREATE INDEX "board_resolutions_requestId_idx" ON "board_resolutions"("requestId");

-- CreateIndex
CREATE INDEX "board_resolutions_endDate_idx" ON "board_resolutions"("endDate");

-- CreateIndex
CREATE INDEX "board_resolutions_startDate_idx" ON "board_resolutions"("startDate");

-- CreateIndex
CREATE INDEX "board_resolutions_createdAt_idx" ON "board_resolutions"("createdAt");

-- CreateIndex
CREATE INDEX "board_stage_units_unitId_idx" ON "board_stage_units"("unitId");

-- CreateIndex
CREATE INDEX "board_stage_positions_positionId_idx" ON "board_stage_positions"("positionId");

-- AddForeignKey
ALTER TABLE "board_requests" ADD CONSTRAINT "board_requests_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_requests" ADD CONSTRAINT "board_requests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_requests" ADD CONSTRAINT "board_requests_managementById_fkey" FOREIGN KEY ("managementById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_requests" ADD CONSTRAINT "board_requests_legalById_fkey" FOREIGN KEY ("legalById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_requests" ADD CONSTRAINT "board_requests_budgetById_fkey" FOREIGN KEY ("budgetById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_requests" ADD CONSTRAINT "board_requests_secretaryById_fkey" FOREIGN KEY ("secretaryById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_requests" ADD CONSTRAINT "board_requests_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_attachments" ADD CONSTRAINT "board_attachments_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "board_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_attachments" ADD CONSTRAINT "board_attachments_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "stored_images"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_attachments" ADD CONSTRAINT "board_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_resolutions" ADD CONSTRAINT "board_resolutions_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "board_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_stage_units" ADD CONSTRAINT "board_stage_units_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "organization_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_stage_positions" ADD CONSTRAINT "board_stage_positions_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "organization_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
