INSERT INTO "role_permissions" ("roleId", "code")
SELECT DISTINCT rp."roleId", 'management.users'
FROM "role_permissions" rp
WHERE rp."code" IN ('dashboard.users', 'dashboard')
ON CONFLICT ("roleId", "code") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "code")
SELECT DISTINCT rp."roleId", 'management.roles'
FROM "role_permissions" rp
WHERE rp."code" IN ('base-info.roles', 'base-info')
ON CONFLICT ("roleId", "code") DO NOTHING;

DELETE FROM "role_permissions"
WHERE "code" IN ('dashboard.users', 'base-info.roles');
