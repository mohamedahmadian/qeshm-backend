-- CreateEnum
CREATE TYPE "BoardMinutesMemberKind" AS ENUM ('USER', 'SIGNATORY', 'GUEST');

-- AlterTable
ALTER TABLE "board_minutes_members" ADD COLUMN "kind" "BoardMinutesMemberKind";
ALTER TABLE "board_minutes_members" ADD COLUMN "signatoryId" TEXT;
ALTER TABLE "board_minutes_members" ADD COLUMN "firstName" TEXT;
ALTER TABLE "board_minutes_members" ADD COLUMN "lastName" TEXT;
ALTER TABLE "board_minutes_members" ADD COLUMN "title" TEXT;

-- Backfill names from linked users
UPDATE "board_minutes_members" AS m
SET
  "kind" = 'USER',
  "firstName" = u."firstName",
  "lastName" = u."lastName"
FROM "users" u
WHERE m."userId" = u.id;

UPDATE "board_minutes_members"
SET
  "kind" = 'USER',
  "firstName" = COALESCE(NULLIF("firstName", ''), '—'),
  "lastName" = COALESCE(NULLIF("lastName", ''), '—')
WHERE "kind" IS NULL OR "firstName" IS NULL OR "lastName" IS NULL;

ALTER TABLE "board_minutes_members" ALTER COLUMN "kind" SET NOT NULL;
ALTER TABLE "board_minutes_members" ALTER COLUMN "kind" SET DEFAULT 'USER';
ALTER TABLE "board_minutes_members" ALTER COLUMN "firstName" SET NOT NULL;
ALTER TABLE "board_minutes_members" ALTER COLUMN "lastName" SET NOT NULL;
ALTER TABLE "board_minutes_members" ALTER COLUMN "userId" DROP NOT NULL;

CREATE UNIQUE INDEX "board_minutes_members_minutesId_signatoryId_key" ON "board_minutes_members"("minutesId", "signatoryId");
CREATE INDEX "board_minutes_members_signatoryId_idx" ON "board_minutes_members"("signatoryId");

ALTER TABLE "board_minutes_members" ADD CONSTRAINT "board_minutes_members_signatoryId_fkey" FOREIGN KEY ("signatoryId") REFERENCES "board_signatories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
