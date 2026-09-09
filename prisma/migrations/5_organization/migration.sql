-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "singletonKey" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "eitaa" TEXT,
    "bale" TEXT,
    "rubika" TEXT,
    "instagram" TEXT,
    "telegram" TEXT,
    "whatsapp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_phones" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_phones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_singletonKey_key" ON "organizations"("singletonKey");

-- CreateIndex
CREATE INDEX "organization_phones_organizationId_idx" ON "organization_phones"("organizationId");

-- CreateIndex
CREATE INDEX "organization_phones_title_idx" ON "organization_phones"("title");

-- CreateIndex
CREATE INDEX "organization_phones_phone_idx" ON "organization_phones"("phone");

-- CreateIndex
CREATE INDEX "organization_phones_createdAt_idx" ON "organization_phones"("createdAt");

-- AddForeignKey
ALTER TABLE "organization_phones" ADD CONSTRAINT "organization_phones_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
