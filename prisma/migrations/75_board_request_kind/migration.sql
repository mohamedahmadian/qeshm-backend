-- CreateEnum
CREATE TYPE "BoardRequestKind" AS ENUM ('NORMAL', 'MANAGEMENT');

-- AlterTable
ALTER TABLE "board_requests" ADD COLUMN "kind" "BoardRequestKind" NOT NULL DEFAULT 'NORMAL';

-- CreateIndex
CREATE INDEX "board_requests_kind_idx" ON "board_requests"("kind");
