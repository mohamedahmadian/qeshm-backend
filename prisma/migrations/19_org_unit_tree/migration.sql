-- CreateEnum
CREATE TYPE "OrganizationUnitKind" AS ENUM ('BOARD', 'ADVISORS', 'OFFICE', 'VICE', 'MANAGEMENT', 'DEPARTMENT');

-- AlterTable
ALTER TABLE "organization_units" ADD COLUMN "kind" "OrganizationUnitKind" NOT NULL DEFAULT 'DEPARTMENT';
ALTER TABLE "organization_units" ADD COLUMN "parentId" TEXT;

-- CreateIndex
CREATE INDEX "organization_units_kind_idx" ON "organization_units"("kind");
CREATE INDEX "organization_units_parentId_idx" ON "organization_units"("parentId");

-- AddForeignKey
ALTER TABLE "organization_units" ADD CONSTRAINT "organization_units_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
