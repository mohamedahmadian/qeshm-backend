-- AlterTable
ALTER TABLE "users" ADD COLUMN "signaturePhotoId" TEXT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_signaturePhotoId_fkey" FOREIGN KEY ("signaturePhotoId") REFERENCES "stored_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
