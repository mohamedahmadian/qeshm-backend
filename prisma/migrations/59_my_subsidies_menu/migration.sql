-- منوی یارانه‌های من برای نقش‌هایی که گزارش فروش بنادر یا کل ماژول ذی‌نفعان را دارند.
INSERT INTO "role_permissions" ("roleId", "code")
SELECT DISTINCT rp."roleId", 'stakeholders.my-subsidies'
FROM "role_permissions" rp
WHERE rp.code IN ('stakeholders.port-sales-reports', 'stakeholders')
ON CONFLICT ("roleId", "code") DO NOTHING;
