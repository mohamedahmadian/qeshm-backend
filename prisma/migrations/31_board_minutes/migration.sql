-- CreateEnum
CREATE TYPE "BoardMinutesAttendance" AS ENUM ('PRESENT', 'ABSENT');

-- CreateEnum
CREATE TYPE "BoardMinutesAttachmentKind" AS ENUM ('IMAGE', 'AUDIO');

-- CreateTable
CREATE TABLE "board_minutes" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "heldAt" DATE NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_minutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_minutes_members" (
    "id" TEXT NOT NULL,
    "minutesId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attendance" "BoardMinutesAttendance" NOT NULL DEFAULT 'PRESENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_minutes_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_minutes_attachments" (
    "id" TEXT NOT NULL,
    "minutesId" TEXT NOT NULL,
    "kind" "BoardMinutesAttachmentKind" NOT NULL,
    "imageId" TEXT,
    "fileId" TEXT,
    "originalName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_minutes_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_minutes_resolutions" (
    "id" TEXT NOT NULL,
    "minutesId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "unitId" TEXT NOT NULL,
    "dueDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_minutes_resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "board_minutes_requestId_idx" ON "board_minutes"("requestId");

-- CreateIndex
CREATE INDEX "board_minutes_heldAt_idx" ON "board_minutes"("heldAt");

-- CreateIndex
CREATE INDEX "board_minutes_subject_idx" ON "board_minutes"("subject");

-- CreateIndex
CREATE INDEX "board_minutes_createdById_idx" ON "board_minutes"("createdById");

-- CreateIndex
CREATE INDEX "board_minutes_createdAt_idx" ON "board_minutes"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "board_minutes_members_minutesId_userId_key" ON "board_minutes_members"("minutesId", "userId");

-- CreateIndex
CREATE INDEX "board_minutes_members_userId_idx" ON "board_minutes_members"("userId");

-- CreateIndex
CREATE INDEX "board_minutes_members_minutesId_idx" ON "board_minutes_members"("minutesId");

-- CreateIndex
CREATE INDEX "board_minutes_attachments_minutesId_sortOrder_idx" ON "board_minutes_attachments"("minutesId", "sortOrder");

-- CreateIndex
CREATE INDEX "board_minutes_attachments_imageId_idx" ON "board_minutes_attachments"("imageId");

-- CreateIndex
CREATE INDEX "board_minutes_attachments_fileId_idx" ON "board_minutes_attachments"("fileId");

-- CreateIndex
CREATE INDEX "board_minutes_resolutions_minutesId_idx" ON "board_minutes_resolutions"("minutesId");

-- CreateIndex
CREATE INDEX "board_minutes_resolutions_unitId_idx" ON "board_minutes_resolutions"("unitId");

-- CreateIndex
CREATE INDEX "board_minutes_resolutions_dueDate_idx" ON "board_minutes_resolutions"("dueDate");

-- CreateIndex
CREATE INDEX "board_minutes_resolutions_title_idx" ON "board_minutes_resolutions"("title");

-- CreateIndex
CREATE INDEX "board_minutes_resolutions_createdAt_idx" ON "board_minutes_resolutions"("createdAt");

-- AddForeignKey
ALTER TABLE "board_minutes" ADD CONSTRAINT "board_minutes_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "board_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_minutes" ADD CONSTRAINT "board_minutes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_minutes_members" ADD CONSTRAINT "board_minutes_members_minutesId_fkey" FOREIGN KEY ("minutesId") REFERENCES "board_minutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_minutes_members" ADD CONSTRAINT "board_minutes_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_minutes_attachments" ADD CONSTRAINT "board_minutes_attachments_minutesId_fkey" FOREIGN KEY ("minutesId") REFERENCES "board_minutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_minutes_attachments" ADD CONSTRAINT "board_minutes_attachments_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "stored_images"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_minutes_attachments" ADD CONSTRAINT "board_minutes_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_minutes_resolutions" ADD CONSTRAINT "board_minutes_resolutions_minutesId_fkey" FOREIGN KEY ("minutesId") REFERENCES "board_minutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_minutes_resolutions" ADD CONSTRAINT "board_minutes_resolutions_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
