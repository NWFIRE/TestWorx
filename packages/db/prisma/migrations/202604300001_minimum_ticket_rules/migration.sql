-- CreateEnum
CREATE TYPE "ProviderMinimumTicketRuleMode" AS ENUM ('organization_default', 'provider_specific', 'none');

-- CreateEnum
CREATE TYPE "MinimumTicketRuleType" AS ENUM ('local_service', 'standard_service', 'walk_in');

-- CreateEnum
CREATE TYPE "MinimumTicketRuleAppliesTo" AS ENUM ('inspection', 'service', 'walk_in', 'all');

-- CreateEnum
CREATE TYPE "MinimumTicketRuleLocationMode" AS ENUM ('city', 'service_zone', 'manual');

-- AlterTable
ALTER TABLE "ProviderContractProfile"
ADD COLUMN "minimumTicketRuleMode" "ProviderMinimumTicketRuleMode" NOT NULL DEFAULT 'organization_default';

-- CreateTable
CREATE TABLE "MinimumTicketRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruleType" "MinimumTicketRuleType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "appliesTo" "MinimumTicketRuleAppliesTo" NOT NULL DEFAULT 'all',
    "locationMode" "MinimumTicketRuleLocationMode" NOT NULL DEFAULT 'city',
    "city" TEXT,
    "normalizedCity" TEXT NOT NULL DEFAULT '',
    "state" TEXT,
    "normalizedState" TEXT NOT NULL DEFAULT '',
    "serviceZoneId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveStartDate" TIMESTAMP(3),
    "effectiveEndDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MinimumTicketRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MinimumTicketRule_organizationId_isActive_priority_idx" ON "MinimumTicketRule"("organizationId", "isActive", "priority");

-- CreateIndex
CREATE INDEX "MinimumTicketRule_organizationId_ruleType_idx" ON "MinimumTicketRule"("organizationId", "ruleType");

-- CreateIndex
CREATE INDEX "MinimumTicketRule_organizationId_normalizedCity_normalizedState_idx" ON "MinimumTicketRule"("organizationId", "normalizedCity", "normalizedState");

-- AddForeignKey
ALTER TABLE "MinimumTicketRule" ADD CONSTRAINT "MinimumTicketRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
