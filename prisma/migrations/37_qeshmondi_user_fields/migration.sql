-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isQeshmondi" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "qeshmondiStartDate" DATE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "qeshmondiEndDate" DATE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "occupation" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isResident" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passportNumber" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_isQeshmondi_idx" ON "users"("isQeshmondi");
