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

function normalizeZipCode(value: string | null | undefined) {
  return value?.trim().toUpperCase().replace(/\s+/g, "") ?? "";
}

function usableJurisdictionValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.toUpperCase();
  if (normalized === "UNKNOWN" || normalized === "N/A" || normalized === "NA") {
    return null;
  }

  return trimmed;
}

function firstJurisdictionValue(...values: Array<string | null | undefined>) {
  return values.map(usableJurisdictionValue).find(Boolean) ?? null;
}

export const complianceReportingDivisionSchema = z.nativeEnum(ComplianceReportingDivision);

export const complianceReportingFeeRuleInputSchema = z.object({
  ruleId: z.string().trim().optional(),
  division: complianceReportingDivisionSchema,
  city: z.string().trim().max(80).optional().transform((value) => value || undefined),
  county: z.string().trim().max(80).optional().transform((value) => value || undefined),
  state: z.string().trim().max(40).optional().transform((value) => value || undefined),
  zipCode: z.string().trim().max(20).optional().transform((value) => value || undefined),
  feeAmount: z.number().finite().nonnegative(),
  active: z.boolean().default(true)
}).superRefine((value, context) => {
  if (!value.city && !value.zipCode) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter a city and/or ZIP code for this compliance reporting fee rule.",
      path: ["city"]
    });
  }
});

export type ComplianceReportingFeeResolution = {
  division: ComplianceReportingDivision;
  feeAmount: number;
  matched: boolean;
  source: "zip" | "city_state" | "city" | "none";
  ruleId?: string;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  zipCode?: string | null;
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
    normalizedCounty: string;
    normalizedState: string;
    normalizedZipCode: string;
    excludeRuleId?: string;
  }
) {
  return tx.complianceReportingFeeRule.findFirst({
    where: {
      tenantId: input.tenantId,
      division: input.division,
      normalizedCity: input.normalizedCity,
      normalizedCounty: input.normalizedCounty,
      normalizedState: input.normalizedState,
      normalizedZipCode: input.normalizedZipCode,
      active: true,
      ...(input.excludeRuleId ? { id: { not: input.excludeRuleId } } : {})
    },
    select: { id: true }
  });
}

function getComplianceRuleSpecificity(rule: {
  normalizedZipCode: string;
  normalizedCity: string;
  normalizedCounty: string;
  normalizedState: string;
}) {
  return [
    rule.normalizedZipCode ? 8 : 0,
    rule.normalizedCity ? 4 : 0,
    rule.normalizedState ? 2 : 0,
    rule.normalizedCounty ? 1 : 0
  ].reduce((sum, value) => sum + value, 0);
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
      zipCode?: string | null | undefined;
    };
  }
) {
  const normalizedCity = normalizeJurisdictionValue(input.location.city);
  const normalizedCounty = normalizeJurisdictionValue(input.location.county);
  const normalizedState = normalizeJurisdictionValue(input.location.state);
  const normalizedZipCode = normalizeZipCode(input.location.zipCode);

  if (!normalizedCity && !normalizedZipCode) {
    return {
      division: input.division,
      feeAmount: 0,
      matched: false,
      source: "none"
    } satisfies ComplianceReportingFeeResolution;
  }

  const rules = await tx.complianceReportingFeeRule.findMany({
    where: {
      tenantId: input.tenantId,
      division: input.division,
      active: true,
      OR: [
        ...(normalizedZipCode ? [{ normalizedZipCode }] : []),
        ...(normalizedCity ? [{ normalizedCity }] : [])
      ]
    },
    orderBy: [
      { normalizedZipCode: "desc" },
      { normalizedState: "desc" },
      { normalizedCounty: "desc" },
      { normalizedCity: "desc" },
      { updatedAt: "desc" }
    ],
    select: {
      id: true,
      city: true,
      county: true,
      state: true,
      zipCode: true,
      normalizedCity: true,
      normalizedCounty: true,
      normalizedState: true,
      normalizedZipCode: true,
      feeAmount: true
    }
  });

  const rule = [...rules].sort((left, right) => getComplianceRuleSpecificity(right) - getComplianceRuleSpecificity(left)).find((candidate) => {
    if (candidate.normalizedZipCode && candidate.normalizedZipCode !== normalizedZipCode) {
      return false;
    }
    if (candidate.normalizedCity && candidate.normalizedCity !== normalizedCity) {
      return false;
    }
    if (candidate.normalizedCounty && candidate.normalizedCounty !== normalizedCounty) {
      return false;
    }
    if (candidate.normalizedState && candidate.normalizedState !== normalizedState) {
      return false;
    }
    return true;
  });

  if (!rule) {
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
    source: rule.normalizedZipCode ? "zip" : rule.normalizedState ? "city_state" : "city",
    ruleId: rule.id,
    city: rule.city,
    county: rule.county,
    state: rule.state,
    zipCode: rule.zipCode
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
      state: true,
      postalCode: true,
      customerCompany: {
        select: {
          serviceCity: true,
          serviceState: true,
          servicePostalCode: true,
          billingCity: true,
          billingState: true,
          billingPostalCode: true
        }
      }
    }
  });

  if (!site) {
    throw new Error("Site not found for compliance reporting fee resolution.");
  }

  return resolveComplianceReportingFeeTx(tx, {
    tenantId: input.tenantId,
    division,
    location: {
      city: firstJurisdictionValue(site.city, site.customerCompany.serviceCity, site.customerCompany.billingCity),
      state: firstJurisdictionValue(site.state, site.customerCompany.serviceState, site.customerCompany.billingState),
      zipCode: firstJurisdictionValue(site.postalCode, site.customerCompany.servicePostalCode, site.customerCompany.billingPostalCode)
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
  const normalizedZipCode = normalizeZipCode(parsedInput.zipCode);

  if (parsedInput.active) {
    const duplicate = await findDuplicateActiveRuleTx(prisma, {
      tenantId: parsedActor.tenantId as string,
      division: parsedInput.division,
      normalizedCity,
      normalizedCounty,
      normalizedState,
      normalizedZipCode
    });
    if (duplicate) {
      throw new Error("An active compliance reporting fee already exists for this division and jurisdiction.");
    }
  }

  const rule = await prisma.complianceReportingFeeRule.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      division: parsedInput.division,
      city: parsedInput.city ?? null,
      normalizedCity,
      county: parsedInput.county ?? null,
      normalizedCounty,
      state: parsedInput.state ?? null,
      normalizedState,
      zipCode: parsedInput.zipCode ?? null,
      normalizedZipCode,
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
        zipCode: rule.zipCode,
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
  const normalizedZipCode = normalizeZipCode(parsedInput.zipCode);

  if (parsedInput.active) {
    const duplicate = await findDuplicateActiveRuleTx(prisma, {
      tenantId: parsedActor.tenantId as string,
      division: parsedInput.division,
      normalizedCity,
      normalizedCounty,
      normalizedState,
      normalizedZipCode,
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
      city: parsedInput.city ?? null,
      normalizedCity,
      county: parsedInput.county ?? null,
      normalizedCounty,
      state: parsedInput.state ?? null,
      normalizedState,
      zipCode: parsedInput.zipCode ?? null,
      normalizedZipCode,
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
        zipCode: rule.zipCode,
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
        zipCode: existing.zipCode,
        feeAmount: existing.feeAmount,
        active: existing.active
      }
    }
  });
}
