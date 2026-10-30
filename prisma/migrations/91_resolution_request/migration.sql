-- AlterTable
ALTER TABLE "board_minutes_resolutions" ADD COLUMN "requestId" TEXT;

-- Backfill: match auto-created resolutions to the request with the same subject
UPDATE "board_minutes_resolutions" AS r
SET "requestId" = matched."requestId"
FROM (
  SELECT
    r2.id AS "resolutionId",
    MIN(mr."requestId") AS "requestId"
  FROM "board_minutes_resolutions" r2
  INNER JOIN "board_minutes_requests" mr ON mr."minutesId" = r2."minutesId"
  INNER JOIN "board_requests" req ON req.id = mr."requestId"
  WHERE r2.title = req.subject
  GROUP BY r2.id
  HAVING COUNT(*) = 1
) AS matched
WHERE r.id = matched."resolutionId"
  AND r."requestId" IS NULL;

-- Backfill: if the minutes has exactly one request, attach remaining resolutions to it
UPDATE "board_minutes_resolutions" AS r
SET "requestId" = only_one."requestId"
FROM (
  SELECT "minutesId", MIN("requestId") AS "requestId"
  FROM "board_minutes_requests"
  GROUP BY "minutesId"
  HAVING COUNT(*) = 1
) AS only_one
WHERE r."minutesId" = only_one."minutesId"
  AND r."requestId" IS NULL;

-- CreateIndex
CREATE INDEX "board_minutes_resolutions_requestId_idx" ON "board_minutes_resolutions"("requestId");

-- AddForeignKey
ALTER TABLE "board_minutes_resolutions" ADD CONSTRAINT "board_minutes_resolutions_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "board_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
