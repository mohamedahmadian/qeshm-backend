-- CreateEnum
CREATE TYPE "ProjectProgressProcessingMode" AS ENUM ('IMMEDIATE', 'DEFERRED');

-- CreateEnum
CREATE TYPE "ProjectProgressTranscriptionStatus" AS ENUM ('NONE', 'PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "stored_files" (
    "id" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "originalName" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_progress_entries" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "occurredAt" DATE NOT NULL,
    "body" TEXT,
    "transcript" TEXT,
    "summary" TEXT,
    "progressPercent" INTEGER,
    "processingMode" "ProjectProgressProcessingMode" NOT NULL DEFAULT 'DEFERRED',
    "transcriptionStatus" "ProjectProgressTranscriptionStatus" NOT NULL DEFAULT 'NONE',
    "transcriptionError" TEXT,
    "audioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_progress_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_progress_images" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_progress_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_progress_entries_projectId_occurredAt_idx" ON "project_progress_entries"("projectId", "occurredAt");

-- CreateIndex
CREATE INDEX "project_progress_entries_projectId_createdAt_idx" ON "project_progress_entries"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "project_progress_entries_transcriptionStatus_idx" ON "project_progress_entries"("transcriptionStatus");

-- CreateIndex
CREATE INDEX "project_progress_entries_audioId_idx" ON "project_progress_entries"("audioId");

-- CreateIndex
CREATE INDEX "project_progress_images_entryId_sortOrder_idx" ON "project_progress_images"("entryId", "sortOrder");

-- CreateIndex
CREATE INDEX "project_progress_images_imageId_idx" ON "project_progress_images"("imageId");

-- AddForeignKey
ALTER TABLE "project_progress_entries" ADD CONSTRAINT "project_progress_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_progress_entries" ADD CONSTRAINT "project_progress_entries_audioId_fkey" FOREIGN KEY ("audioId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_progress_images" ADD CONSTRAINT "project_progress_images_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "project_progress_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_progress_images" ADD CONSTRAINT "project_progress_images_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "stored_images"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
