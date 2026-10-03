-- AlterTable
ALTER TABLE "port_ticket_sales" ADD COLUMN "weeklyQuotaExcess" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "port_ticket_sales_reportId_weeklyQuotaExcess_idx" ON "port_ticket_sales"("reportId", "weeklyQuotaExcess");
