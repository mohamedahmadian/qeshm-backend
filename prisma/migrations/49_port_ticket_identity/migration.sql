-- AlterTable
ALTER TABLE "port_ticket_sales" ADD COLUMN "passportNumber" TEXT;
ALTER TABLE "port_ticket_sales" ADD COLUMN "citizenship" TEXT;

-- DropIndex
DROP INDEX "port_ticket_sales_reportId_ticketStatus_idx";

-- AlterTable
ALTER TABLE "port_ticket_sales" DROP COLUMN "ticketStatus";
ALTER TABLE "port_ticket_sales" DROP COLUMN "ticketStatusRaw";

-- DropEnum
DROP TYPE "PortTicketStatus";

-- CreateIndex
CREATE INDEX "port_ticket_sales_passportNumber_idx" ON "port_ticket_sales"("passportNumber");
