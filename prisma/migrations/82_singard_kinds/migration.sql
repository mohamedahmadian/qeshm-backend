-- CreateTable
CREATE TABLE "singard_kinds" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "singard_kinds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "singard_kinds_sortOrder_idx" ON "singard_kinds"("sortOrder");

-- CreateIndex
CREATE INDEX "singard_kinds_isActive_idx" ON "singard_kinds"("isActive");

-- CreateIndex
CREATE INDEX "singard_kinds_title_idx" ON "singard_kinds"("title");

-- CreateIndex
CREATE INDEX "singard_kinds_createdAt_idx" ON "singard_kinds"("createdAt");

INSERT INTO "singard_kinds" ("id", "title", "description", "icon", "sortOrder", "isActive", "createdAt", "updatedAt") VALUES
('a2000000-0000-4000-8000-000000000001', 'یه نظر یا پیشنهاد دارم', 'ایده‌ای داری که جزیره قشنگ‌تر بشه؟ عاشق شنیدنشیم.', 'lightbulb', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('a2000000-0000-4000-8000-000000000002', 'می‌خوام شکایت کنم', 'چیزی اذیتت کرده؟ بگو تا پیگیری‌ش کنیم.', 'alert-triangle', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('a2000000-0000-4000-8000-000000000003', 'یه انتقاد دارم', 'اگر فکر می‌کنی می‌شه بهتر کار کرد، حرف دلت رو بگو.', 'message-circle-heart', 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('a2000000-0000-4000-8000-000000000004', 'می‌خوام چیزی رو گزارش کنم', 'موضوعی دیدی که باید بدونیم؟ ممنون که خبر می‌دی.', 'flag', 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "singard_feedbacks" ADD COLUMN "kindId" TEXT;

UPDATE "singard_feedbacks" SET "kindId" = 'a2000000-0000-4000-8000-000000000001' WHERE "kind" = 'SUGGESTION';
UPDATE "singard_feedbacks" SET "kindId" = 'a2000000-0000-4000-8000-000000000002' WHERE "kind" = 'COMPLAINT';
UPDATE "singard_feedbacks" SET "kindId" = 'a2000000-0000-4000-8000-000000000003' WHERE "kind" = 'CRITICISM';
UPDATE "singard_feedbacks" SET "kindId" = 'a2000000-0000-4000-8000-000000000004' WHERE "kind" = 'REPORT';

ALTER TABLE "singard_feedbacks" ALTER COLUMN "kindId" SET NOT NULL;

DROP INDEX "singard_feedbacks_kind_status_idx";

ALTER TABLE "singard_feedbacks" DROP COLUMN "kind";

DROP TYPE "SingardFeedbackKind";

CREATE INDEX "singard_feedbacks_kindId_status_idx" ON "singard_feedbacks"("kindId", "status");

ALTER TABLE "singard_feedbacks" ADD CONSTRAINT "singard_feedbacks_kindId_fkey" FOREIGN KEY ("kindId") REFERENCES "singard_kinds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
