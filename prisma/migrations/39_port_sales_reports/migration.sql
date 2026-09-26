-- CreateEnum
CREATE TYPE "PortTicketStatus" AS ENUM ('IN_TRIP', 'OPERATOR_CANCELLED', 'EXPIRED', 'OTHER');

-- CreateTable
CREATE TABLE "port_sales_reports" (
    "id" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueNationalIdCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "port_sales_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "port_ticket_sales" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "ticketNumber" TEXT,
    "reservationCode" TEXT,
    "nationalId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT,
    "fatherName" TEXT,
    "gender" TEXT,
    "phone" TEXT,
    "travelDate" DATE,
    "travelTime" TEXT,
    "origin" TEXT,
    "destination" TEXT,
    "ticketStatus" "PortTicketStatus" NOT NULL DEFAULT 'OTHER',
    "ticketStatusRaw" TEXT,
    "amount" INTEGER,
    "seatNumber" TEXT,
    "ticketType" TEXT,
    "vesselName" TEXT,
    "extras" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "port_ticket_sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "port_sales_reports_reportDate_idx" ON "port_sales_reports"("reportDate");

-- CreateIndex
CREATE INDEX "port_sales_reports_origin_idx" ON "port_sales_reports"("origin");

-- CreateIndex
CREATE INDEX "port_sales_reports_destination_idx" ON "port_sales_reports"("destination");

-- CreateIndex
CREATE INDEX "port_sales_reports_createdAt_idx" ON "port_sales_reports"("createdAt");

-- CreateIndex
CREATE INDEX "port_sales_reports_fileId_idx" ON "port_sales_reports"("fileId");

-- CreateIndex
CREATE INDEX "port_ticket_sales_reportId_idx" ON "port_ticket_sales"("reportId");

-- CreateIndex
CREATE INDEX "port_ticket_sales_reportId_ticketStatus_idx" ON "port_ticket_sales"("reportId", "ticketStatus");

-- CreateIndex
CREATE INDEX "port_ticket_sales_nationalId_idx" ON "port_ticket_sales"("nationalId");

-- CreateIndex
CREATE INDEX "port_ticket_sales_ticketNumber_idx" ON "port_ticket_sales"("ticketNumber");

-- CreateIndex
CREATE INDEX "port_ticket_sales_fullName_idx" ON "port_ticket_sales"("fullName");

-- CreateIndex
CREATE INDEX "port_ticket_sales_travelDate_idx" ON "port_ticket_sales"("travelDate");

-- AddForeignKey
ALTER TABLE "port_sales_reports" ADD CONSTRAINT "port_sales_reports_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "port_ticket_sales" ADD CONSTRAINT "port_ticket_sales_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "port_sales_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
