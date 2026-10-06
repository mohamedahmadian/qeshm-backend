-- دو مبلغ یارانهٔ نامعتبر: بلیط قشموندی نامعتبر و مازاد سهمیهٔ هفتگی.
ALTER TABLE "port_sales_reports" ADD COLUMN "invalidQeshmondiSubsidy" INTEGER;
ALTER TABLE "port_sales_reports" ADD COLUMN "weeklyQuotaExcessSubsidy" INTEGER;
