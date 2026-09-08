-- CreateEnum
CREATE TYPE "ProjectImportance" AS ENUM ('VERY_HIGH', 'HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "vicePresidency" TEXT NOT NULL,
    "management" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "systemName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyName" TEXT,
    "systemUrl" TEXT,
    "launchYear" INTEGER,
    "isSupportActive" BOOLEAN NOT NULL DEFAULT true,
    "replacementProjectId" TEXT,
    "description" TEXT,
    "importance" "ProjectImportance" NOT NULL DEFAULT 'HIGH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_vicePresidency_idx" ON "projects"("vicePresidency");

-- CreateIndex
CREATE INDEX "projects_management_idx" ON "projects"("management");

-- CreateIndex
CREATE INDEX "projects_unit_idx" ON "projects"("unit");

-- CreateIndex
CREATE INDEX "projects_systemName_idx" ON "projects"("systemName");

-- CreateIndex
CREATE INDEX "projects_isActive_idx" ON "projects"("isActive");

-- CreateIndex
CREATE INDEX "projects_isSupportActive_idx" ON "projects"("isSupportActive");

-- CreateIndex
CREATE INDEX "projects_importance_idx" ON "projects"("importance");

-- CreateIndex
CREATE INDEX "projects_createdAt_idx" ON "projects"("createdAt");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_replacementProjectId_fkey" FOREIGN KEY ("replacementProjectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
