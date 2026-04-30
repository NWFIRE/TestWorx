import { prisma } from "@testworx/db";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { assertTenantContext } from "./permissions";

type MinimumTicketRuleType = "local_service" | "standard_service" | "walk_in";
type MinimumTicketRuleAppliesTo = "inspection" | "service" | "walk_in" | "all";
type MinimumTicketRuleLocationMode = "city" | "service_zone" | "manual";
type ProviderMinimumTicketRuleMode = "organization_default" | "provider_specific" | "none";

type MinimumTicketRuleRecord = {
  id: string | null;
  name: string;
  ruleType: MinimumTicketRuleType;
  amount: number;
  currency: string;
  appliesTo: MinimumTicketRuleAppliesTo;
  locationMode: MinimumTicketRuleLocationMode;
  city: string | null;
  state: string | null;
  priority: number;
  source: "database" | "default";
};

export type MinimumTicketServiceContext = "field_service" | "inspection" | "service" | "walk_in" | "emergency" | "repair";

export type MinimumTicketResolution = {
  applies: boolean;
  rule: MinimumTicketRuleRecord | null;
  minimumAmount: number;
  subtotalBeforeMinimum: number;
  adjustmentAmount: number;
  reason: string;
  serviceContext: MinimumTicketServiceContext;
  location: {
    city: string | null;
    state: string | null;
    postalCode: string | null;
  };
  providerMode: ProviderMinimumTicketRuleMode | null;
};

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function ensureTenantAdmin(parsedActor: ReturnType<typeof parseActor>) {
  if (!["tenant_admin", "platform_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can manage minimum ticket pricing.");
  }
}

function normalizeLocationText(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

function normalizeDisplayText(value: string | null | undefined) {
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

function firstUsableLocationValue(...values: Array<string | null | undefined>) {
  return values.map(normalizeDisplayText).find(Boolean) ?? null;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function isMissingMinimumTicketRuleStorageError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (code === "P2021" || code === "P2022") {
    return message.includes("MinimumTicketRule") || message.includes("minimumTicketRule");
  }

  return message.includes("MinimumTicketRule")
    && (message.includes("does not exist") || message.includes("current database"));
}

const DEFAULT_MINIMUM_RULES: MinimumTicketRuleRecord[] = [
  {
    id: null,
    name: "Walk-In Minimum",
    ruleType: "walk_in",
    amount: 25,
    currency: "USD",
    appliesTo: "walk_in",
    locationMode: "manual",
    city: null,
    state: null,
    priority: 100,
    source: "default"
  },
  {
    id: null,
    name: "Enid Local Minimum",
    ruleType: "local_service",
    amount: 59,
    currency: "USD",
    appliesTo: "all",
    locationMode: "city",
    city: "Enid",
    state: "OK",
    priority: 50,
    source: "default"
  },
  {
    id: null,
    name: "Standard Service Minimum",
    ruleType: "standard_service",
    amount: 79,
    currency: "USD",
    appliesTo: "all",
    locationMode: "manual",
    city: null,
    state: null,
    priority: 0,
    source: "default"
  }
];

function defaultMinimumTicketSettingsRules() {
  return DEFAULT_MINIMUM_RULES.map((rule) => ({
    id: "",
    name: rule.name,
    ruleType: rule.ruleType,
    amount: rule.amount,
    currency: rule.currency,
    appliesTo: rule.appliesTo,
    locationMode: rule.locationMode,
    city: rule.city,
    state: rule.state,
    priority: rule.priority,
    isActive: true
  }));
}

export const minimumTicketRuleInputSchema = z.object({
  ruleId: z.string().trim().optional(),
  name: z.string().trim().min(1).max(120),
  ruleType: z.enum(["local_service", "standard_service", "walk_in"]),
  amount: z.number().finite().nonnegative(),
  currency: z.string().trim().min(3).max(3).default("USD"),
  appliesTo: z.enum(["inspection", "service", "walk_in", "all"]).default("all"),
  locationMode: z.enum(["city", "service_zone", "manual"]).default("city"),
  city: z.string().trim().max(80).optional().transform((value) => value || undefined),
  state: z.string().trim().max(40).optional().transform((value) => value || undefined),
  priority: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true)
}).superRefine((value, context) => {
  if (value.ruleType === "local_service" && value.locationMode === "city" && !value.city) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter a city for local minimum rules.",
      path: ["city"]
    });
  }
});

function appliesToServiceContext(rule: Pick<MinimumTicketRuleRecord, "appliesTo">, serviceContext: MinimumTicketServiceContext) {
  if (rule.appliesTo === "all") {
    return true;
  }
  if (rule.appliesTo === "walk_in") {
    return serviceContext === "walk_in";
  }
  if (rule.appliesTo === "inspection") {
    return serviceContext === "inspection" || serviceContext === "field_service";
  }
  return serviceContext === "repair" || serviceContext === "emergency" || serviceContext === "field_service";
}

function ruleMatchesLocation(
  rule: MinimumTicketRuleRecord,
  location: { city: string | null; state: string | null }
) {
  if (rule.locationMode !== "city") {
    return true;
  }

  const expectedCity = normalizeLocationText(rule.city);
  const expectedState = normalizeLocationText(rule.state);
  const actualCity = normalizeLocationText(location.city);
  const actualState = normalizeLocationText(location.state);

  if (expectedCity && expectedCity !== actualCity) {
    return false;
  }

  if (expectedState && expectedState !== actualState) {
    return false;
  }

  return true;
}

function scoreMinimumRule(rule: MinimumTicketRuleRecord) {
  let score = rule.priority;
  if (rule.ruleType === "walk_in") {
    score += 1000;
  }
  if (rule.ruleType === "local_service") {
    score += 500;
  }
  if (rule.locationMode === "city") {
    score += 100;
  }
  if (rule.city) {
    score += 50;
  }
  if (rule.state) {
    score += 25;
  }
  return score;
}

export function selectMinimumTicketRule(input: {
  rules: MinimumTicketRuleRecord[];
  serviceContext: MinimumTicketServiceContext;
  location: {
    city: string | null;
    state: string | null;
    postalCode?: string | null;
  };
}) {
  if (input.serviceContext === "walk_in") {
    return input.rules
      .filter((rule) => rule.ruleType === "walk_in")
      .filter((rule) => appliesToServiceContext(rule, input.serviceContext))
      .sort((left, right) => scoreMinimumRule(right) - scoreMinimumRule(left))[0] ?? null;
  }

  const localRule = input.rules
    .filter((rule) => rule.ruleType === "local_service")
    .filter((rule) => appliesToServiceContext(rule, input.serviceContext))
    .filter((rule) => ruleMatchesLocation(rule, input.location))
    .sort((left, right) => scoreMinimumRule(right) - scoreMinimumRule(left))[0];

  if (localRule) {
    return localRule;
  }

  return input.rules
    .filter((rule) => rule.ruleType === "standard_service")
    .filter((rule) => appliesToServiceContext(rule, input.serviceContext))
    .sort((left, right) => scoreMinimumRule(right) - scoreMinimumRule(left))[0] ?? null;
}

export function buildMinimumTicketResolution(input: {
  rule: MinimumTicketRuleRecord | null;
  subtotalBeforeMinimum: number;
  serviceContext: MinimumTicketServiceContext;
  location: {
    city: string | null;
    state: string | null;
    postalCode: string | null;
  };
  providerMode?: ProviderMinimumTicketRuleMode | null;
}): MinimumTicketResolution {
  if (!input.rule || input.subtotalBeforeMinimum <= 0) {
    return {
      applies: false,
      rule: input.rule,
      minimumAmount: input.rule?.amount ?? 0,
      subtotalBeforeMinimum: roundMoney(input.subtotalBeforeMinimum),
      adjustmentAmount: 0,
      reason: input.rule
        ? "Minimum ticket pricing was available, but this ticket has no billable subtotal."
        : "No minimum ticket rule matched this ticket.",
      serviceContext: input.serviceContext,
      location: input.location,
      providerMode: input.providerMode ?? null
    };
  }

  const subtotal = roundMoney(input.subtotalBeforeMinimum);
  const minimumAmount = roundMoney(input.rule.amount);
  const adjustmentAmount = subtotal < minimumAmount ? roundMoney(minimumAmount - subtotal) : 0;

  return {
    applies: adjustmentAmount > 0,
    rule: input.rule,
    minimumAmount,
    subtotalBeforeMinimum: subtotal,
    adjustmentAmount,
    reason: adjustmentAmount > 0
      ? `${input.rule.name} applies because the ticket subtotal is below the configured minimum.`
      : `${input.rule.name} was checked; ticket subtotal meets or exceeds the configured minimum.`,
    serviceContext: input.serviceContext,
    location: input.location,
    providerMode: input.providerMode ?? null
  };
}

function mapDatabaseRule(rule: {
  id: string;
  name: string;
  ruleType: MinimumTicketRuleType;
  amount: number;
  currency: string;
  appliesTo: MinimumTicketRuleAppliesTo;
  locationMode: MinimumTicketRuleLocationMode;
  city: string | null;
  state: string | null;
  priority: number;
}): MinimumTicketRuleRecord {
  return {
    ...rule,
    source: "database"
  };
}

async function getMinimumTicketLocationTx(
  tx: Prisma.TransactionClient | typeof prisma,
  input: {
    tenantId: string;
    siteId: string | null;
    customerCompanyId: string | null;
  }
) {
  const [site, customerCompany] = await Promise.all([
    input.siteId
      ? tx.site.findFirst({
          where: { id: input.siteId, tenantId: input.tenantId },
          select: {
            city: true,
            state: true,
            postalCode: true
          }
        })
      : Promise.resolve(null),
    input.customerCompanyId
      ? tx.customerCompany.findFirst({
          where: { id: input.customerCompanyId, tenantId: input.tenantId },
          select: {
            serviceCity: true,
            serviceState: true,
            servicePostalCode: true,
            billingCity: true,
            billingState: true,
            billingPostalCode: true
          }
        })
      : Promise.resolve(null)
  ]);

  return {
    city: firstUsableLocationValue(site?.city, customerCompany?.serviceCity, customerCompany?.billingCity),
    state: firstUsableLocationValue(site?.state, customerCompany?.serviceState, customerCompany?.billingState),
    postalCode: firstUsableLocationValue(site?.postalCode, customerCompany?.servicePostalCode, customerCompany?.billingPostalCode)
  };
}

export async function resolveMinimumTicketRuleTx(
  tx: Prisma.TransactionClient | typeof prisma,
  input: {
    tenantId: string;
    customerCompanyId: string | null;
    siteId: string | null;
    serviceContext: MinimumTicketServiceContext;
    subtotalBeforeMinimum: number;
    billingType?: "standard" | "third_party";
    providerMinimumTicketRuleMode?: ProviderMinimumTicketRuleMode | null;
  }
) {
  const providerMode = input.providerMinimumTicketRuleMode ?? null;
  if (input.billingType === "third_party" && providerMode === "none") {
    const location = await getMinimumTicketLocationTx(tx, input);
    return buildMinimumTicketResolution({
      rule: null,
      subtotalBeforeMinimum: input.subtotalBeforeMinimum,
      serviceContext: input.serviceContext,
      location,
      providerMode
    });
  }

  const location = await getMinimumTicketLocationTx(tx, input);
  const now = new Date();
  let databaseRules: Array<Parameters<typeof mapDatabaseRule>[0]> = [];
  try {
    databaseRules = await tx.minimumTicketRule.findMany({
      where: {
        organizationId: input.tenantId,
        isActive: true,
        OR: [
          { effectiveStartDate: null },
          { effectiveStartDate: { lte: now } }
        ],
        AND: [
          {
            OR: [
              { effectiveEndDate: null },
              { effectiveEndDate: { gte: now } }
            ]
          }
        ]
      },
      select: {
        id: true,
        name: true,
        ruleType: true,
        amount: true,
        currency: true,
        appliesTo: true,
        locationMode: true,
        city: true,
        state: true,
        priority: true
      }
    });
  } catch (error) {
    if (!isMissingMinimumTicketRuleStorageError(error)) {
      throw error;
    }
  }

  const rules = databaseRules.length > 0
    ? databaseRules.map(mapDatabaseRule)
    : DEFAULT_MINIMUM_RULES;
  const rule = selectMinimumTicketRule({
    rules,
    serviceContext: input.serviceContext,
    location
  });

  return buildMinimumTicketResolution({
    rule,
    subtotalBeforeMinimum: input.subtotalBeforeMinimum,
    serviceContext: input.serviceContext,
    location,
    providerMode
  });
}

export async function getTenantMinimumTicketPricingSettings(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);
  const tenantId = parsedActor.tenantId as string;

  let rules: Array<{
    id: string;
    name: string;
    ruleType: MinimumTicketRuleType;
    amount: number;
    currency: string;
    appliesTo: MinimumTicketRuleAppliesTo;
    locationMode: MinimumTicketRuleLocationMode;
    city: string | null;
    state: string | null;
    priority: number;
    isActive: boolean;
  }> = [];
  let storageReady = true;

  try {
    rules = await prisma.minimumTicketRule.findMany({
      where: { organizationId: tenantId },
      orderBy: [
        { isActive: "desc" },
        { ruleType: "asc" },
        { priority: "desc" },
        { updatedAt: "desc" }
      ],
      select: {
        id: true,
        name: true,
        ruleType: true,
        amount: true,
        currency: true,
        appliesTo: true,
        locationMode: true,
        city: true,
        state: true,
        priority: true,
        isActive: true
      }
    });
  } catch (error) {
    if (!isMissingMinimumTicketRuleStorageError(error)) {
      throw error;
    }
    storageReady = false;
  }

  return {
    rules: rules.length > 0 ? rules : defaultMinimumTicketSettingsRules(),
    storageReady
  };
}

export async function upsertMinimumTicketRule(actor: ActorContext, input: z.infer<typeof minimumTicketRuleInputSchema>) {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);
  const tenantId = parsedActor.tenantId as string;
  const parsedInput = minimumTicketRuleInputSchema.parse(input);
  const normalizedCity = normalizeLocationText(parsedInput.city);
  const normalizedState = normalizeLocationText(parsedInput.state);
  const data = {
    organizationId: tenantId,
    name: parsedInput.name,
    ruleType: parsedInput.ruleType,
    amount: parsedInput.amount,
    currency: parsedInput.currency.toUpperCase(),
    appliesTo: parsedInput.appliesTo,
    locationMode: parsedInput.locationMode,
    city: parsedInput.city ?? null,
    normalizedCity,
    state: parsedInput.state ?? null,
    normalizedState,
    priority: parsedInput.priority,
    isActive: parsedInput.isActive
  };

  const existing = parsedInput.ruleId
    ? await prisma.minimumTicketRule.findFirst({
        where: { id: parsedInput.ruleId, organizationId: tenantId },
        select: { id: true }
      })
    : await prisma.minimumTicketRule.findFirst({
        where: {
          organizationId: tenantId,
          ruleType: parsedInput.ruleType,
          name: parsedInput.name
        },
        select: { id: true }
      });

  const rule = existing
    ? await prisma.minimumTicketRule.update({
        where: { id: existing.id },
        data
      })
    : await prisma.minimumTicketRule.create({ data });

  await prisma.auditLog.create({
    data: {
      tenantId,
      actorUserId: parsedActor.userId,
      action: existing ? "billing.minimum_ticket_rule_updated" : "billing.minimum_ticket_rule_created",
      entityType: "MinimumTicketRule",
      entityId: rule.id,
      metadata: data
    }
  });

  return rule;
}

export async function deleteMinimumTicketRule(actor: ActorContext, ruleId: string) {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);
  const tenantId = parsedActor.tenantId as string;
  const existing = await prisma.minimumTicketRule.findFirst({
    where: { id: ruleId, organizationId: tenantId }
  });

  if (!existing) {
    throw new Error("Minimum ticket rule not found.");
  }

  await prisma.minimumTicketRule.delete({ where: { id: ruleId } });
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorUserId: parsedActor.userId,
      action: "billing.minimum_ticket_rule_deleted",
      entityType: "MinimumTicketRule",
      entityId: existing.id,
      metadata: {
        name: existing.name,
        ruleType: existing.ruleType,
        amount: existing.amount
      }
    }
  });
}
