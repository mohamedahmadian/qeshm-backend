-- CreateTable
CREATE TABLE "board_signatories" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "signatureImageId" TEXT NOT NULL,
    "userId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_signatories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "board_signatories_userId_key" ON "board_signatories"("userId");

-- CreateIndex
CREATE INDEX "board_signatories_lastName_firstName_idx" ON "board_signatories"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "board_signatories_sortOrder_idx" ON "board_signatories"("sortOrder");

-- CreateIndex
CREATE INDEX "board_signatories_createdAt_idx" ON "board_signatories"("createdAt");

-- AddForeignKey
ALTER TABLE "board_signatories" ADD CONSTRAINT "board_signatories_signatureImageId_fkey" FOREIGN KEY ("signatureImageId") REFERENCES "stored_images"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_signatories" ADD CONSTRAINT "board_signatories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
