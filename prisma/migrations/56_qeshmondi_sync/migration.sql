-- اتصال ذخیره‌شدهٔ SQL Server و لاگ هر به‌روزرسانی قشموندان.

CREATE TYPE "QeshmondiSyncSource" AS ENUM ('FILE', 'DATABASE');
CREATE TYPE "QeshmondiSyncStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

CREATE TABLE "qeshmondi_sql_connections" (
  "id" TEXT NOT NULL,
  "host" TEXT NOT NULL,
  "port" INTEGER NOT NULL DEFAULT 1433,
  "databaseName" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordCipher" TEXT NOT NULL,
  "encrypt" BOOLEAN NOT NULL DEFAULT true,
  "trustServerCertificate" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedById" TEXT,
  CONSTRAINT "qeshmondi_sql_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "qeshmondi_sync_logs" (
  "id" TEXT NOT NULL,
  "source" "QeshmondiSyncSource" NOT NULL,
  "status" "QeshmondiSyncStatus" NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "actorId" TEXT,
  CONSTRAINT "qeshmondi_sync_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "qeshmondi_sync_logs_startedAt_idx" ON "qeshmondi_sync_logs"("startedAt");
CREATE INDEX "qeshmondi_sync_logs_source_idx" ON "qeshmondi_sync_logs"("source");
CREATE INDEX "qeshmondi_sync_logs_status_idx" ON "qeshmondi_sync_logs"("status");
CREATE INDEX "qeshmondi_sync_logs_actorId_idx" ON "qeshmondi_sync_logs"("actorId");

ALTER TABLE "qeshmondi_sql_connections"
  ADD CONSTRAINT "qeshmondi_sql_connections_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "qeshmondi_sync_logs"
  ADD CONSTRAINT "qeshmondi_sync_logs_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
