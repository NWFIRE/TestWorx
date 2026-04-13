import { prisma } from "@testworx/db";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { assertTenantContext } from "./permissions";

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function ensureTenantAdmin(parsedActor: ReturnType<typeof parseActor>) {
  if (!["tenant_admin", "platform_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can manage service fee settings.");
  }
}

function normalizeText(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

function normalizeZip(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export const updateDefaultServiceFeeSchema = z.object({
  defaultServiceFeeCode: z.string().trim().max(80).default("SERVICE_FEE"),
  defaultServiceFeeUnitPrice: z.number().finite().nonnegative().nullable()
});

export const serviceFeeRuleInputSchema = z.object({
  ruleId: z.string().trim().optional(),
  customerCompanyId: z.string().trim().optional().transform((value) => value || undefined),
  siteId: z.string().trim().optional().transform((value) => value || undefined),
  city: z.string().trim().max(80).optional().transform((value) => value || undefined),
  state: z.string().trim().max(40).optional().transform((value) => value || undefined),
  zipCode: z.string().trim().max(20).optional().transform((value) => value || undefined),
  feeCode: z.string().trim().max(80).default("SERVICE_FEE"),
  unitPrice: z.number().finite().nonnegative(),
  priority: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true)
});

type ServiceFeeMatchContext = {
  tenantId: string;
  customerCompanyId: string | null;
  siteId: string | null;
  city: string;
  state: string;
  postalCode: string;
};

export type ResolvedInspectionServiceFee = {
  code: string;
  unitPrice: number | null;
  source: "site_override" | "customer_override" | "zip_rule" | "city_state_rule" | "default";
  ruleId?: string;
  priority?: number;
};

function scoreRule(rule: {
  siteId: string | null;
  customerCompanyId: string | null;
  zipCode: string | null;
  city: string | null;
  state: string | null;
  priority: number;
}) {
  let specificity = 0;

  if (rule.siteId) {
    specificity += 500;
  }
  if (rule.customerCompanyId) {
    specificity += 400;
  }
  if (rule.zipCode) {
    specificity += 300;
  }
  if (rule.city && rule.state) {
    specificity += 200;
  } else if (rule.city || rule.state) {
    specificity += 100;
  }

  return specificity * 1000 + (rule.priority ?? 0);
}

function getRuleSource(rule: {
  siteId: string | null;
  customerCompanyId: string | null;
  zipCode: string | null;
}) {
  if (rule.siteId) {
    return "site_override" as const;
  }
  if (rule.customerCompanyId) {
    return "customer_override" as const;
  }
  if (rule.zipCode) {
    return "zip_rule" as const;
  }
  return "city_state_rule" as const;
}

async function getInspectionServiceFeeMatchContextTx(tx: Prisma.TransactionClient | typeof prisma, input: {
  tenantId: string;
  inspectionId: string;
}) {
  const inspection = await tx.inspection.findFirst({
    where: { id: input.inspectionId, tenantId: input.tenantId },
    select: {
      id: true,
      customerCompanyId: true,
      siteId: true,
      site: {
        select: {
          city: true,
          state: true,
          postalCode: true
        }
      }
    }
  });

  if (!inspection) {
    throw new Error("Inspection not found for service fee resolution.");
  }

  return {
    tenantId: input.tenantId,
    customerCompanyId: inspection.customerCompanyId,
    siteId: inspection.siteId,
    city: normalizeText(inspection.site.city),
    state: normalizeText(inspection.site.state),
    postalCode: normalizeZip(inspection.site.postalCode)
  } satisfies ServiceFeeMatchContext;
}

async function resolveServiceFeeForMatchContextTx(
  tx: Prisma.TransactionClient | typeof prisma,
  context: ServiceFeeMatchContext
) {
  const [tenant, rules] = await Promise.all([
    tx.tenant.findUnique({
      where: { id: context.tenantId },
      select: { defaultServiceFeeCode: true, defaultServiceFeeUnitPrice: true }
    }),
    tx.serviceFeeRule.findMany({
      where: { tenantId: context.tenantId, isActive: true },
      select: {
        id: true,
        customerCompanyId: true,
        siteId: true,
        city: true,
        state: true,
        zipCode: true,
        feeCode: true,
        unitPrice: true,
        priority: true
      }
    })
  ]);

  const matchingRule = rules
    .filter((rule) => !rule.siteId || rule.siteId === context.siteId)
    .filter((rule) => !rule.customerCompanyId || rule.customerCompanyId === context.customerCompanyId)
    .filter((rule) => !rule.zipCode || normalizeZip(rule.zipCode) === context.postalCode)
    .filter((rule) => !rule.city || normalizeText(rule.city) === context.city)
    .filter((rule) => !rule.state || normalizeText(rule.state) === context.state)
    .sort((left, right) => scoreRule(right) - scoreRule(left))[0];

  if (matchingRule) {
    return {
      code: matchingRule.feeCode || tenant?.defaultServiceFeeCode || "SERVICE_FEE",
      unitPrice: matchingRule.unitPrice,
      source: getRuleSource(matchingRule),
      ruleId: matchingRule.id,
      priority: matchingRule.priority
    } satisfies ResolvedInspectionServiceFee;
  }

  return {
    code: tenant?.defaultServiceFeeCode || "SERVICE_FEE",
    unitPrice: tenant?.defaultServiceFeeUnitPrice ?? null,
    source: "default"
  } satisfies ResolvedInspectionServiceFee;
}

export async function resolveInspectionServiceFeeTx(tx: Prisma.TransactionClient | typeof prisma, input: {
  tenantId: string;
  inspectionId: string;
}) {
  const context = await getInspectionServiceFeeMatchContextTx(tx, input);
  return resolveServiceFeeForMatchContextTx(tx, context);
}

export async function resolveServiceFeeForLocationTx(
  tx: Prisma.TransactionClient | typeof prisma,
  input: {
    tenantId: string;
    customerCompanyId?: string | null;
    siteId?: string | null;
    location: {
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
    };
  }
) {
  return resolveServiceFeeForMatchContextTx(tx, {
    tenantId: input.tenantId,
    customerCompanyId: input.customerCompanyId ?? null,
    siteId: input.siteId ?? null,
    city: normalizeText(input.location.city),
    state: normalizeText(input.location.state),
    postalCode: normalizeZip(input.location.postalCode)
  });
}

export async function getTenantServiceFeeSettings(actor: ActorContext) {
  const result = await getPaginatedTenantServiceFeeSettings(actor, { page: 1, limit: 5000 });
  return {
    tenant: result.tenant,
    customers: result.customers,
    sites: result.sites,
    rules: result.rules
  };
}

export async function getPaginatedTenantServiceFeeSettings(
  actor: ActorContext,
  input?: {
    page?: number;
    limit?: number;
    includeLookups?: boolean;
  }
) {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);

  const tenantId = parsedActor.tenantId as string;
  const page = Math.max(input?.page ?? 1, 1);
  const limit = Math.min(Math.max(input?.limit ?? 10, 1), 100);
  const includeLookups = input?.includeLookups ?? true;
  const [tenant, customers, sites, totalCount, rules] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        defaultServiceFeeCode: true,
        defaultServiceFeeUnitPrice: true
      }
    }),
    includeLookups
      ? prisma.customerCompany.findMany({
          where: { tenantId },
          orderBy: { name: "asc" },
          select: { id: true, name: true }
        })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    includeLookups
      ? prisma.site.findMany({
          where: { tenantId },
          orderBy: [{ name: "asc" }],
          select: { id: true, name: true, customerCompanyId: true, customerCompany: { select: { name: true } } }
        })
      : Promise.resolve([] as Array<{ id: string; name: string; customerCompanyId: string; customerCompany: { name: string } }>),
    prisma.serviceFeeRule.count({
      where: { tenantId }
    }),
    prisma.serviceFeeRule.findMany({
      where: { tenantId },
      orderBy: [{ isActive: "desc" }, { priority: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        customerCompanyId: true,
        siteId: true,
        city: true,
        state: true,
        zipCode: true,
        feeCode: true,
        unitPrice: true,
        priority: true,
        isActive: true,
        customerCompany: { select: { name: true } },
        site: { select: { name: true } }
      }
    })
  ]);

  if (!tenant) {
    throw new Error("Tenant not found.");
  }

  const totalPages = Math.max(Math.ceil(totalCount / limit), 1);
  const safePage = Math.min(page, totalPages);
  const pagedRules = safePage === page
    ? rules
    : await prisma.serviceFeeRule.findMany({
        where: { tenantId },
        orderBy: [{ isActive: "desc" }, { priority: "desc" }, { updatedAt: "desc" }],
        skip: (safePage - 1) * limit,
        take: limit,
        select: {
          id: true,
          customerCompanyId: true,
          siteId: true,
          city: true,
          state: true,
          zipCode: true,
          feeCode: true,
          unitPrice: true,
          priority: true,
          isActive: true,
          customerCompany: { select: { name: true } },
          site: { select: { name: true } }
        }
      });

  return {
    tenant,
    customers,
    sites,
    rules: pagedRules,
    pagination: {
      page: safePage,
      limit,
      totalCount,
      totalPages
    }
  };
}

export async function updateTenantDefaultServiceFee(actor: ActorContext, input: z.infer<typeof updateDefaultServiceFeeSchema>) {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);

  const parsedInput = updateDefaultServiceFeeSchema.parse(input);
  const tenant = await prisma.tenant.update({
    where: { id: parsedActor.tenantId as string },
    data: {
      defaultServiceFeeCode: parsedInput.defaultServiceFeeCode || "SERVICE_FEE",
      defaultServiceFeeUnitPrice: parsedInput.defaultServiceFeeUnitPrice
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      actorUserId: parsedActor.userId,
      action: "billing.service_fee_default_updated",
      entityType: "Tenant",
      entityId: tenant.id,
      metadata: {
        defaultServiceFeeCode: tenant.defaultServiceFeeCode,
        defaultServiceFeeUnitPrice: tenant.defaultServiceFeeUnitPrice
      }
    }
  });

  return tenant;
}

export async function createServiceFeeRule(actor: ActorContext, input: z.infer<typeof serviceFeeRuleInputSchema>) {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);

  const parsedInput = serviceFeeRuleInputSchema.parse(input);
  const rule = await prisma.serviceFeeRule.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      customerCompanyId: parsedInput.customerCompanyId ?? null,
      siteId: parsedInput.siteId ?? null,
      city: parsedInput.city ?? null,
      state: parsedInput.state ?? null,
      zipCode: parsedInput.zipCode ?? null,
      feeCode: parsedInput.feeCode || "SERVICE_FEE",
      unitPrice: parsedInput.unitPrice,
      priority: parsedInput.priority,
      isActive: parsedInput.isActive
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "billing.service_fee_rule_created",
      entityType: "ServiceFeeRule",
      entityId: rule.id,
      metadata: {
        customerCompanyId: rule.customerCompanyId,
        siteId: rule.siteId,
        city: rule.city,
        state: rule.state,
        zipCode: rule.zipCode,
        feeCode: rule.feeCode,
        unitPrice: rule.unitPrice,
        priority: rule.priority,
        isActive: rule.isActive
      }
    }
  });

  return rule;
}

export async function updateServiceFeeRule(actor: ActorContext, input: z.infer<typeof serviceFeeRuleInputSchema>) {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);

  const parsedInput = serviceFeeRuleInputSchema.parse(input);
  if (!parsedInput.ruleId) {
    throw new Error("A rule id is required to update a service fee rule.");
  }

  const existing = await prisma.serviceFeeRule.findFirst({
    where: { id: parsedInput.ruleId, tenantId: parsedActor.tenantId as string }
  });
  if (!existing) {
    throw new Error("Service fee rule not found.");
  }

  const rule = await prisma.serviceFeeRule.update({
    where: { id: parsedInput.ruleId },
    data: {
      customerCompanyId: parsedInput.customerCompanyId ?? null,
      siteId: parsedInput.siteId ?? null,
      city: parsedInput.city ?? null,
      state: parsedInput.state ?? null,
      zipCode: parsedInput.zipCode ?? null,
      feeCode: parsedInput.feeCode || "SERVICE_FEE",
      unitPrice: parsedInput.unitPrice,
      priority: parsedInput.priority,
      isActive: parsedInput.isActive
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "billing.service_fee_rule_updated",
      entityType: "ServiceFeeRule",
      entityId: rule.id,
      metadata: {
        customerCompanyId: rule.customerCompanyId,
        siteId: rule.siteId,
        city: rule.city,
        state: rule.state,
        zipCode: rule.zipCode,
        feeCode: rule.feeCode,
        unitPrice: rule.unitPrice,
        priority: rule.priority,
        isActive: rule.isActive
      }
    }
  });

  return rule;
}

export async function deleteServiceFeeRule(actor: ActorContext, ruleId: string) {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);

  const rule = await prisma.serviceFeeRule.findFirst({
    where: { id: ruleId, tenantId: parsedActor.tenantId as string }
  });
  if (!rule) {
    throw new Error("Service fee rule not found.");
  }

  await prisma.serviceFeeRule.delete({
    where: { id: rule.id }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "billing.service_fee_rule_deleted",
      entityType: "ServiceFeeRule",
      entityId: rule.id,
      metadata: {
        customerCompanyId: rule.customerCompanyId,
        siteId: rule.siteId,
        city: rule.city,
        state: rule.state,
        zipCode: rule.zipCode,
        feeCode: rule.feeCode,
        unitPrice: rule.unitPrice,
        priority: rule.priority
      }
    }
  });
}
