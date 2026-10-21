-- AlterTable
ALTER TABLE "advanced_food_orders" ADD COLUMN "employeeGuestQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "managementGuestQuantity" INTEGER NOT NULL DEFAULT 0;
