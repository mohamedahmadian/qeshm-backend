-- AlterTable
ALTER TABLE "board_requests" ADD COLUMN "legalReferredAt" TIMESTAMP(3);
ALTER TABLE "board_requests" ADD COLUMN "budgetReferredAt" TIMESTAMP(3);
ALTER TABLE "board_requests" ADD COLUMN "secretaryReferredAt" TIMESTAMP(3);
ALTER TABLE "board_requests" ADD COLUMN "ceoReferredAt" TIMESTAMP(3);

-- Current pending stage: last update is usually the previous approval (has clock)
UPDATE "board_requests" SET "legalReferredAt" = "updatedAt" WHERE "status" = 'PENDING_LEGAL';
UPDATE "board_requests" SET "budgetReferredAt" = "updatedAt" WHERE "status" = 'PENDING_BUDGET';
UPDATE "board_requests" SET "secretaryReferredAt" = "updatedAt" WHERE "status" = 'PENDING_SECRETARY';
UPDATE "board_requests" SET "ceoReferredAt" = "updatedAt" WHERE "status" = 'PENDING_CEO';

-- Stages already entered: keep a datetime (createdAt) so referral/elapsed never fall back to date-only
UPDATE "board_requests"
SET "legalReferredAt" = "createdAt"
WHERE "legalReferredAt" IS NULL
  AND (
    "status" IN ('PENDING_BUDGET', 'PENDING_SECRETARY', 'PENDING_CEO', 'APPROVED')
    OR "legalAt" IS NOT NULL
    OR "budgetAt" IS NOT NULL
    OR "secretaryAt" IS NOT NULL
    OR "ceoAt" IS NOT NULL
    OR ("status" = 'REJECTED' AND "rejectedStage" IN ('LEGAL', 'BUDGET', 'SECRETARY', 'CEO'))
  );

UPDATE "board_requests"
SET "budgetReferredAt" = "createdAt"
WHERE "budgetReferredAt" IS NULL
  AND (
    "status" IN ('PENDING_SECRETARY', 'PENDING_CEO', 'APPROVED')
    OR "budgetAt" IS NOT NULL
    OR "secretaryAt" IS NOT NULL
    OR "ceoAt" IS NOT NULL
    OR ("status" = 'REJECTED' AND "rejectedStage" IN ('BUDGET', 'SECRETARY', 'CEO'))
  );

UPDATE "board_requests"
SET "secretaryReferredAt" = "createdAt"
WHERE "secretaryReferredAt" IS NULL
  AND (
    "status" IN ('PENDING_CEO', 'APPROVED')
    OR "secretaryAt" IS NOT NULL
    OR "ceoAt" IS NOT NULL
    OR ("status" = 'REJECTED' AND "rejectedStage" IN ('SECRETARY', 'CEO'))
  );

UPDATE "board_requests"
SET "ceoReferredAt" = "createdAt"
WHERE "ceoReferredAt" IS NULL
  AND (
    "status" = 'APPROVED'
    OR "ceoAt" IS NOT NULL
    OR ("status" = 'REJECTED' AND "rejectedStage" = 'CEO')
    OR "kind" = 'MANAGEMENT'
  );
