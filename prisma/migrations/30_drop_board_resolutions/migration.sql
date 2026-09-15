-- DropForeignKey
ALTER TABLE "board_resolutions" DROP CONSTRAINT "board_resolutions_requestId_fkey";

-- DropTable
DROP TABLE "board_resolutions";

DELETE FROM "role_permissions" WHERE "code" = 'board.calendar';
