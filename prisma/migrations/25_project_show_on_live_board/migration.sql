-- AlterTable
ALTER TABLE "projects" ADD COLUMN "showOnLiveBoard" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "projects_showOnLiveBoard_idx" ON "projects"("showOnLiveBoard");
