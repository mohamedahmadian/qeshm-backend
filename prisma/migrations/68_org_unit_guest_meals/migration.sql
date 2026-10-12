-- AlterTable
ALTER TABLE "organization_units" ADD COLUMN "guestMealsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organization_units" ADD COLUMN "maxGuestMeals" INTEGER;
