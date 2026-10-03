-- برنامهٔ غذایی از تاریخ مشخص به قالب ثابت هفتگی منتقل می‌شود.
-- ردیف‌های تاریخی به یک هفتهٔ تکرارشونده نگاشت نمی‌شوند.
DELETE FROM "restaurant_menu_items";

DROP INDEX IF EXISTS "restaurant_menu_items_restaurantId_foodId_offeredAt_key";
DROP INDEX IF EXISTS "restaurant_menu_items_offeredAt_idx";

ALTER TABLE "restaurant_menu_items" DROP COLUMN "offeredAt";
ALTER TABLE "restaurant_menu_items" ADD COLUMN "weekday" INTEGER NOT NULL;

CREATE UNIQUE INDEX "restaurant_menu_items_restaurantId_foodId_weekday_key" ON "restaurant_menu_items"("restaurantId", "foodId", "weekday");
CREATE INDEX "restaurant_menu_items_weekday_idx" ON "restaurant_menu_items"("weekday");
