-- CreateTable
CREATE TABLE "project_contractor_projects" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_contractor_projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_contractor_projects_contractorId_projectId_key" ON "project_contractor_projects"("contractorId", "projectId");

-- CreateIndex
CREATE INDEX "project_contractor_projects_contractorId_idx" ON "project_contractor_projects"("contractorId");

-- CreateIndex
CREATE INDEX "project_contractor_projects_projectId_idx" ON "project_contractor_projects"("projectId");

-- CreateIndex
CREATE INDEX "project_contractor_projects_createdAt_idx" ON "project_contractor_projects"("createdAt");

-- AddForeignKey
ALTER TABLE "project_contractor_projects" ADD CONSTRAINT "project_contractor_projects_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "project_contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_contractor_projects" ADD CONSTRAINT "project_contractor_projects_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "project_contractor_projects" ("id", "contractorId", "projectId", "createdAt", "updatedAt")
SELECT "id", "id", "projectId", "createdAt", "updatedAt"
FROM "project_contractors";
