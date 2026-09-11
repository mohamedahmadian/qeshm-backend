-- CreateTable
CREATE TABLE "project_operators" (
    "projectId" TEXT NOT NULL,
    "organizationUnitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_operators_pkey" PRIMARY KEY ("projectId","organizationUnitId")
);

-- CreateIndex
CREATE INDEX "project_operators_organizationUnitId_idx" ON "project_operators"("organizationUnitId");

-- AddForeignKey
ALTER TABLE "project_operators" ADD CONSTRAINT "project_operators_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_operators" ADD CONSTRAINT "project_operators_organizationUnitId_fkey" FOREIGN KEY ("organizationUnitId") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "project_operators" ("projectId", "organizationUnitId")
SELECT DISTINCT p."id", u."id"
FROM "projects" p
JOIN "organization_units" u
  ON u."name" IN (p."vicePresidency", p."management", p."unit");

-- DropIndex
DROP INDEX "projects_vicePresidency_idx";

-- DropIndex
DROP INDEX "projects_management_idx";

-- DropIndex
DROP INDEX "projects_unit_idx";

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "vicePresidency",
DROP COLUMN "management",
DROP COLUMN "unit";
