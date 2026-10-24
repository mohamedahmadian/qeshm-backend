-- کد سیستمی نوع واحد برای سلسله‌مراتب تأیید هیئت مدیره
ALTER TABLE "organization_unit_kinds" ADD COLUMN "code" TEXT;
ALTER TABLE "organization_unit_kinds" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;

UPDATE "organization_unit_kinds" SET "code" = 'BOARD', "isSystem" = true WHERE "name" = 'هیئت مدیره';
UPDATE "organization_unit_kinds" SET "code" = 'ADVISORS', "isSystem" = true WHERE "name" = 'مشاورین';
UPDATE "organization_unit_kinds" SET "code" = 'OFFICE', "isSystem" = true WHERE "name" = 'دفتر';
UPDATE "organization_unit_kinds" SET "code" = 'VICE', "isSystem" = true WHERE "name" = 'معاونت';
UPDATE "organization_unit_kinds" SET "code" = 'MANAGEMENT', "isSystem" = true WHERE "name" = 'مدیریت';
UPDATE "organization_unit_kinds" SET "code" = 'DEPARTMENT', "isSystem" = true WHERE "name" = 'اداره';

CREATE UNIQUE INDEX "organization_unit_kinds_code_key" ON "organization_unit_kinds"("code");
CREATE INDEX "organization_unit_kinds_code_idx" ON "organization_unit_kinds"("code");
CREATE INDEX "organization_unit_kinds_isSystem_idx" ON "organization_unit_kinds"("isSystem");

-- مرحله مدیریت دیگر از ماتریس ثابت واحد/سمت استفاده نمی‌کند
DELETE FROM "board_stage_units" WHERE "stage" = 'MANAGEMENT';
DELETE FROM "board_stage_positions" WHERE "stage" = 'MANAGEMENT';
