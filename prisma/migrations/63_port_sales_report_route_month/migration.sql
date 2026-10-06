-- هر کاربر در هر ماه جلالی برای هر مبدأ و مقصد فقط یک گزارش.
DROP INDEX IF EXISTS "port_sales_reports_author_month_key";

CREATE UNIQUE INDEX IF NOT EXISTS "port_sales_reports_author_route_month_key"
  ON "port_sales_reports"("createdById", "reportYear", "reportMonth", "origin", "destination");
