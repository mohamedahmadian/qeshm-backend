-- CreateTable
CREATE TABLE "project_phases" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    "status" "ProjectStatus",
    "progressPercent" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_phases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_phases_projectId_name_idx" ON "project_phases"("projectId", "name");

-- CreateIndex
CREATE INDEX "project_phases_projectId_startDate_idx" ON "project_phases"("projectId", "startDate");

-- CreateIndex
CREATE INDEX "project_phases_status_idx" ON "project_phases"("status");

-- CreateIndex
CREATE INDEX "project_phases_createdAt_idx" ON "project_phases"("createdAt");

-- AddForeignKey
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
