-- AlterTable
ALTER TABLE "restaurant_menu_items" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "restaurant_menu_items_isActive_idx" ON "restaurant_menu_items"("isActive");
