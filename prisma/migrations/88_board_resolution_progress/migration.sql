-- CreateTable
CREATE TABLE "board_resolution_progress_reports" (
    "id" TEXT NOT NULL,
    "resolutionId" TEXT NOT NULL,
    "reportedAt" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "body" TEXT,
    "progressAmount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_resolution_progress_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "board_resolution_progress_reports_resolutionId_reportedAt_idx" ON "board_resolution_progress_reports"("resolutionId", "reportedAt");

-- CreateIndex
CREATE INDEX "board_resolution_progress_reports_resolutionId_createdAt_idx" ON "board_resolution_progress_reports"("resolutionId", "createdAt");

-- CreateIndex
CREATE INDEX "board_resolution_progress_reports_title_idx" ON "board_resolution_progress_reports"("title");

-- AddForeignKey
ALTER TABLE "board_resolution_progress_reports" ADD CONSTRAINT "board_resolution_progress_reports_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "board_minutes_resolutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
