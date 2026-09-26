-- CreateEnum
CREATE TYPE "PortTicketQeshmondiStatus" AS ENUM ('UNKNOWN', 'VALID', 'INVALID');

-- AlterTable
ALTER TABLE "port_ticket_sales" ADD COLUMN "qeshmondiStatus" "PortTicketQeshmondiStatus" NOT NULL DEFAULT 'UNKNOWN';

-- CreateIndex
CREATE INDEX "port_ticket_sales_reportId_qeshmondiStatus_idx" ON "port_ticket_sales"("reportId", "qeshmondiStatus");
