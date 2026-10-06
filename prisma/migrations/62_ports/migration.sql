-- مدیریت بنادر درگاه یکپارچه ذی‌نفعان.

CREATE TYPE "PortKind" AS ENUM ('INDIVIDUAL', 'VEHICLE');

CREATE TABLE "ports" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "cooperativeName" TEXT NOT NULL,
    "address" TEXT,
    "kind" "PortKind" NOT NULL,
    "managerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ports_name_key" ON "ports"("name");
CREATE INDEX "ports_cityId_idx" ON "ports"("cityId");
CREATE INDEX "ports_kind_idx" ON "ports"("kind");
CREATE INDEX "ports_createdAt_idx" ON "ports"("createdAt");

ALTER TABLE "ports" ADD CONSTRAINT "ports_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
