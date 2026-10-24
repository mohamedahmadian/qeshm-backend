-- AlterTable
ALTER TABLE "board_requests" ADD COLUMN "trackingYear" INTEGER;
ALTER TABLE "board_requests" ADD COLUMN "trackingSeq" INTEGER;
ALTER TABLE "board_requests" ADD COLUMN "trackingNo" TEXT;

-- Backfill existing rows by Jalali year of createdAt (Tehran)
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
  FROM "board_requests"
)
UPDATE "board_requests" AS b
SET
  "trackingYear" = n.y,
  "trackingSeq" = n.seq,
  "trackingNo" = n.y::text || '/' || n.seq::text
FROM numbered n
WHERE b.id = n.id;

-- AlterTable
ALTER TABLE "board_requests" ALTER COLUMN "trackingYear" SET NOT NULL;
ALTER TABLE "board_requests" ALTER COLUMN "trackingSeq" SET NOT NULL;
ALTER TABLE "board_requests" ALTER COLUMN "trackingNo" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "board_requests_trackingNo_key" ON "board_requests"("trackingNo");
CREATE UNIQUE INDEX "board_requests_trackingYear_trackingSeq_key" ON "board_requests"("trackingYear", "trackingSeq");
