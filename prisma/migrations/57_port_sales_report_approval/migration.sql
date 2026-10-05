-- وضعیت تأیید گزارش فروش بنادر: هر کاربر در هر ماه جلالی فقط یک گزارش.
DO $$
BEGIN
  CREATE TYPE "PortSalesReportApprovalStatus" AS ENUM ('DRAFT', 'APPROVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "port_sales_reports" ADD COLUMN IF NOT EXISTS "reportYear" INTEGER;
ALTER TABLE "port_sales_reports" ADD COLUMN IF NOT EXISTS "reportMonth" INTEGER;
ALTER TABLE "port_sales_reports"
  ADD COLUMN IF NOT EXISTS "approvalStatus" "PortSalesReportApprovalStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "port_sales_reports" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
ALTER TABLE "port_sales_reports" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "port_sales_reports" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;

-- همان الگوریتم gregorianToJalali برای پر کردن سال و ماه گزارش‌های موجود.
CREATE OR REPLACE FUNCTION port_sales_jalali_ym(d date, OUT y integer, OUT m integer)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  gy integer := EXTRACT(YEAR FROM d)::integer;
  gm integer := EXTRACT(MONTH FROM d)::integer;
  gd integer := EXTRACT(DAY FROM d)::integer;
  gy2 integer;
  days integer;
  jy integer;
  rest integer;
  g_days integer[] := ARRAY[0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
BEGIN
  gy2 := CASE WHEN gm > 2 THEN gy + 1 ELSE gy END;
  days := 355666
    + 365 * gy
    + (gy2 + 3) / 4
    - (gy2 + 99) / 100
    + (gy2 + 399) / 400
    + gd
    + g_days[gm];
  jy := -1595 + 33 * (days / 12053);
  days := days % 12053;
  jy := jy + 4 * (days / 1461);
  days := days % 1461;
  IF days > 365 THEN
    jy := jy + (days - 1) / 365;
    days := (days - 1) % 365;
  END IF;
  IF days < 186 THEN
    y := jy;
    m := 1 + days / 31;
  ELSE
    rest := days - 186;
    y := jy;
    m := 7 + rest / 30;
  END IF;
END;
$$;

UPDATE "port_sales_reports"
SET "reportYear" = (port_sales_jalali_ym("reportDate")).y,
    "reportMonth" = (port_sales_jalali_ym("reportDate")).m;

DROP FUNCTION port_sales_jalali_ym(date);

ALTER TABLE "port_sales_reports" ALTER COLUMN "reportYear" SET NOT NULL;
ALTER TABLE "port_sales_reports" ALTER COLUMN "reportMonth" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "port_sales_reports_approvalStatus_idx" ON "port_sales_reports"("approvalStatus");

CREATE UNIQUE INDEX IF NOT EXISTS "port_sales_reports_author_month_key"
  ON "port_sales_reports"("createdById", "reportYear", "reportMonth");

DO $$
BEGIN
  ALTER TABLE "port_sales_reports"
    ADD CONSTRAINT "port_sales_reports_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
