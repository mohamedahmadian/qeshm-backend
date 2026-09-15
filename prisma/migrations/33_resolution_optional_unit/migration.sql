-- AlterTable
ALTER TABLE "board_minutes_resolutions" ALTER COLUMN "unitId" DROP NOT NULL;

-- DropForeignKey
ALTER TABLE "board_minutes_resolutions" DROP CONSTRAINT "board_minutes_resolutions_unitId_fkey";

-- AddForeignKey
ALTER TABLE "board_minutes_resolutions" ADD CONSTRAINT "board_minutes_resolutions_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "organization_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
