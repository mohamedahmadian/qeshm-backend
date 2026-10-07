-- Citizen-card profile columns and the base-data lookup used during SQL sync.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "latinFirstName" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "latinLastName" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "latinFatherName" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "identityNumber" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "identitySerial" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "landlinePhone" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "fax" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "postalCode" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "jobAddress" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "jobPhone" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "jobFax" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "jobPostalCode" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isSingle" BOOLEAN;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nationality" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "education" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "protectorOffice" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nationalIdExpiresAt" DATE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passportExpiresAt" DATE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bankFullName" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bankFullLatinName" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "accountNumber" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cardNumber" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cardSeries" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isBank" BOOLEAN;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "accountOpeningDate" DATE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cardIssuanceDate" DATE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cardDeliverDate" DATE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "companyName" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "companySubject" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "companyLicenseNumber" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "companyLicenseDate" DATE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "companyPaperNumber" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "companyPaperDate" DATE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "electricitySubscription" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "fingerprint" BYTEA;

CREATE TABLE IF NOT EXISTS "qeshmondi_lookups" (
  "sourceId" INTEGER NOT NULL,
  "code" TEXT,
  "title" TEXT,
  "type" INTEGER NOT NULL,
  "parentSourceId" INTEGER,
  CONSTRAINT "qeshmondi_lookups_pkey" PRIMARY KEY ("sourceId")
);

CREATE INDEX IF NOT EXISTS "qeshmondi_lookups_type_idx" ON "qeshmondi_lookups"("type");
