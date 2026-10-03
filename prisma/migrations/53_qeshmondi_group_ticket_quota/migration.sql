-- گروه متنی و سهمیه بلیط فردی قشموند. سهمیه برای رکوردهای موجود و جدید ۱ است.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "qeshmondiGroup" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "individualTicketQuota" INTEGER NOT NULL DEFAULT 1;
