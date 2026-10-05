-- ثبت‌کنندهٔ گزارش فروش بنادر؛ گزارش‌های قبلی ثبت‌کننده ندارند و فقط برای مدیریت دیده می‌شوند.
ALTER TABLE "port_sales_reports" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

CREATE INDEX IF NOT EXISTS "port_sales_reports_createdById_idx" ON "port_sales_reports"("createdById");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'port_sales_reports_createdById_fkey'
  ) THEN
    ALTER TABLE "port_sales_reports"
      ADD CONSTRAINT "port_sales_reports_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
