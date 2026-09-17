-- AlterTable
ALTER TABLE "projects" ADD COLUMN "showOnHomePage" BOOLEAN NOT NULL DEFAULT true;

UPDATE "projects" SET "showOnHomePage" = "showOnLiveBoard";

-- CreateIndex
CREATE INDEX "projects_showOnHomePage_idx" ON "projects"("showOnHomePage");
