-- شمارنده‌های بررسی قشموندی و اسنپ‌شات سهمیه، تا لود گزارش بلیط‌ها را دوباره اسکن نکند.
ALTER TABLE "port_sales_reports"
  ADD COLUMN "nationalIdPrefixCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "validQeshmondiCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "invalidQeshmondiCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "weeklyQuotaExcessCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "quotaSnapshotReady" BOOLEAN NOT NULL DEFAULT false;

UPDATE "port_sales_reports" AS report
SET
  "nationalIdPrefixCount" = stats.prefix_count,
  "validQeshmondiCount" = stats.valid_count,
  "invalidQeshmondiCount" = stats.invalid_count,
  "weeklyQuotaExcessCount" = stats.excess_count
FROM (
  SELECT
    "reportId",
    COUNT(DISTINCT "nationalId") FILTER (WHERE "nationalId" LIKE '345%')::INTEGER AS prefix_count,
    COUNT(*) FILTER (WHERE "qeshmondiStatus" = 'VALID')::INTEGER AS valid_count,
    COUNT(*) FILTER (WHERE "qeshmondiStatus" = 'INVALID')::INTEGER AS invalid_count,
    COUNT(*) FILTER (WHERE "weeklyQuotaExcess")::INTEGER AS excess_count
  FROM "port_ticket_sales"
  GROUP BY "reportId"
) AS stats
WHERE report.id = stats."reportId";

CREATE TABLE "port_ticket_weekly_quotas" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "weekStart" DATE NOT NULL,
  "nationalId" TEXT NOT NULL,
  "total" INTEGER NOT NULL,
  "allowed" INTEGER NOT NULL,
  "unauthorized" INTEGER NOT NULL,
  CONSTRAINT "port_ticket_weekly_quotas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "port_ticket_personal_quotas" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "nationalId" TEXT NOT NULL,
  "total" INTEGER NOT NULL,
  "allowed" INTEGER NOT NULL,
  "unauthorized" INTEGER NOT NULL,
  CONSTRAINT "port_ticket_personal_quotas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "port_ticket_weekly_quotas_reportId_weekStart_nationalId_key"
  ON "port_ticket_weekly_quotas"("reportId", "weekStart", "nationalId");
CREATE INDEX "port_ticket_weekly_quotas_reportId_unauthorized_idx"
  ON "port_ticket_weekly_quotas"("reportId", "unauthorized");
CREATE INDEX "port_ticket_weekly_quotas_reportId_nationalId_idx"
  ON "port_ticket_weekly_quotas"("reportId", "nationalId");

CREATE UNIQUE INDEX "port_ticket_personal_quotas_reportId_nationalId_key"
  ON "port_ticket_personal_quotas"("reportId", "nationalId");
CREATE INDEX "port_ticket_personal_quotas_reportId_unauthorized_idx"
  ON "port_ticket_personal_quotas"("reportId", "unauthorized");

ALTER TABLE "port_ticket_weekly_quotas"
  ADD CONSTRAINT "port_ticket_weekly_quotas_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "port_sales_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "port_ticket_personal_quotas"
  ADD CONSTRAINT "port_ticket_personal_quotas_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "port_sales_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
