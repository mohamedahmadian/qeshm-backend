-- CreateEnum
CREATE TYPE "BoardMinutesStatus" AS ENUM ('NOT_HELD', 'HELD', 'NOTIFIED');

-- AlterTable
ALTER TABLE "board_minutes" ADD COLUMN "minutesYear" INTEGER;
ALTER TABLE "board_minutes" ADD COLUMN "minutesSeq" INTEGER;
ALTER TABLE "board_minutes" ADD COLUMN "minutesNo" TEXT;
ALTER TABLE "board_minutes" ADD COLUMN "status" "BoardMinutesStatus" NOT NULL DEFAULT 'NOT_HELD';

-- Backfill numbers by Jalali year of createdAt (Tehran)
WITH numbered AS (
  SELECT
    id,
    CASE
      WHEN EXTRACT(MONTH FROM ("createdAt" AT TIME ZONE 'Asia/Tehran')) > 3
        OR (
          EXTRACT(MONTH FROM ("createdAt" AT TIME ZONE 'Asia/Tehran')) = 3
          AND EXTRACT(DAY FROM ("createdAt" AT TIME ZONE 'Asia/Tehran')) >= 21
        )
      THEN EXTRACT(YEAR FROM ("createdAt" AT TIME ZONE 'Asia/Tehran'))::int - 621
      ELSE EXTRACT(YEAR FROM ("createdAt" AT TIME ZONE 'Asia/Tehran'))::int - 622
    END AS y,
    ROW_NUMBER() OVER (
      PARTITION BY
        CASE
          WHEN EXTRACT(MONTH FROM ("createdAt" AT TIME ZONE 'Asia/Tehran')) > 3
            OR (
              EXTRACT(MONTH FROM ("createdAt" AT TIME ZONE 'Asia/Tehran')) = 3
              AND EXTRACT(DAY FROM ("createdAt" AT TIME ZONE 'Asia/Tehran')) >= 21
            )
          THEN EXTRACT(YEAR FROM ("createdAt" AT TIME ZONE 'Asia/Tehran'))::int - 621
          ELSE EXTRACT(YEAR FROM ("createdAt" AT TIME ZONE 'Asia/Tehran'))::int - 622
        END
      ORDER BY "createdAt", id
    ) AS seq
  FROM "board_minutes"
)
UPDATE "board_minutes" AS m
SET
  "minutesYear" = n.y,
  "minutesSeq" = n.seq,
  "minutesNo" = n.y::text || '/' || n.seq::text,
  "status" = 'HELD'
FROM numbered n
WHERE m.id = n.id;

-- AlterTable
ALTER TABLE "board_minutes" ALTER COLUMN "minutesYear" SET NOT NULL;
ALTER TABLE "board_minutes" ALTER COLUMN "minutesSeq" SET NOT NULL;
ALTER TABLE "board_minutes" ALTER COLUMN "minutesNo" SET NOT NULL;

-- CreateTable
CREATE TABLE "board_minutes_requests" (
    "minutesId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_minutes_requests_pkey" PRIMARY KEY ("minutesId", "requestId")
);

-- Copy existing single request links
INSERT INTO "board_minutes_requests" ("minutesId", "requestId")
SELECT id, "requestId"
FROM "board_minutes"
WHERE "requestId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "board_minutes" DROP CONSTRAINT "board_minutes_requestId_fkey";

-- DropIndex
DROP INDEX "board_minutes_requestId_idx";

-- AlterTable
ALTER TABLE "board_minutes" DROP COLUMN "requestId";

-- CreateIndex
CREATE UNIQUE INDEX "board_minutes_minutesNo_key" ON "board_minutes"("minutesNo");
CREATE UNIQUE INDEX "board_minutes_minutesYear_minutesSeq_key" ON "board_minutes"("minutesYear", "minutesSeq");
CREATE INDEX "board_minutes_status_idx" ON "board_minutes"("status");
CREATE INDEX "board_minutes_minutesNo_idx" ON "board_minutes"("minutesNo");
CREATE INDEX "board_minutes_requests_requestId_idx" ON "board_minutes_requests"("requestId");

-- AddForeignKey
ALTER TABLE "board_minutes_requests" ADD CONSTRAINT "board_minutes_requests_minutesId_fkey" FOREIGN KEY ("minutesId") REFERENCES "board_minutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "board_minutes_requests" ADD CONSTRAINT "board_minutes_requests_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "board_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
