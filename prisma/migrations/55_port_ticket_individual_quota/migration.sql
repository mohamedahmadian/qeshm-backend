-- سهمیهٔ هفتگی از این پس از individualTicketQuota هر شخص می‌آید؛ اسنپ‌شات‌های قبلی (با سقف ثابت ۱) دوباره ساخته شوند.
UPDATE "port_sales_reports" SET "quotaSnapshotReady" = false WHERE "quotaSnapshotReady" = true;
