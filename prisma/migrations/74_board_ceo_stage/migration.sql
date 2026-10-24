-- AlterEnum
ALTER TYPE "BoardRequestStatus" ADD VALUE 'PENDING_CEO';

-- AlterEnum
ALTER TYPE "BoardStage" ADD VALUE 'CEO';

-- AlterTable
ALTER TABLE "board_requests" ADD COLUMN "ceoComment" TEXT;
ALTER TABLE "board_requests" ADD COLUMN "ceoAt" DATE;
ALTER TABLE "board_requests" ADD COLUMN "ceoById" TEXT;

-- AddForeignKey
ALTER TABLE "board_requests" ADD CONSTRAINT "board_requests_ceoById_fkey" FOREIGN KEY ("ceoById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
