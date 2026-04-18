import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TARGET_PROVIDER_NAMES = [
  "Commercial Fire",
  "Consolidated Fire",
  "Heritage Fire",
  "Academy Fire",
  "Century Fire"
] as const;

const DEFAULT_RECENT_DAYS = 180;

type LegacyPricingBucket = {
  defaultUnitPrice?: unknown;
  codeUnitPrices?: Record<string, unknown>;
};

function normalizeName(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function matchProviderName(value: string | null | undefined) {
  const normalized = normalizeName(value);
  return TARGET_PROVIDER_NAMES.find((name) => normalized.includes(normalizeName(name))) ?? null;
}

function parseRecentDays() {
  const index = process.argv.findIndex((arg) => arg === "--recent-days");
  const raw = index >= 0 ? process.argv[index + 1] : undefined;
  const parsed = Number.parseInt(raw ?? `${DEFAULT_RECENT_DAYS}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RECENT_DAYS;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asBucket(value: unknown): LegacyPricingBucket {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as LegacyPricingBucket;
}

function mapLegacyGroupingMode(value: unknown): "per_work_order" | "per_site" | "monthly_rollup" {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const mode = (value as Record<string, unknown>).mode;
    if (mode === "group_by_site") {
      return "per_site";
    }
    if (mode === "monthly_rollup") {
      return "monthly_rollup";
    }
  }

  return "per_work_order";
}

function mapLegacyProfileStatus(input: {
  isActive: boolean;
  effectiveEndDate: Date | null;
}) {
  if (!input.isActive) {
    return "inactive" as const;
  }

  if (input.effectiveEndDate && input.effectiveEndDate.getTime() < Date.now()) {
    return "expired" as const;
  }

  return "active" as const;
}

function extractRateDefinitions(input: {
  effectiveStartDate: Date;
  effectiveEndDate: Date | null;
  inspectionRules: unknown;
  serviceRules: unknown;
  emergencyRules: unknown;
  deficiencyRules: unknown;
}) {
  const noteMessages: string[] = [];
  const rateDefinitions: Array<{
    serviceType: string;
    pricingMethod: "flat_rate" | "per_unit" | "hourly";
    unitRate: number | null;
    flatRate: number | null;
    minimumCharge: number | null;
    effectiveStartDate: Date;
    effectiveEndDate: Date | null;
    priority: number;
  }> = [];

  const buckets = [
    { serviceType: "inspection", value: input.inspectionRules, priority: 100 },
    { serviceType: "service", value: input.serviceRules, priority: 200 },
    { serviceType: "emergency", value: input.emergencyRules, priority: 300 },
    { serviceType: "deficiency", value: input.deficiencyRules, priority: 400 }
  ] as const;

  for (const bucket of buckets) {
    const parsed = asBucket(bucket.value);
    const defaultUnitPrice = toNumber(parsed.defaultUnitPrice);
    const codeUnitPrices = Object.values(parsed.codeUnitPrices ?? {})
      .map((entry) => toNumber(entry))
      .filter((entry): entry is number => entry !== null);
    const distinctCodePrices = [...new Set(codeUnitPrices)];

    if (defaultUnitPrice !== null) {
      rateDefinitions.push({
        serviceType: bucket.serviceType,
        pricingMethod: "per_unit",
        unitRate: defaultUnitPrice,
        flatRate: null,
        minimumCharge: null,
        effectiveStartDate: input.effectiveStartDate,
        effectiveEndDate: input.effectiveEndDate,
        priority: bucket.priority
      });
      continue;
    }

    if (distinctCodePrices.length === 1) {
      rateDefinitions.push({
        serviceType: bucket.serviceType,
        pricingMethod: "flat_rate",
        unitRate: null,
        flatRate: distinctCodePrices[0] ?? null,
        minimumCharge: null,
        effectiveStartDate: input.effectiveStartDate,
        effectiveEndDate: input.effectiveEndDate,
        priority: bucket.priority
      });
      continue;
    }

    if (distinctCodePrices.length > 1) {
      noteMessages.push(
        `Legacy ${bucket.serviceType} pricing used multiple billing-code overrides and was left for manual review.`
      );
    }
  }

  return {
    rateDefinitions,
    noteMessages
  };
}

async function ensureProviderAccount(input: {
  write: boolean;
  tenantId: string;
  providerName: string;
  legacyPayer?: {
    id: string;
    name: string;
    contactName: string | null;
    billingEmail: string | null;
    phone: string | null;
    billingAddressLine1: string | null;
    billingAddressLine2: string | null;
    billingCity: string | null;
    billingState: string | null;
    billingPostalCode: string | null;
    isActive: boolean;
  } | null;
}) {
  const existing = await prisma.contractProviderAccount.findFirst({
    where: {
      organizationId: input.tenantId,
      name: input.providerName
    },
    select: {
      id: true,
      organizationId: true,
      name: true
    }
  });

  if (existing || !input.write) {
    return existing;
  }

  return prisma.contractProviderAccount.create({
    data: {
      organizationId: input.tenantId,
      name: input.providerName,
      legalName: null,
      status: input.legacyPayer?.isActive === false ? "inactive" : "active",
      billingContactName: input.legacyPayer?.contactName ?? input.providerName,
      billingEmail: input.legacyPayer?.billingEmail ?? "",
      billingPhone: input.legacyPayer?.phone ?? "",
      remittanceAddressLine1: input.legacyPayer?.billingAddressLine1 ?? "",
      remittanceAddressLine2: input.legacyPayer?.billingAddressLine2 ?? null,
      remittanceCity: input.legacyPayer?.billingCity ?? "",
      remittanceState: input.legacyPayer?.billingState ?? "",
      remittancePostalCode: input.legacyPayer?.billingPostalCode ?? "",
      paymentTerms: "per_contract",
      notes: input.legacyPayer
        ? `Migrated from legacy BillingPayerAccount ${input.legacyPayer.id}.`
        : "Auto-created during provider billing migration."
    },
    select: {
      id: true,
      organizationId: true,
      name: true
    }
  });
}

async function ensureProviderProfile(input: {
  write: boolean;
  tenantId: string;
  providerAccountId: string;
  providerName: string;
  legacyProfile?: {
    id: string;
    name: string;
    isActive: boolean;
    effectiveStartDate: Date;
    effectiveEndDate: Date | null;
    groupingRules: unknown;
    referenceRules: unknown;
    inspectionRules: unknown;
    serviceRules: unknown;
    emergencyRules: unknown;
    deficiencyRules: unknown;
  } | null;
}) {
  const desiredName = input.legacyProfile?.name ?? `${input.providerName} Default Contract`;
  const existing = await prisma.providerContractProfile.findFirst({
    where: {
      organizationId: input.tenantId,
      providerAccountId: input.providerAccountId,
      name: desiredName
    },
    select: {
      id: true,
      organizationId: true,
      providerAccountId: true,
      name: true
    }
  });

  if (existing || !input.write) {
    return existing;
  }

  const noteMessages: string[] = [];
  const rateDefinitions = input.legacyProfile
    ? extractRateDefinitions({
        effectiveStartDate: input.legacyProfile.effectiveStartDate,
        effectiveEndDate: input.legacyProfile.effectiveEndDate,
        inspectionRules: input.legacyProfile.inspectionRules,
        serviceRules: input.legacyProfile.serviceRules,
        emergencyRules: input.legacyProfile.emergencyRules,
        deficiencyRules: input.legacyProfile.deficiencyRules
      })
    : { rateDefinitions: [], noteMessages: ["Auto-created default profile because no legacy contract profile existed."] };

  const created = await prisma.providerContractProfile.create({
    data: {
      organizationId: input.tenantId,
      providerAccountId: input.providerAccountId,
      name: desiredName,
      status: input.legacyProfile
        ? mapLegacyProfileStatus({
            isActive: input.legacyProfile.isActive,
            effectiveEndDate: input.legacyProfile.effectiveEndDate
          })
        : "active",
      effectiveStartDate: input.legacyProfile?.effectiveStartDate ?? new Date("2026-01-01T00:00:00.000Z"),
      effectiveEndDate: input.legacyProfile?.effectiveEndDate ?? null,
      pricingStrategy: "provider_rate_card",
      invoiceGroupingMode: mapLegacyGroupingMode(input.legacyProfile?.groupingRules ?? null),
      requireProviderWorkOrderNumber: Boolean(
        input.legacyProfile?.referenceRules
        && typeof input.legacyProfile.referenceRules === "object"
        && !Array.isArray(input.legacyProfile.referenceRules)
        && (input.legacyProfile.referenceRules as Record<string, unknown>).requirePo
      ),
      requireSiteReferenceNumber: Boolean(
        input.legacyProfile?.referenceRules
        && typeof input.legacyProfile.referenceRules === "object"
        && !Array.isArray(input.legacyProfile.referenceRules)
        && (input.legacyProfile.referenceRules as Record<string, unknown>).requireCustomerReference
      ),
      notes: input.legacyProfile
        ? [`Migrated from legacy BillingContractProfile ${input.legacyProfile.id}.`, ...rateDefinitions.noteMessages].join(" ")
        : rateDefinitions.noteMessages.join(" ")
    },
    select: {
      id: true,
      organizationId: true,
      providerAccountId: true,
      name: true
    }
  });

  for (const rateDefinition of rateDefinitions.rateDefinitions) {
    await prisma.providerContractRate.create({
      data: {
        providerContractProfileId: created.id,
        serviceType: rateDefinition.serviceType,
        inspectionType: null,
        assetCategory: null,
        reportType: null,
        pricingMethod: rateDefinition.pricingMethod,
        unitRate: rateDefinition.unitRate,
        flatRate: rateDefinition.flatRate,
        minimumCharge: rateDefinition.minimumCharge,
        effectiveStartDate: rateDefinition.effectiveStartDate,
        effectiveEndDate: rateDefinition.effectiveEndDate,
        priority: rateDefinition.priority
      }
    });
  }

  return created;
}

async function main() {
  const write = process.argv.includes("--write");
  const recentDays = parseRecentDays();
  const recentCutoff = new Date(Date.now() - recentDays * 24 * 60 * 60 * 1000);

  const summary = {
    providerAccountsCreated: 0,
    providerProfilesCreated: 0,
    providerRatesCreated: 0,
    siteAssignmentsCreated: 0,
    workOrderContextsCreated: 0,
    inspectionsUpdated: 0
  };

  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true
    }
  });

  const legacyPayers = await prisma.billingPayerAccount.findMany({
    select: {
      id: true,
      tenantId: true,
      name: true,
      contactName: true,
      billingEmail: true,
      phone: true,
      billingAddressLine1: true,
      billingAddressLine2: true,
      billingCity: true,
      billingState: true,
      billingPostalCode: true,
      isActive: true
    }
  });

  const legacyPayersByTenantAndProvider = new Map<string, (typeof legacyPayers)[number]>();
  for (const payer of legacyPayers) {
    const matchedProvider = matchProviderName(payer.name);
    if (!matchedProvider) {
      continue;
    }
    legacyPayersByTenantAndProvider.set(`${payer.tenantId}:${matchedProvider}`, payer);
  }

  const providerAccountsByTenantAndName = new Map<string, { id: string; organizationId: string; name: string }>();
  for (const tenant of tenants) {
    for (const providerName of TARGET_PROVIDER_NAMES) {
      const legacyPayer = legacyPayersByTenantAndProvider.get(`${tenant.id}:${providerName}`) ?? null;
      const before = await prisma.contractProviderAccount.findFirst({
        where: { organizationId: tenant.id, name: providerName },
        select: { id: true }
      });
      const providerAccount = await ensureProviderAccount({
        write,
        tenantId: tenant.id,
        providerName,
        legacyPayer
      });
      if (providerAccount) {
        providerAccountsByTenantAndName.set(`${tenant.id}:${providerName}`, providerAccount);
        if (!before && write) {
          summary.providerAccountsCreated += 1;
        }
      }
    }
  }

  const legacyProfiles = await prisma.billingContractProfile.findMany({
    select: {
      id: true,
      tenantId: true,
      payerAccountId: true,
      name: true,
      isActive: true,
      effectiveStartDate: true,
      effectiveEndDate: true,
      inspectionRules: true,
      serviceRules: true,
      emergencyRules: true,
      deficiencyRules: true,
      groupingRules: true,
      referenceRules: true
    }
  });

  const providerProfilesByLegacyProfileId = new Map<string, { id: string; organizationId: string; providerAccountId: string; name: string }>();
  const defaultProfilesByTenantAndProvider = new Map<string, { id: string; organizationId: string; providerAccountId: string; name: string }>();

  for (const legacyProfile of legacyProfiles) {
    if (!legacyProfile.payerAccountId) {
      continue;
    }

    const legacyPayer = legacyPayers.find((payer) => payer.id === legacyProfile.payerAccountId) ?? null;
    const providerName = matchProviderName(legacyPayer?.name ?? null);
    if (!providerName) {
      continue;
    }

    const providerAccount = providerAccountsByTenantAndName.get(`${legacyProfile.tenantId}:${providerName}`);
    if (!providerAccount) {
      continue;
    }

    const beforeCount = await prisma.providerContractRate.count({
      where: { providerContractProfileId: undefined as never }
    }).catch(() => 0);
    const existingProfile = await prisma.providerContractProfile.findFirst({
      where: {
        organizationId: legacyProfile.tenantId,
        providerAccountId: providerAccount.id,
        name: legacyProfile.name
      },
      select: { id: true }
    });

    const providerProfile = await ensureProviderProfile({
      write,
      tenantId: legacyProfile.tenantId,
      providerAccountId: providerAccount.id,
      providerName,
      legacyProfile
    });

    if (providerProfile) {
      providerProfilesByLegacyProfileId.set(legacyProfile.id, providerProfile);
      if (!existingProfile && write) {
        summary.providerProfilesCreated += 1;
        const { rateDefinitions } = extractRateDefinitions({
          effectiveStartDate: legacyProfile.effectiveStartDate,
          effectiveEndDate: legacyProfile.effectiveEndDate,
          inspectionRules: legacyProfile.inspectionRules,
          serviceRules: legacyProfile.serviceRules,
          emergencyRules: legacyProfile.emergencyRules,
          deficiencyRules: legacyProfile.deficiencyRules
        });
        summary.providerRatesCreated += rateDefinitions.length;
      }
    }

    void beforeCount;
  }

  for (const tenant of tenants) {
    for (const providerName of TARGET_PROVIDER_NAMES) {
      const providerAccount = providerAccountsByTenantAndName.get(`${tenant.id}:${providerName}`);
      if (!providerAccount) {
        continue;
      }

      const existingDefault = await prisma.providerContractProfile.findFirst({
        where: {
          organizationId: tenant.id,
          providerAccountId: providerAccount.id,
          status: "active"
        },
        orderBy: [{ effectiveStartDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          organizationId: true,
          providerAccountId: true,
          name: true
        }
      });

      if (existingDefault) {
        defaultProfilesByTenantAndProvider.set(`${tenant.id}:${providerName}`, existingDefault);
        continue;
      }

      const createdDefault = await ensureProviderProfile({
        write,
        tenantId: tenant.id,
        providerAccountId: providerAccount.id,
        providerName,
        legacyProfile: null
      });

      if (createdDefault) {
        defaultProfilesByTenantAndProvider.set(`${tenant.id}:${providerName}`, createdDefault);
        if (write) {
          summary.providerProfilesCreated += 1;
        }
      }
    }
  }

  const customers = await prisma.customerCompany.findMany({
    select: {
      id: true,
      tenantId: true,
      name: true,
      billToAccountId: true,
      contractProfileId: true,
      billingType: true,
      sites: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  const siteAssignmentsBySiteId = new Map<string, {
    id: string;
    organizationId: string;
    serviceSiteId: string;
    providerAccountId: string;
    providerContractProfileId: string | null;
  }>();

  for (const customer of customers) {
    const providerNameFromCustomer = matchProviderName(customer.name);
    const providerNameFromLegacyPayer = customer.billToAccountId
      ? matchProviderName(legacyPayers.find((payer) => payer.id === customer.billToAccountId)?.name)
      : null;
    const providerName = providerNameFromCustomer ?? providerNameFromLegacyPayer;
    if (!providerName) {
      continue;
    }

    const providerAccount = providerAccountsByTenantAndName.get(`${customer.tenantId}:${providerName}`);
    const providerProfile = customer.contractProfileId
      ? providerProfilesByLegacyProfileId.get(customer.contractProfileId)
      : defaultProfilesByTenantAndProvider.get(`${customer.tenantId}:${providerName}`);

    if (!providerAccount || !providerProfile) {
      continue;
    }

    for (const site of customer.sites) {
      const existingAssignment = await prisma.serviceSiteProviderAssignment.findFirst({
        where: {
          organizationId: customer.tenantId,
          serviceSiteId: site.id,
          providerAccountId: providerAccount.id
        },
        select: {
          id: true,
          organizationId: true,
          serviceSiteId: true,
          providerAccountId: true,
          providerContractProfileId: true
        }
      });

      let assignment = existingAssignment;
      if (!assignment && write) {
        assignment = await prisma.serviceSiteProviderAssignment.create({
          data: {
            organizationId: customer.tenantId,
            serviceSiteId: site.id,
            providerAccountId: providerAccount.id,
            providerContractProfileId: providerProfile.id,
            status: "active",
            externalAccountName: customer.name,
            externalAccountNumber: null,
            externalLocationCode: null,
            effectiveStartDate: null,
            effectiveEndDate: null,
            billingNotes: `Backfilled from provider-linked customer ${customer.id}.`
          },
          select: {
            id: true,
            organizationId: true,
            serviceSiteId: true,
            providerAccountId: true,
            providerContractProfileId: true
          }
        });
        summary.siteAssignmentsCreated += 1;
      }

      if (assignment) {
        siteAssignmentsBySiteId.set(site.id, assignment);
      }
    }
  }

  const inspectionsToBackfill = await prisma.inspection.findMany({
    where: {
      siteId: {
        in: [...siteAssignmentsBySiteId.keys()]
      },
      archivedAt: null,
      OR: [
        { completedAt: null },
        { completedAt: { gte: recentCutoff } },
        { scheduledStart: { gte: recentCutoff } }
      ]
    },
    select: {
      id: true,
      tenantId: true,
      siteId: true,
      scheduledStart: true,
      providerContextId: true,
      sourceType: true
    },
    orderBy: [{ scheduledStart: "desc" }]
  });

  for (const inspection of inspectionsToBackfill) {
    const assignment = siteAssignmentsBySiteId.get(inspection.siteId);
    if (!assignment) {
      continue;
    }

    const existingContext = await prisma.workOrderProviderContext.findFirst({
      where: { workOrderId: inspection.id },
      select: { id: true }
    });

    let contextId = existingContext?.id ?? inspection.providerContextId ?? null;
    if (!existingContext && write) {
      const createdContext = await prisma.workOrderProviderContext.create({
        data: {
          workOrderId: inspection.id,
          providerAccountId: assignment.providerAccountId,
          providerContractProfileId: assignment.providerContractProfileId,
          siteProviderAssignmentId: assignment.id,
          sourceType: "third_party_provider"
        },
        select: { id: true }
      });
      contextId = createdContext.id;
      summary.workOrderContextsCreated += 1;
    }

    if (contextId && write && (inspection.providerContextId !== contextId || inspection.sourceType !== "third_party_provider")) {
      await prisma.inspection.update({
        where: { id: inspection.id },
        data: {
          providerContextId: contextId,
          sourceType: "third_party_provider"
        }
      });
      summary.inspectionsUpdated += 1;
    }
  }

  console.log(JSON.stringify({
    mode: write ? "write" : "dry_run",
    recentDays,
    tenantsFound: tenants.length,
    legacyPayersFound: legacyPayers.length,
    customersMatched: customers.filter((customer) => Boolean(matchProviderName(customer.name))).length,
    inspectionsConsidered: inspectionsToBackfill.length,
    summary
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
