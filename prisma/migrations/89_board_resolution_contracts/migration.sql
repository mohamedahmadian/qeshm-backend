-- CreateEnum
CREATE TYPE "BoardResolutionContractKind" AS ENUM (
  'CONTRACTING',
  'GOODS_EQUIPMENT',
  'SERVICES',
  'CONSULTING',
  'DESIGN_ENGINEERING',
  'INFORMATION_TECHNOLOGY',
  'LEASE',
  'PARTNERSHIP',
  'INVESTMENT',
  'OPERATION',
  'SUPPLY',
  'TRANSPORT',
  'MARKETING',
  'OTHER'
);

-- CreateEnum
CREATE TYPE "BoardResolutionContractStatus" AS ENUM (
  'DRAFT',
  'ACTIVE',
  'COMPLETED',
  'TERMINATED',
  'SUSPENDED'
);

-- CreateTable
CREATE TABLE "board_resolution_contracts" (
    "id" TEXT NOT NULL,
    "resolutionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contractNo" TEXT,
    "party" TEXT,
    "kind" "BoardResolutionContractKind",
    "kindOther" TEXT,
    "amount" DECIMAL(18,0),
    "signedAt" DATE,
    "duration" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "status" "BoardResolutionContractStatus",
    "paidAmount" DECIMAL(18,0),
    "supervisor" TEXT,
    "fileId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_resolution_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "board_resolution_contracts_resolutionId_createdAt_idx" ON "board_resolution_contracts"("resolutionId", "createdAt");

-- CreateIndex
CREATE INDEX "board_resolution_contracts_title_idx" ON "board_resolution_contracts"("title");

-- CreateIndex
CREATE INDEX "board_resolution_contracts_fileId_idx" ON "board_resolution_contracts"("fileId");

-- AddForeignKey
ALTER TABLE "board_resolution_contracts" ADD CONSTRAINT "board_resolution_contracts_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "board_minutes_resolutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_resolution_contracts" ADD CONSTRAINT "board_resolution_contracts_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
