-- CreateTable
CREATE TABLE "project_contractor_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_contractor_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_contractor_types_name_key" ON "project_contractor_types"("name");

-- CreateIndex
CREATE INDEX "project_contractor_types_name_idx" ON "project_contractor_types"("name");

-- CreateIndex
CREATE INDEX "project_contractor_types_createdAt_idx" ON "project_contractor_types"("createdAt");

INSERT INTO "project_contractor_types" ("id", "name", "createdAt", "updatedAt")
VALUES
    (gen_random_uuid()::text, 'پروژه‌ای', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'پشتیبانی', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'مشاوره', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'تأمین‌کننده', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "project_contractors" ADD COLUMN "typeId" TEXT;

-- CreateIndex
CREATE INDEX "project_contractors_typeId_idx" ON "project_contractors"("typeId");

-- AddForeignKey
ALTER TABLE "project_contractors" ADD CONSTRAINT "project_contractors_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "project_contractor_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
