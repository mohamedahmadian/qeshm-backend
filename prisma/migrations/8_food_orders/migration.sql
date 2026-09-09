-- CreateEnum
CREATE TYPE "FoodReservationStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateTable
CREATE TABLE "food_reservations" (
    "id" TEXT NOT NULL,
    "reservedAt" DATE NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "foodId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(18,0) NOT NULL,
    "status" "FoodReservationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "food_reservations_userId_reservedAt_idx" ON "food_reservations"("userId", "reservedAt");

-- CreateIndex
CREATE INDEX "food_reservations_orgUnitId_reservedAt_idx" ON "food_reservations"("orgUnitId", "reservedAt");

-- CreateIndex
CREATE INDEX "food_reservations_restaurantId_reservedAt_idx" ON "food_reservations"("restaurantId", "reservedAt");

-- CreateIndex
CREATE INDEX "food_reservations_foodId_idx" ON "food_reservations"("foodId");

-- CreateIndex
CREATE INDEX "food_reservations_status_idx" ON "food_reservations"("status");

-- CreateIndex
CREATE INDEX "food_reservations_createdAt_idx" ON "food_reservations"("createdAt");

-- AddForeignKey
ALTER TABLE "food_reservations" ADD CONSTRAINT "food_reservations_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_reservations" ADD CONSTRAINT "food_reservations_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_reservations" ADD CONSTRAINT "food_reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_reservations" ADD CONSTRAINT "food_reservations_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "organization_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
