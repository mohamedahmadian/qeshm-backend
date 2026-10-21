-- CreateEnum
CREATE TYPE "FoodMealType" AS ENUM ('LUNCH', 'DINNER');

-- AlterTable
ALTER TABLE "food_reservations" ADD COLUMN "mealType" "FoodMealType" NOT NULL DEFAULT 'LUNCH';

-- AlterTable
ALTER TABLE "advanced_food_orders" ADD COLUMN "mealType" "FoodMealType" NOT NULL DEFAULT 'LUNCH';

-- CreateIndex
CREATE INDEX "food_reservations_mealType_idx" ON "food_reservations"("mealType");

-- CreateIndex
CREATE INDEX "advanced_food_orders_mealType_idx" ON "advanced_food_orders"("mealType");
