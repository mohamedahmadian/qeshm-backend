-- AlterTable
ALTER TABLE "restaurant_menu_items" ADD COLUMN "offeredAt" DATE NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE "restaurant_menu_items" ALTER COLUMN "offeredAt" DROP DEFAULT;

-- DropIndex
DROP INDEX "restaurant_menu_items_restaurantId_foodId_key";

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_menu_items_restaurantId_foodId_offeredAt_key" ON "restaurant_menu_items"("restaurantId", "foodId", "offeredAt");

-- CreateIndex
CREATE INDEX "restaurant_menu_items_offeredAt_idx" ON "restaurant_menu_items"("offeredAt");
