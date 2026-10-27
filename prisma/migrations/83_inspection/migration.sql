-- CreateEnum
CREATE TYPE "InspectionFeedbackStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "InspectionAttachmentKind" AS ENUM ('IMAGE', 'AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "InspectionActivityKind" AS ENUM ('NOTE', 'CONTACT', 'REPLY');

-- CreateTable
CREATE TABLE "inspection_kinds" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_kinds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_categories" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_feedbacks" (
    "id" TEXT NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "kindId" TEXT NOT NULL,
    "status" "InspectionFeedbackStatus" NOT NULL DEFAULT 'NEW',
    "categoryId" TEXT NOT NULL,
    "userId" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT true,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "body" TEXT,
    "address" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "replyBody" TEXT,
    "repliedAt" TIMESTAMP(3),
    "repliedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_attachments" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "kind" "InspectionAttachmentKind" NOT NULL,
    "imageId" TEXT,
    "fileId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_activities" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "kind" "InspectionActivityKind" NOT NULL DEFAULT 'NOTE',
    "occurredAt" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inspection_kinds_sortOrder_idx" ON "inspection_kinds"("sortOrder");

-- CreateIndex
CREATE INDEX "inspection_kinds_isActive_idx" ON "inspection_kinds"("isActive");

-- CreateIndex
CREATE INDEX "inspection_kinds_title_idx" ON "inspection_kinds"("title");

-- CreateIndex
CREATE INDEX "inspection_kinds_createdAt_idx" ON "inspection_kinds"("createdAt");

-- CreateIndex
CREATE INDEX "inspection_categories_parentId_sortOrder_idx" ON "inspection_categories"("parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "inspection_categories_isActive_idx" ON "inspection_categories"("isActive");

-- CreateIndex
CREATE INDEX "inspection_categories_name_idx" ON "inspection_categories"("name");

-- CreateIndex
CREATE INDEX "inspection_categories_createdAt_idx" ON "inspection_categories"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_feedbacks_trackingCode_key" ON "inspection_feedbacks"("trackingCode");

-- CreateIndex
CREATE INDEX "inspection_feedbacks_kindId_status_idx" ON "inspection_feedbacks"("kindId", "status");

-- CreateIndex
CREATE INDEX "inspection_feedbacks_categoryId_idx" ON "inspection_feedbacks"("categoryId");

-- CreateIndex
CREATE INDEX "inspection_feedbacks_userId_idx" ON "inspection_feedbacks"("userId");

-- CreateIndex
CREATE INDEX "inspection_feedbacks_phone_idx" ON "inspection_feedbacks"("phone");

-- CreateIndex
CREATE INDEX "inspection_feedbacks_createdAt_idx" ON "inspection_feedbacks"("createdAt");

-- CreateIndex
CREATE INDEX "inspection_attachments_feedbackId_sortOrder_idx" ON "inspection_attachments"("feedbackId", "sortOrder");

-- CreateIndex
CREATE INDEX "inspection_attachments_imageId_idx" ON "inspection_attachments"("imageId");

-- CreateIndex
CREATE INDEX "inspection_attachments_fileId_idx" ON "inspection_attachments"("fileId");

-- CreateIndex
CREATE INDEX "inspection_activities_feedbackId_occurredAt_idx" ON "inspection_activities"("feedbackId", "occurredAt");

-- CreateIndex
CREATE INDEX "inspection_activities_createdById_idx" ON "inspection_activities"("createdById");

-- CreateIndex
CREATE INDEX "inspection_activities_createdAt_idx" ON "inspection_activities"("createdAt");

-- AddForeignKey
ALTER TABLE "inspection_categories" ADD CONSTRAINT "inspection_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "inspection_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_feedbacks" ADD CONSTRAINT "inspection_feedbacks_kindId_fkey" FOREIGN KEY ("kindId") REFERENCES "inspection_kinds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_feedbacks" ADD CONSTRAINT "inspection_feedbacks_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "inspection_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_feedbacks" ADD CONSTRAINT "inspection_feedbacks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_feedbacks" ADD CONSTRAINT "inspection_feedbacks_repliedById_fkey" FOREIGN KEY ("repliedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_attachments" ADD CONSTRAINT "inspection_attachments_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "inspection_feedbacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_attachments" ADD CONSTRAINT "inspection_attachments_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "stored_images"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_attachments" ADD CONSTRAINT "inspection_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_activities" ADD CONSTRAINT "inspection_activities_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "inspection_feedbacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_activities" ADD CONSTRAINT "inspection_activities_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "inspection_kinds" ("id", "title", "description", "icon", "sortOrder", "isActive", "createdAt", "updatedAt") VALUES
('b2000000-0000-4000-8000-000000000001', 'می‌خوام شکایت کنم', 'چیزی خلاف قانون یا رویه دیدی؟ بگو تا رسیدگی کنیم.', 'alert-triangle', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('b2000000-0000-4000-8000-000000000002', 'گزارش تخلف', 'موضوعی دیدی که باید بررسی شود؟ خبر بده.', 'flag', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('b2000000-0000-4000-8000-000000000003', 'درخواست رسیدگی', 'پرونده یا موضوعی داری که باید پیگیری شود.', 'scale', 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('b2000000-0000-4000-8000-000000000004', 'پیشنهاد اصلاح فرآیند', 'ایده‌ای برای بهتر شدن نظارت داری؟', 'lightbulb', 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "inspection_categories" ("id", "parentId", "name", "description", "sortOrder", "isActive", "createdAt", "updatedAt") VALUES
('b3000000-0000-4000-8000-000000000001', NULL, 'خدمات عمومی', NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('b3000000-0000-4000-8000-000000000002', NULL, 'تخلفات اداری', NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('b3000000-0000-4000-8000-000000000003', NULL, 'امور پیمانکاران', NULL, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('b3000000-0000-4000-8000-000000000004', NULL, 'سایر', NULL, 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
