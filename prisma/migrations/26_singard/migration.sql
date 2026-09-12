-- CreateEnum
CREATE TYPE "SingardFeedbackKind" AS ENUM ('SUGGESTION', 'COMPLAINT', 'CRITICISM', 'REPORT');

-- CreateEnum
CREATE TYPE "SingardFeedbackStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SingardAttachmentKind" AS ENUM ('IMAGE', 'AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "SingardActivityKind" AS ENUM ('NOTE', 'CONTACT', 'REPLY');

-- CreateTable
CREATE TABLE "singard_categories" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "singard_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "singard_feedbacks" (
    "id" TEXT NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "kind" "SingardFeedbackKind" NOT NULL,
    "status" "SingardFeedbackStatus" NOT NULL DEFAULT 'NEW',
    "categoryId" TEXT NOT NULL,
    "userId" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT true,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "body" TEXT,
    "replyBody" TEXT,
    "repliedAt" TIMESTAMP(3),
    "repliedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "singard_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "singard_attachments" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "kind" "SingardAttachmentKind" NOT NULL,
    "imageId" TEXT,
    "fileId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "singard_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "singard_activities" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "kind" "SingardActivityKind" NOT NULL DEFAULT 'NOTE',
    "occurredAt" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "singard_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "singard_categories_parentId_sortOrder_idx" ON "singard_categories"("parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "singard_categories_isActive_idx" ON "singard_categories"("isActive");

-- CreateIndex
CREATE INDEX "singard_categories_name_idx" ON "singard_categories"("name");

-- CreateIndex
CREATE INDEX "singard_categories_createdAt_idx" ON "singard_categories"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "singard_feedbacks_trackingCode_key" ON "singard_feedbacks"("trackingCode");

-- CreateIndex
CREATE INDEX "singard_feedbacks_kind_status_idx" ON "singard_feedbacks"("kind", "status");

-- CreateIndex
CREATE INDEX "singard_feedbacks_categoryId_idx" ON "singard_feedbacks"("categoryId");

-- CreateIndex
CREATE INDEX "singard_feedbacks_userId_idx" ON "singard_feedbacks"("userId");

-- CreateIndex
CREATE INDEX "singard_feedbacks_phone_idx" ON "singard_feedbacks"("phone");

-- CreateIndex
CREATE INDEX "singard_feedbacks_createdAt_idx" ON "singard_feedbacks"("createdAt");

-- CreateIndex
CREATE INDEX "singard_attachments_feedbackId_sortOrder_idx" ON "singard_attachments"("feedbackId", "sortOrder");

-- CreateIndex
CREATE INDEX "singard_attachments_imageId_idx" ON "singard_attachments"("imageId");

-- CreateIndex
CREATE INDEX "singard_attachments_fileId_idx" ON "singard_attachments"("fileId");

-- CreateIndex
CREATE INDEX "singard_activities_feedbackId_occurredAt_idx" ON "singard_activities"("feedbackId", "occurredAt");

-- CreateIndex
CREATE INDEX "singard_activities_createdById_idx" ON "singard_activities"("createdById");

-- CreateIndex
CREATE INDEX "singard_activities_createdAt_idx" ON "singard_activities"("createdAt");

-- AddForeignKey
ALTER TABLE "singard_categories" ADD CONSTRAINT "singard_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "singard_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "singard_feedbacks" ADD CONSTRAINT "singard_feedbacks_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "singard_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "singard_feedbacks" ADD CONSTRAINT "singard_feedbacks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "singard_feedbacks" ADD CONSTRAINT "singard_feedbacks_repliedById_fkey" FOREIGN KEY ("repliedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "singard_attachments" ADD CONSTRAINT "singard_attachments_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "singard_feedbacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "singard_attachments" ADD CONSTRAINT "singard_attachments_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "stored_images"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "singard_attachments" ADD CONSTRAINT "singard_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "singard_activities" ADD CONSTRAINT "singard_activities_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "singard_feedbacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "singard_activities" ADD CONSTRAINT "singard_activities_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Default categories
INSERT INTO "singard_categories" ("id", "parentId", "name", "description", "sortOrder", "isActive", "createdAt", "updatedAt") VALUES
('a1000000-0000-4000-8000-000000000001', NULL, 'خدمات شهری و محیط زیست', 'نظافت، فضای سبز، روشنایی و محیط زندگی در جزیره', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('a1000000-0000-4000-8000-000000000002', NULL, 'گردشگری و میراث', 'سواحل، جاذبه‌ها، اقامت و تجربه سفر به قشم', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('a1000000-0000-4000-8000-000000000003', NULL, 'حمل‌ونقل و رفت‌وآمد', 'تاکسی، اسکله، جاده و تردد در جزیره', 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('a1000000-0000-4000-8000-000000000004', NULL, 'بازار و کسب‌وکار', 'بازارها، اصناف، قیمت و کیفیت کالا', 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('a1000000-0000-4000-8000-000000000005', NULL, 'سلامت و ایمنی', 'بهداشت، ایمنی و آرامش شهروندان و گردشگران', 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('a1000000-0000-4000-8000-000000000006', NULL, 'سایر موضوعات', 'هر چیز دیگری که دوست دارید با ما در میان بگذارید', 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "singard_categories" ("id", "parentId", "name", "description", "sortOrder", "isActive", "createdAt", "updatedAt") VALUES
('a1000000-0000-4000-8000-000000000011', 'a1000000-0000-4000-8000-000000000001', 'نظافت و پسماند', NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('a1000000-0000-4000-8000-000000000012', 'a1000000-0000-4000-8000-000000000001', 'فضای سبز', NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('a1000000-0000-4000-8000-000000000013', 'a1000000-0000-4000-8000-000000000001', 'روشنایی معابر', NULL, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('a1000000-0000-4000-8000-000000000021', 'a1000000-0000-4000-8000-000000000002', 'سواحل و دریا', NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('a1000000-0000-4000-8000-000000000022', 'a1000000-0000-4000-8000-000000000002', 'جاذبه‌های گردشگری', NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('a1000000-0000-4000-8000-000000000023', 'a1000000-0000-4000-8000-000000000002', 'اقامت و هتل', NULL, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('a1000000-0000-4000-8000-000000000031', 'a1000000-0000-4000-8000-000000000003', 'تاکسی و ون', NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('a1000000-0000-4000-8000-000000000032', 'a1000000-0000-4000-8000-000000000003', 'اسکله و شناور', NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('a1000000-0000-4000-8000-000000000033', 'a1000000-0000-4000-8000-000000000003', 'جاده و ترافیک', NULL, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('a1000000-0000-4000-8000-000000000041', 'a1000000-0000-4000-8000-000000000004', 'بازارها و اصناف', NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('a1000000-0000-4000-8000-000000000042', 'a1000000-0000-4000-8000-000000000004', 'قیمت و کیفیت کالا', NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "roles" ("id", "code", "name", "description", "isSystem", "createdAt", "updatedAt")
SELECT 'b1000000-0000-4000-8000-000000000001', 'CITIZEN', 'شهروند و گردشگر', 'ثبت نظر در سینگارد و پیگیری نظرهای خود', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "code" = 'CITIZEN');

INSERT INTO "role_permissions" ("roleId", "code")
SELECT "id", 'singard.submit' FROM "roles" WHERE "code" = 'CITIZEN'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "code")
SELECT "id", 'singard.mine' FROM "roles" WHERE "code" = 'CITIZEN'
ON CONFLICT DO NOTHING;
