-- CreateEnum
CREATE TYPE "PhaseProgressMode" AS ENUM ('MANUAL', 'CHECKLIST');

-- AlterTable
ALTER TABLE "project_phases" ADD COLUMN "progressMode" "PhaseProgressMode" NOT NULL DEFAULT 'MANUAL';
