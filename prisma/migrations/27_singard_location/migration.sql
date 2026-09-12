-- AlterTable
ALTER TABLE "singard_feedbacks" ADD COLUMN "address" TEXT;
ALTER TABLE "singard_feedbacks" ADD COLUMN "latitude" DECIMAL(10,7);
ALTER TABLE "singard_feedbacks" ADD COLUMN "longitude" DECIMAL(10,7);
