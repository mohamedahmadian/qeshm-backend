INSERT INTO "role_permissions" ("roleId", "code")
SELECT DISTINCT rp."roleId", 'stakeholders.port-sales-reports'
FROM "role_permissions" rp
WHERE rp."code" IN ('ports.sales-reports', 'ports')
ON CONFLICT ("roleId", "code") DO NOTHING;

DELETE FROM "role_permissions"
WHERE "code" IN ('ports.sales-reports', 'ports');
