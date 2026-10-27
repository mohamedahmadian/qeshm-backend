-- CreateTable
CREATE TABLE "board_resolution_units" (
    "resolutionId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_resolution_units_pkey" PRIMARY KEY ("resolutionId", "unitId")
);

-- Copy existing single executor
INSERT INTO "board_resolution_units" ("resolutionId", "unitId")
SELECT id, "unitId"
FROM "board_minutes_resolutions"
WHERE "unitId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "board_minutes_resolutions" DROP CONSTRAINT "board_minutes_resolutions_unitId_fkey";

-- DropIndex
DROP INDEX "board_minutes_resolutions_unitId_idx";

-- AlterTable
ALTER TABLE "board_minutes_resolutions" DROP COLUMN "unitId";

-- CreateIndex
CREATE INDEX "board_resolution_units_unitId_idx" ON "board_resolution_units"("unitId");

-- AddForeignKey
ALTER TABLE "board_resolution_units" ADD CONSTRAINT "board_resolution_units_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "board_minutes_resolutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "board_resolution_units" ADD CONSTRAINT "board_resolution_units_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
