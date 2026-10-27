-- CreateEnum
CREATE TYPE "BoardResolutionDueKind" AS ENUM ('DATE', 'ASAP');

-- CreateEnum
CREATE TYPE "BoardResolutionProposerKind" AS ENUM ('TEXT', 'UNIT');

-- AlterTable
ALTER TABLE "board_minutes_resolutions" ADD COLUMN     "dueKind" "BoardResolutionDueKind" NOT NULL DEFAULT 'DATE',
ADD COLUMN     "hasTopicHistory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legalBasis" TEXT,
ADD COLUMN     "proposerKind" "BoardResolutionProposerKind" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "proposerText" TEXT,
ADD COLUMN     "proposerUnitId" TEXT;

-- CreateTable
CREATE TABLE "board_resolution_signatories" (
    "id" TEXT NOT NULL,
    "resolutionId" TEXT NOT NULL,
    "sourceSignatoryId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "signatureImageId" TEXT NOT NULL,
    "signedAt" DATE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_resolution_signatories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "board_minutes_resolutions_dueKind_idx" ON "board_minutes_resolutions"("dueKind");

-- CreateIndex
CREATE INDEX "board_minutes_resolutions_proposerUnitId_idx" ON "board_minutes_resolutions"("proposerUnitId");

-- CreateIndex
CREATE INDEX "board_resolution_signatories_resolutionId_sortOrder_idx" ON "board_resolution_signatories"("resolutionId", "sortOrder");

-- CreateIndex
CREATE INDEX "board_resolution_signatories_sourceSignatoryId_idx" ON "board_resolution_signatories"("sourceSignatoryId");

-- CreateIndex
CREATE INDEX "board_resolution_signatories_signatureImageId_idx" ON "board_resolution_signatories"("signatureImageId");

-- AddForeignKey
ALTER TABLE "board_minutes_resolutions" ADD CONSTRAINT "board_minutes_resolutions_proposerUnitId_fkey" FOREIGN KEY ("proposerUnitId") REFERENCES "organization_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_resolution_signatories" ADD CONSTRAINT "board_resolution_signatories_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "board_minutes_resolutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_resolution_signatories" ADD CONSTRAINT "board_resolution_signatories_sourceSignatoryId_fkey" FOREIGN KEY ("sourceSignatoryId") REFERENCES "board_signatories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_resolution_signatories" ADD CONSTRAINT "board_resolution_signatories_signatureImageId_fkey" FOREIGN KEY ("signatureImageId") REFERENCES "stored_images"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
