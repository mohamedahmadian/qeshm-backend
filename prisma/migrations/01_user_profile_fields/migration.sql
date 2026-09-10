-- CreateEnum
CREATE TYPE "UserGender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "Religion" AS ENUM ('ISLAM', 'CHRISTIANITY', 'JUDAISM', 'ZOROASTRIANISM', 'OTHER');

-- AlterTable
ALTER TABLE "users"
ADD COLUMN "email" TEXT,
ADD COLUMN "gender" "UserGender",
ADD COLUMN "address" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "religion" "Religion",
ADD COLUMN "religionOther" TEXT,
ADD COLUMN "telegram" TEXT,
ADD COLUMN "bale" TEXT,
ADD COLUMN "eitaa" TEXT,
ADD COLUMN "whatsapp" TEXT,
ADD COLUMN "otherSocial" TEXT,
ADD COLUMN "vehiclePlates" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "nationalCardPhotoId" TEXT,
ADD COLUMN "passportPhotoId" TEXT,
ADD COLUMN "identityBookletPhotoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_nationalCardPhotoId_fkey" FOREIGN KEY ("nationalCardPhotoId") REFERENCES "stored_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_passportPhotoId_fkey" FOREIGN KEY ("passportPhotoId") REFERENCES "stored_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_identityBookletPhotoId_fkey" FOREIGN KEY ("identityBookletPhotoId") REFERENCES "stored_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
