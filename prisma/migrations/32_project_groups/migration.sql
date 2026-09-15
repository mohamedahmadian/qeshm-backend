-- CreateTable
CREATE TABLE "project_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_groups_name_key" ON "project_groups"("name");

-- CreateIndex
CREATE INDEX "project_groups_name_idx" ON "project_groups"("name");

-- CreateIndex
CREATE INDEX "project_groups_createdAt_idx" ON "project_groups"("createdAt");

-- AlterTable
ALTER TABLE "projects" ADD COLUMN "orgUnitId" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN "groupId" TEXT;

-- CreateIndex
CREATE INDEX "projects_orgUnitId_idx" ON "projects"("orgUnitId");

-- CreateIndex
CREATE INDEX "projects_groupId_idx" ON "projects"("groupId");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "organization_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "project_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
