-- خوراک تغییرات قشموند برای سرویس همگام‌سازی تعاونی.

CREATE TABLE "qeshmondi_feed_events" (
    "seq" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "nationalId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "qeshmondiEndDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qeshmondi_feed_events_pkey" PRIMARY KEY ("seq")
);

CREATE INDEX "qeshmondi_feed_events_userId_idx" ON "qeshmondi_feed_events"("userId");

ALTER TABLE "qeshmondi_feed_events"
ADD CONSTRAINT "qeshmondi_feed_events_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "users_qeshmondi_id_idx" ON "users" ("id") WHERE "isQeshmondi" = true;
