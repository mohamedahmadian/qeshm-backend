-- CreateTable
CREATE TABLE "organization_unit_restaurants" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_unit_restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_unit_restaurants_unitId_restaurantId_key" ON "organization_unit_restaurants"("unitId", "restaurantId");

-- CreateIndex
CREATE INDEX "organization_unit_restaurants_unitId_idx" ON "organization_unit_restaurants"("unitId");

-- CreateIndex
CREATE INDEX "organization_unit_restaurants_restaurantId_idx" ON "organization_unit_restaurants"("restaurantId");

-- CreateIndex
CREATE INDEX "organization_unit_restaurants_createdAt_idx" ON "organization_unit_restaurants"("createdAt");

-- AddForeignKey
ALTER TABLE "organization_unit_restaurants" ADD CONSTRAINT "organization_unit_restaurants_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "organization_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_unit_restaurants" ADD CONSTRAINT "organization_unit_restaurants_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
