import { prisma } from "@testworx/db";
import { ComplianceReportingDivision, Prisma } from "@prisma/client";
import { z } from "zod";

import type { ActorContext, InspectionType } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { assertTenantContext } from "./permissions";

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function ensureTenantAdmin(parsedActor: ReturnType<typeof parseActor>) {
  if (!["tenant_admin", "platform_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can manage compliance reporting fee settings.");
  }
}

function normalizeJurisdictionValue(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

export const complianceReportingDivisionSchema = z.nativeEnum(ComplianceReportingDivision);

export const complianceReportingFeeRuleInputSchema = z.object({
  ruleId: z.string().trim().optional(),
  division: complianceReportingDivisionSchema,
  city: z.string().trim().min(1, "City is required.").max(80),
  county: z.string().trim().max(80).optional().transform((value) => value || undefined),
  state: z.string().trim().max(40).optional().transform((value) => value || undefined),
  feeAmount: z.number().finite().nonnegative(),
  active: z.boolean().default(true)
});

export type ComplianceReportingFeeResolution = {
  division: ComplianceReportingDivision;
  feeAmount: number;
  matched: boolean;
  source: "city" | "none";
  ruleId?: string;
  city?: string;
  county?: string | null;
  state?: string | null;
};

export function mapInspectionTypeToComplianceReportingDivision(inspectionType: InspectionType) {
  switch (inspectionType) {
    case "fire_extinguisher":
      return ComplianceReportingDivision.fire_extinguishers;
    case "fire_alarm":
      return ComplianceReportingDivision.fire_alarm;
    case "wet_fire_sprinkler":
    case "dry_fire_sprinkler":
    case "joint_commission_fire_sprinkler":
      return ComplianceReportingDivision.fire_sprinkler;
    case "kitchen_suppression":
      return ComplianceReportingDivision.kitchen_suppression;
    default:
      return null;
  }
}

function findDuplicateActiveRuleTx(
  tx: Prisma.TransactionClient | typeof prisma,
  input: {
    tenantId: string;
    division: ComplianceReportingDivision;
    normalizedCity: string;
    excludeRuleId?: string;
  }
) {
  return tx.complianceReportingFeeRule.findFirst({
    where: {
      tenantId: input.tenantId,
      division: input.division,
      normalizedCity: input.normalizedCity,
      active: true,
      ...(input.excludeRuleId ? { id: { not: input.excludeRuleId } } : {})
    },
    select: { id: true }
  });
}

export async function resolveComplianceReportingFeeTx(
  tx: Prisma.TransactionClient | typeof prisma,
  input: {
    tenantId: string;
    division: ComplianceReportingDivision;
    location: {
      city: string | null | undefined;
      county?: string | null | undefined;
      state?: string | null | undefined;
    };
  }
) {
  const normalizedCity = normalizeJurisdictionValue(input.location.city);
  const normalizedCounty = normalizeJurisdictionValue(input.location.county);
  const normalizedState = normalizeJurisdictionValue(input.location.state);

  if (!normalizedCity) {
    return {
      division: input.division,
      feeAmount: 0,
      matched: false,
      source: "none"
    } satisfies ComplianceReportingFeeResolution;
  }

  const rule = await tx.complianceReportingFeeRule.findFirst({
    where: {
      tenantId: input.tenantId,
      division: input.division,
      normalizedCity,
      active: true
    },
    orderBy: [
      { normalizedCounty: "desc" },
      { normalizedState: "desc" },
      { updatedAt: "desc" }
    ],
    select: {
      id: true,
      city: true,
      county: true,
      state: true,
      feeAmount: true
    }
  });

  if (!rule) {
    return {
      division: input.division,
      feeAmount: 0,
      matched: false,
      source: "none"
    } satisfies ComplianceReportingFeeResolution;
  }

  if (rule.county && normalizedCounty && normalizeJurisdictionValue(rule.county) !== normalizedCounty) {
    return {
      division: input.division,
      feeAmount: 0,
      matched: false,
      source: "none"
    } satisfies ComplianceReportingFeeResolution;
  }

  if (rule.state && normalizedState && normalizeJurisdictionValue(rule.state) !== normalizedState) {
    return {
      division: input.division,
      feeAmount: 0,
      matched: false,
      source: "none"
    } satisfies ComplianceReportingFeeResolution;
  }

  return {
    division: input.division,
    feeAmount: rule.feeAmount,
    matched: true,
    source: "city",
    ruleId: rule.id,
    city: rule.city,
    county: rule.county,
    state: rule.state
  } satisfies ComplianceReportingFeeResolution;
}

export async function resolveInspectionComplianceReportingFeeTx(
  tx: Prisma.TransactionClient | typeof prisma,
  input: {
    tenantId: string;
    inspectionType: InspectionType;
    siteId: string;
  }
) {
  const division = mapInspectionTypeToComplianceReportingDivision(input.inspectionType);
  if (!division) {
    return null;
  }

  const site = await tx.site.findFirst({
    where: {
      id: input.siteId,
      tenantId: input.tenantId
    },
    select: {
      city: true,
      state: true
    }
  });

  if (!site) {
    throw new Error("Site not found for compliance reporting fee resolution.");
  }

  return resolveComplianceReportingFeeTx(tx, {
    tenantId: input.tenantId,
    division,
    location: {
      city: site.city,
      state: site.state
    }
  });
}

export async function getPaginatedTenantComplianceReportingFeeSettings(
  actor: ActorContext,
  input?: {
    page?: number;
    limit?: number;
  }
) {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);

  const tenantId = parsedActor.tenantId as string;
  const page = Math.max(input?.page ?? 1, 1);
  const limit = Math.min(Math.max(input?.limit ?? 10, 1), 100);

  const totalCount = await prisma.complianceReportingFeeRule.count({
    where: { tenantId }
  });
  const totalPages = Math.max(Math.ceil(totalCount / limit), 1);
  const safePage = Math.min(page, totalPages);

  const rules = await prisma.complianceReportingFeeRule.findMany({
    where: { tenantId },
    orderBy: [{ active: "desc" }, { division: "asc" }, { city: "asc" }, { updatedAt: "desc" }],
    skip: (safePage - 1) * limit,
    take: limit
  });

  return {
    rules,
    pagination: {
      page: safePage,
      limit,
      totalCount,
      totalPages
    }
  };
}

export async function createComplianceReportingFeeRule(
  actor: ActorContext,
  input: z.infer<typeof complianceReportingFeeRuleInputSchema>
) {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);
  const parsedInput = complianceReportingFeeRuleInputSchema.parse(input);

  const normalizedCity = normalizeJurisdictionValue(parsedInput.city);
  const normalizedCounty = normalizeJurisdictionValue(parsedInput.county);
  const normalizedState = normalizeJurisdictionValue(parsedInput.state);

  if (parsedInput.active) {
    const duplicate = await findDuplicateActiveRuleTx(prisma, {
      tenantId: parsedActor.tenantId as string,
      division: parsedInput.division,
      normalizedCity
    });
    if (duplicate) {
      throw new Error("An active compliance reporting fee already exists for this division and jurisdiction.");
    }
  }

  const rule = await prisma.complianceReportingFeeRule.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      division: parsedInput.division,
      city: parsedInput.city.trim(),
      normalizedCity,
      county: parsedInput.county ?? null,
      normalizedCounty,
      state: parsedInput.state ?? null,
      normalizedState,
      feeAmount: parsedInput.feeAmount,
      active: parsedInput.active
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "billing.compliance_reporting_fee_rule_created",
      entityType: "ComplianceReportingFeeRule",
      entityId: rule.id,
      metadata: {
        division: rule.division,
        city: rule.city,
        county: rule.county,
        state: rule.state,
        feeAmount: rule.feeAmount,
        active: rule.active
      }
    }
  });

  return rule;
}

export async function updateComplianceReportingFeeRule(
  actor: ActorContext,
  input: z.infer<typeof complianceReportingFeeRuleInputSchema>
) {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);
  const parsedInput = complianceReportingFeeRuleInputSchema.parse(input);

  if (!parsedInput.ruleId) {
    throw new Error("A rule id is required to update a compliance reporting fee rule.");
  }

  const existing = await prisma.complianceReportingFeeRule.findFirst({
    where: {
      id: parsedInput.ruleId,
      tenantId: parsedActor.tenantId as string
    }
  });
  if (!existing) {
    throw new Error("Compliance reporting fee rule not found.");
  }

  const normalizedCity = normalizeJurisdictionValue(parsedInput.city);
  const normalizedCounty = normalizeJurisdictionValue(parsedInput.county);
  const normalizedState = normalizeJurisdictionValue(parsedInput.state);

  if (parsedInput.active) {
    const duplicate = await findDuplicateActiveRuleTx(prisma, {
      tenantId: parsedActor.tenantId as string,
      division: parsedInput.division,
      normalizedCity,
      excludeRuleId: parsedInput.ruleId
    });
    if (duplicate) {
      throw new Error("An active compliance reporting fee already exists for this division and jurisdiction.");
    }
  }

  const rule = await prisma.complianceReportingFeeRule.update({
    where: { id: parsedInput.ruleId },
    data: {
      division: parsedInput.division,
      city: parsedInput.city.trim(),
      normalizedCity,
      county: parsedInput.county ?? null,
      normalizedCounty,
      state: parsedInput.state ?? null,
      normalizedState,
      feeAmount: parsedInput.feeAmount,
      active: parsedInput.active
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "billing.compliance_reporting_fee_rule_updated",
      entityType: "ComplianceReportingFeeRule",
      entityId: rule.id,
      metadata: {
        division: rule.division,
        city: rule.city,
        county: rule.county,
        state: rule.state,
        feeAmount: rule.feeAmount,
        active: rule.active
      }
    }
  });

  return rule;
}

export async function deleteComplianceReportingFeeRule(actor: ActorContext, ruleId: string) {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);

  const existing = await prisma.complianceReportingFeeRule.findFirst({
    where: {
      id: ruleId,
      tenantId: parsedActor.tenantId as string
    }
  });
  if (!existing) {
    throw new Error("Compliance reporting fee rule not found.");
  }

  await prisma.complianceReportingFeeRule.delete({
    where: { id: ruleId }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "billing.compliance_reporting_fee_rule_deleted",
      entityType: "ComplianceReportingFeeRule",
      entityId: existing.id,
      metadata: {
        division: existing.division,
        city: existing.city,
        county: existing.county,
        state: existing.state,
        feeAmount: existing.feeAmount,
        active: existing.active
      }
    }
  });
}
