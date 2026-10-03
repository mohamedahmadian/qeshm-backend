-- CreateTable
CREATE TABLE "ticket_tariffs" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "individualPrice" INTEGER NOT NULL,
    "individualQeshmondiPrice" INTEGER NOT NULL,
    "individualSubsidy" INTEGER NOT NULL,
    "vehiclePrice" INTEGER NOT NULL,
    "vehicleQeshmondiPrice" INTEGER NOT NULL,
    "vehicleSubsidy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_tariffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_tariffs_year_key" ON "ticket_tariffs"("year");

-- CreateIndex
CREATE INDEX "ticket_tariffs_year_idx" ON "ticket_tariffs"("year");

-- CreateIndex
CREATE INDEX "ticket_tariffs_createdAt_idx" ON "ticket_tariffs"("createdAt");
