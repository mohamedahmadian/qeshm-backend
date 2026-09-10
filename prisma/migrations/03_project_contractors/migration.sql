-- CreateTable
CREATE TABLE "project_contractors" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nationalId" TEXT,
    "description" TEXT,
    "ceoName" TEXT,
    "timeEstimate" TEXT,
    "costEstimate" DECIMAL(18,0),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_contractors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_contractor_members" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_contractor_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_contractor_phases" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "goals" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_contractor_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_contractor_payments" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "paidAt" DATE NOT NULL,
    "amount" DECIMAL(18,0) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_contractor_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_contractors_projectId_name_idx" ON "project_contractors"("projectId", "name");

-- CreateIndex
CREATE INDEX "project_contractors_nationalId_idx" ON "project_contractors"("nationalId");

-- CreateIndex
CREATE INDEX "project_contractors_createdAt_idx" ON "project_contractors"("createdAt");

-- CreateIndex
CREATE INDEX "project_contractor_members_contractorId_idx" ON "project_contractor_members"("contractorId");

-- CreateIndex
CREATE INDEX "project_contractor_members_lastName_firstName_idx" ON "project_contractor_members"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "project_contractor_phases_contractorId_startDate_idx" ON "project_contractor_phases"("contractorId", "startDate");

-- CreateIndex
CREATE INDEX "project_contractor_payments_contractorId_paidAt_idx" ON "project_contractor_payments"("contractorId", "paidAt");

-- AddForeignKey
ALTER TABLE "project_contractors" ADD CONSTRAINT "project_contractors_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_contractor_members" ADD CONSTRAINT "project_contractor_members_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "project_contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_contractor_phases" ADD CONSTRAINT "project_contractor_phases_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "project_contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_contractor_payments" ADD CONSTRAINT "project_contractor_payments_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "project_contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
