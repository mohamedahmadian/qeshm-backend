-- کاربر تعاونی بلیت و توکن امنیتی هر بندر.

ALTER TABLE "ports" ADD COLUMN "securityToken" TEXT;
ALTER TABLE "ports" ADD COLUMN "operatorUserId" TEXT;

UPDATE "ports"
SET "securityToken" = md5(gen_random_uuid()::text || gen_random_uuid()::text)
WHERE "securityToken" IS NULL;

ALTER TABLE "ports" ALTER COLUMN "securityToken" SET NOT NULL;

CREATE UNIQUE INDEX "ports_securityToken_key" ON "ports"("securityToken");
CREATE UNIQUE INDEX "ports_operatorUserId_key" ON "ports"("operatorUserId");

ALTER TABLE "ports"
ADD CONSTRAINT "ports_operatorUserId_fkey"
FOREIGN KEY ("operatorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "roles" ("id", "code", "name", "description", "isSystem", "createdAt", "updatedAt")
VALUES (
    gen_random_uuid()::text,
    'TAAVONI_BELIT',
    'تعاونی بلیت',
    'کاربر تعاونی فروش بلیت که به یک بندر اختصاص داده می‌شود',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET "isSystem" = true;

INSERT INTO "role_permissions" ("roleId", "code")
SELECT "id", 'stakeholders.port-sales-reports'
FROM "roles"
WHERE "code" = 'TAAVONI_BELIT'
ON CONFLICT ("roleId", "code") DO NOTHING;
