-- CreateEnum
CREATE TYPE "BoardResolutionStatus" AS ENUM ('NOT_NOTIFIED', 'NOTIFIED');

-- AlterTable
ALTER TABLE "board_minutes_resolutions" ADD COLUMN "status" "BoardResolutionStatus" NOT NULL DEFAULT 'NOT_NOTIFIED';

-- CreateIndex
CREATE INDEX "board_minutes_resolutions_status_idx" ON "board_minutes_resolutions"("status");
