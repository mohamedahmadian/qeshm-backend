-- CreateEnum
CREATE TYPE "AdvancedFoodOrderSource" AS ENUM ('DEFAULT', 'MENU');

-- CreateTable
CREATE TABLE "advanced_food_orders" (
    "id" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "source" "AdvancedFoodOrderSource" NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "foodLabel" TEXT NOT NULL,
    "employeeQuantity" INTEGER NOT NULL,
    "managementQuantity" INTEGER NOT NULL,
    "employeeUnitPrice" DECIMAL(18,0),
    "managementUnitPrice" DECIMAL(18,0),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advanced_food_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "advanced_food_orders_orgUnitId_idx" ON "advanced_food_orders"("orgUnitId");

-- CreateIndex
CREATE INDEX "advanced_food_orders_restaurantId_idx" ON "advanced_food_orders"("restaurantId");

-- CreateIndex
CREATE INDEX "advanced_food_orders_createdById_idx" ON "advanced_food_orders"("createdById");

-- CreateIndex
CREATE INDEX "advanced_food_orders_startsOn_idx" ON "advanced_food_orders"("startsOn");

-- CreateIndex
CREATE INDEX "advanced_food_orders_endsOn_idx" ON "advanced_food_orders"("endsOn");

-- CreateIndex
CREATE INDEX "advanced_food_orders_foodLabel_idx" ON "advanced_food_orders"("foodLabel");

-- CreateIndex
CREATE INDEX "advanced_food_orders_createdAt_idx" ON "advanced_food_orders"("createdAt");

-- AddForeignKey
ALTER TABLE "advanced_food_orders" ADD CONSTRAINT "advanced_food_orders_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advanced_food_orders" ADD CONSTRAINT "advanced_food_orders_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advanced_food_orders" ADD CONSTRAINT "advanced_food_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "food_reservations" ADD COLUMN "advancedOrderId" TEXT;

-- CreateIndex
CREATE INDEX "food_reservations_advancedOrderId_idx" ON "food_reservations"("advancedOrderId");

-- AddForeignKey
ALTER TABLE "food_reservations" ADD CONSTRAINT "food_reservations_advancedOrderId_fkey" FOREIGN KEY ("advancedOrderId") REFERENCES "advanced_food_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
