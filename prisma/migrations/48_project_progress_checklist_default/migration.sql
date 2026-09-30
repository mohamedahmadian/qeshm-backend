-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "progressMode" SET DEFAULT 'PROJECT_CHECKLIST';

-- Existing projects used MANUAL before a source was required.
UPDATE "projects"
SET "progressMode" = 'PROJECT_CHECKLIST'
WHERE "progressMode" = 'MANUAL';
