-- AlterTable
ALTER TABLE "board_requests" ALTER COLUMN "managementAt" TYPE TIMESTAMP(3) USING (
  CASE
    WHEN "managementAt" IS NULL THEN NULL
    WHEN "managementAt" = DATE("updatedAt") THEN "updatedAt"
    WHEN "managementAt" = DATE("createdAt") THEN "createdAt"
    ELSE "managementAt"::timestamp
  END
);
ALTER TABLE "board_requests" ALTER COLUMN "legalAt" TYPE TIMESTAMP(3) USING (
  CASE
    WHEN "legalAt" IS NULL THEN NULL
    WHEN "legalAt" = DATE("updatedAt") THEN "updatedAt"
    WHEN "legalAt" = DATE("createdAt") THEN "createdAt"
    ELSE "legalAt"::timestamp
  END
);
ALTER TABLE "board_requests" ALTER COLUMN "budgetAt" TYPE TIMESTAMP(3) USING (
  CASE
    WHEN "budgetAt" IS NULL THEN NULL
    WHEN "budgetAt" = DATE("updatedAt") THEN "updatedAt"
    WHEN "budgetAt" = DATE("createdAt") THEN "createdAt"
    ELSE "budgetAt"::timestamp
  END
);
ALTER TABLE "board_requests" ALTER COLUMN "secretaryAt" TYPE TIMESTAMP(3) USING (
  CASE
    WHEN "secretaryAt" IS NULL THEN NULL
    WHEN "secretaryAt" = DATE("updatedAt") THEN "updatedAt"
    WHEN "secretaryAt" = DATE("createdAt") THEN "createdAt"
    ELSE "secretaryAt"::timestamp
  END
);
ALTER TABLE "board_requests" ALTER COLUMN "ceoAt" TYPE TIMESTAMP(3) USING (
  CASE
    WHEN "ceoAt" IS NULL THEN NULL
    WHEN "ceoAt" = DATE("updatedAt") THEN "updatedAt"
    WHEN "ceoAt" = DATE("createdAt") THEN "createdAt"
    ELSE "ceoAt"::timestamp
  END
);
ALTER TABLE "board_requests" ALTER COLUMN "rejectedAt" TYPE TIMESTAMP(3) USING (
  CASE
    WHEN "rejectedAt" IS NULL THEN NULL
    WHEN "rejectedAt" = DATE("updatedAt") THEN "updatedAt"
    WHEN "rejectedAt" = DATE("createdAt") THEN "createdAt"
    ELSE "rejectedAt"::timestamp
  END
);
