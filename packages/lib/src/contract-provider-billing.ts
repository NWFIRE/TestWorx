import "server-only";

import { prisma } from "@testworx/db";
import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";
import { z } from "zod";

import { assertTenantContext } from "./permissions";

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function ensureAdminRole(role: string) {
  if (!["platform_admin", "tenant_admin", "office_admin"].includes(role)) {
    throw new Error("Only administrators can manage contract-provider billing.");
  }
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateOnly(value: Date | null | undefined) {
  if (!value) {
    return null;
  }

  return value.toISOString().slice(0, 10);
}

function buildSiteAssignmentStatusLabel(status: "active" | "inactive") {
  return status === "active" ? "Active assignment" : "Inactive assignment";
}

export const contractProviderAccountInputSchema = z.object({
  providerAccountId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1, "Provider name is required."),
  legalName: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  billingContactName: z.string().trim().min(1, "Billing contact name is required."),
  billingEmail: z.string().trim().email("Enter a valid billing email."),
  billingPhone: z.string().trim().min(1, "Billing phone is required."),
  remittanceAddressLine1: z.string().trim().min(1, "Remittance address is required."),
  remittanceAddressLine2: z.string().trim().optional(),
  remittanceCity: z.string().trim().min(1, "Remittance city is required."),
  remittanceState: z.string().trim().min(1, "Remittance state is required."),
  remittancePostalCode: z.string().trim().min(1, "Remittance postal code is required."),
  paymentTerms: z.string().trim().min(1, "Payment terms are required."),
  notes: z.string().trim().optional()
});

export const providerContractProfileInputSchema = z.object({
  providerContractProfileId: z.string().trim().min(1).optional(),
  providerAccountId: z.string().trim().min(1, "Select a provider account."),
  name: z.string().trim().min(1, "Contract name is required."),
  status: z.enum(["draft", "active", "inactive", "expired"]).default("draft"),
  effectiveStartDate: z.string().trim().min(1, "Start date is required."),
  effectiveEndDate: z.string().trim().optional(),
  pricingStrategy: z.enum(["provider_rate_card", "fixed_price", "custom_rules"]),
  invoiceGroupingMode: z.enum(["per_work_order", "per_site", "monthly_rollup"]),
  requireProviderWorkOrderNumber: z.boolean().default(false),
  requireSiteReferenceNumber: z.boolean().default(false),
  notes: z.string().trim().optional()
});

export const providerContractRateInputSchema = z.object({
  providerContractRateId: z.string().trim().min(1).optional(),
  providerContractProfileId: z.string().trim().min(1, "Select a contract profile."),
  serviceType: z.string().trim().min(1, "Service type is required."),
  inspectionType: z.string().trim().optional(),
  assetCategory: z.string().trim().optional(),
  reportType: z.string().trim().optional(),
  pricingMethod: z.enum(["flat_rate", "per_unit", "hourly"]),
  unitRate: z.number().nullable(),
  flatRate: z.number().nullable(),
  minimumCharge: z.number().nullable(),
  effectiveStartDate: z.string().trim().optional(),
  effectiveEndDate: z.string().trim().optional(),
  priority: z.number().int().default(0)
});

export const serviceSiteProviderAssignmentInputSchema = z.object({
  serviceSiteId: z.string().trim().min(1, "Site is required."),
  providerAccountId: z.string().trim().optional(),
  providerContractProfileId: z.string().trim().optional(),
  externalAccountName: z.string().trim().optional(),
  externalAccountNumber: z.string().trim().optional(),
  externalLocationCode: z.string().trim().optional(),
  effectiveStartDate: z.string().trim().optional(),
  effectiveEndDate: z.string().trim().optional(),
  billingNotes: z.string().trim().optional()
});

function parseNullableNumber(raw: string | null | undefined) {
  const normalized = (raw ?? "").trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseProviderContractRateInput(raw: {
  providerContractRateId?: string | null;
  providerContractProfileId?: string | null;
  serviceType?: string | null;
  inspectionType?: string | null;
  assetCategory?: string | null;
  reportType?: string | null;
  pricingMethod?: "flat_rate" | "per_unit" | "hourly" | null;
  unitRate?: string | null;
  flatRate?: string | null;
  minimumCharge?: string | null;
  effectiveStartDate?: string | null;
  effectiveEndDate?: string | null;
  priority?: string | null;
}) {
  return providerContractRateInputSchema.parse({
    providerContractRateId: raw.providerContractRateId ?? undefined,
    providerContractProfileId: raw.providerContractProfileId ?? "",
    serviceType: raw.serviceType ?? "",
    inspectionType: raw.inspectionType ?? "",
    assetCategory: raw.assetCategory ?? "",
    reportType: raw.reportType ?? "",
    pricingMethod: raw.pricingMethod ?? "flat_rate",
    unitRate: parseNullableNumber(raw.unitRate),
    flatRate: parseNullableNumber(raw.flatRate),
    minimumCharge: parseNullableNumber(raw.minimumCharge),
    effectiveStartDate: raw.effectiveStartDate ?? "",
    effectiveEndDate: raw.effectiveEndDate ?? "",
    priority: Number(raw.priority ?? 0)
  });
}

export async function getContractProviderAdminData(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  ensureAdminRole(parsedActor.role);

  const tenantId = parsedActor.tenantId as string;
  const [providers, siteAssignments] = await Promise.all([
    prisma.contractProviderAccount.findMany({
      where: { organizationId: tenantId },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        contractProfiles: {
          orderBy: [{ effectiveStartDate: "desc" }, { name: "asc" }],
          include: {
            _count: {
              select: {
                rates: true,
                siteAssignments: true
              }
            }
          }
        },
        _count: {
          select: {
            siteAssignments: true,
            workOrderContexts: true
          }
        }
      }
    }),
    prisma.serviceSiteProviderAssignment.count({
      where: {
        organizationId: tenantId,
        status: "active"
      }
    })
  ]);

  return {
    counts: {
      providers: providers.length,
      activeProviders: providers.filter((provider) => provider.status === "active").length,
      activeAssignments: siteAssignments,
      activeContracts: providers.flatMap((provider) => provider.contractProfiles).filter((contract) => contract.status === "active").length
    },
    providers: providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      legalName: provider.legalName,
      status: provider.status,
      billingContactName: provider.billingContactName,
      billingEmail: provider.billingEmail,
      billingPhone: provider.billingPhone,
      remittanceAddressLine1: provider.remittanceAddressLine1,
      remittanceAddressLine2: provider.remittanceAddressLine2,
      remittanceCity: provider.remittanceCity,
      remittanceState: provider.remittanceState,
      remittancePostalCode: provider.remittancePostalCode,
      paymentTerms: provider.paymentTerms,
      notes: provider.notes,
      contractCount: provider.contractProfiles.length,
      activeContractCount: provider.contractProfiles.filter((contract) => contract.status === "active").length,
      assignedSiteCount: provider._count.siteAssignments,
      workOrderContextCount: provider._count.workOrderContexts,
      contracts: provider.contractProfiles.map((contract) => ({
        id: contract.id,
        name: contract.name,
        status: contract.status,
        effectiveStartDate: contract.effectiveStartDate,
        effectiveEndDate: contract.effectiveEndDate,
        pricingStrategy: contract.pricingStrategy,
        invoiceGroupingMode: contract.invoiceGroupingMode,
        requireProviderWorkOrderNumber: contract.requireProviderWorkOrderNumber,
        requireSiteReferenceNumber: contract.requireSiteReferenceNumber,
        rateCount: contract._count.rates,
        siteAssignmentCount: contract._count.siteAssignments
      }))
    }))
  };
}

export async function getContractProviderDetail(actor: ActorContext, providerAccountId: string) {
  const parsedActor = parseActor(actor);
  ensureAdminRole(parsedActor.role);

  const tenantId = parsedActor.tenantId as string;
  const provider = await prisma.contractProviderAccount.findFirst({
    where: {
      id: providerAccountId,
      organizationId: tenantId
    },
    include: {
      contractProfiles: {
        orderBy: [{ effectiveStartDate: "desc" }, { name: "asc" }],
        include: {
          rates: {
            orderBy: [{ priority: "desc" }, { createdAt: "asc" }]
          },
          siteAssignments: {
            where: { status: "active" },
            include: {
              serviceSite: {
                select: {
                  id: true,
                  name: true,
                  customerCompany: { select: { id: true, name: true } }
                }
              }
            },
            orderBy: [{ updatedAt: "desc" }]
          }
        }
      },
      siteAssignments: {
        where: { status: "active" },
        include: {
          serviceSite: {
            select: {
              id: true,
              name: true,
              customerCompany: { select: { id: true, name: true } }
            }
          },
          providerContractProfile: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: [{ updatedAt: "desc" }]
      }
    }
  });

  if (!provider) {
    return null;
  }

  return {
    id: provider.id,
    name: provider.name,
    legalName: provider.legalName,
    status: provider.status,
    billingContactName: provider.billingContactName,
    billingEmail: provider.billingEmail,
    billingPhone: provider.billingPhone,
    remittanceAddressLine1: provider.remittanceAddressLine1,
    remittanceAddressLine2: provider.remittanceAddressLine2,
    remittanceCity: provider.remittanceCity,
    remittanceState: provider.remittanceState,
    remittancePostalCode: provider.remittancePostalCode,
    paymentTerms: provider.paymentTerms,
    notes: provider.notes,
    contracts: provider.contractProfiles.map((contract) => ({
      id: contract.id,
      name: contract.name,
      status: contract.status,
      effectiveStartDate: contract.effectiveStartDate,
      effectiveEndDate: contract.effectiveEndDate,
      pricingStrategy: contract.pricingStrategy,
      invoiceGroupingMode: contract.invoiceGroupingMode,
      requireProviderWorkOrderNumber: contract.requireProviderWorkOrderNumber,
      requireSiteReferenceNumber: contract.requireSiteReferenceNumber,
      notes: contract.notes,
      rates: contract.rates.map((rate) => ({
        id: rate.id,
        serviceType: rate.serviceType,
        inspectionType: rate.inspectionType,
        assetCategory: rate.assetCategory,
        reportType: rate.reportType,
        pricingMethod: rate.pricingMethod,
        unitRate: rate.unitRate,
        flatRate: rate.flatRate,
        minimumCharge: rate.minimumCharge,
        effectiveStartDate: rate.effectiveStartDate,
        effectiveEndDate: rate.effectiveEndDate,
        priority: rate.priority
      })),
      activeAssignments: contract.siteAssignments.map((assignment) => ({
        id: assignment.id,
        siteId: assignment.serviceSite.id,
        siteName: assignment.serviceSite.name,
        customerName: assignment.serviceSite.customerCompany.name,
        externalAccountName: assignment.externalAccountName,
        externalAccountNumber: assignment.externalAccountNumber,
        externalLocationCode: assignment.externalLocationCode
      }))
    })),
    activeAssignments: provider.siteAssignments.map((assignment) => ({
      id: assignment.id,
      siteId: assignment.serviceSite.id,
      siteName: assignment.serviceSite.name,
      customerName: assignment.serviceSite.customerCompany.name,
      contractProfileId: assignment.providerContractProfileId,
      contractProfileName: assignment.providerContractProfile?.name ?? null,
      externalAccountName: assignment.externalAccountName,
      externalAccountNumber: assignment.externalAccountNumber,
      externalLocationCode: assignment.externalLocationCode,
      effectiveStartDate: assignment.effectiveStartDate,
      billingNotes: assignment.billingNotes
    }))
  };
}

export async function getContractProviderAssignmentOptions(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  ensureAdminRole(parsedActor.role);

  const tenantId = parsedActor.tenantId as string;
  const providers = await prisma.contractProviderAccount.findMany({
    where: { organizationId: tenantId },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      contractProfiles: {
        orderBy: [{ status: "asc" }, { effectiveStartDate: "desc" }, { name: "asc" }]
      }
    }
  });

  return {
    providers: providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      status: provider.status,
      contracts: provider.contractProfiles.map((contract) => ({
        id: contract.id,
        name: contract.name,
        status: contract.status,
        effectiveStartDate: contract.effectiveStartDate,
        effectiveEndDate: contract.effectiveEndDate
      }))
    }))
  };
}

export async function createContractProviderAccount(
  actor: ActorContext,
  input: z.infer<typeof contractProviderAccountInputSchema>
) {
  const parsedActor = parseActor(actor);
  ensureAdminRole(parsedActor.role);

  const tenantId = parsedActor.tenantId as string;
  const parsedInput = contractProviderAccountInputSchema.parse(input);

  return prisma.contractProviderAccount.create({
    data: {
      organizationId: tenantId,
      name: parsedInput.name,
      legalName: normalizeOptionalText(parsedInput.legalName),
      status: parsedInput.status,
      billingContactName: parsedInput.billingContactName,
      billingEmail: parsedInput.billingEmail,
      billingPhone: parsedInput.billingPhone,
      remittanceAddressLine1: parsedInput.remittanceAddressLine1,
      remittanceAddressLine2: normalizeOptionalText(parsedInput.remittanceAddressLine2),
      remittanceCity: parsedInput.remittanceCity,
      remittanceState: parsedInput.remittanceState,
      remittancePostalCode: parsedInput.remittancePostalCode,
      paymentTerms: parsedInput.paymentTerms,
      notes: normalizeOptionalText(parsedInput.notes)
    }
  });
}

export async function updateContractProviderAccount(
  actor: ActorContext,
  input: z.infer<typeof contractProviderAccountInputSchema>
) {
  const parsedActor = parseActor(actor);
  ensureAdminRole(parsedActor.role);

  const tenantId = parsedActor.tenantId as string;
  const parsedInput = contractProviderAccountInputSchema.parse(input);

  if (!parsedInput.providerAccountId) {
    throw new Error("Provider account id is required.");
  }

  const existing = await prisma.contractProviderAccount.findFirst({
    where: {
      id: parsedInput.providerAccountId,
      organizationId: tenantId
    },
    select: { id: true }
  });

  if (!existing) {
    throw new Error("Provider account not found.");
  }

  return prisma.contractProviderAccount.update({
    where: { id: parsedInput.providerAccountId },
    data: {
      name: parsedInput.name,
      legalName: normalizeOptionalText(parsedInput.legalName),
      status: parsedInput.status,
      billingContactName: parsedInput.billingContactName,
      billingEmail: parsedInput.billingEmail,
      billingPhone: parsedInput.billingPhone,
      remittanceAddressLine1: parsedInput.remittanceAddressLine1,
      remittanceAddressLine2: normalizeOptionalText(parsedInput.remittanceAddressLine2),
      remittanceCity: parsedInput.remittanceCity,
      remittanceState: parsedInput.remittanceState,
      remittancePostalCode: parsedInput.remittancePostalCode,
      paymentTerms: parsedInput.paymentTerms,
      notes: normalizeOptionalText(parsedInput.notes)
    }
  });
}

export async function createProviderContractProfile(
  actor: ActorContext,
  input: z.infer<typeof providerContractProfileInputSchema>
) {
  const parsedActor = parseActor(actor);
  ensureAdminRole(parsedActor.role);

  const tenantId = parsedActor.tenantId as string;
  const parsedInput = providerContractProfileInputSchema.parse(input);

  const provider = await prisma.contractProviderAccount.findFirst({
    where: {
      id: parsedInput.providerAccountId,
      organizationId: tenantId
    },
    select: { id: true }
  });

  if (!provider) {
    throw new Error("Provider account not found.");
  }

  return prisma.providerContractProfile.create({
    data: {
      organizationId: tenantId,
      providerAccountId: parsedInput.providerAccountId,
      name: parsedInput.name,
      status: parsedInput.status,
      effectiveStartDate: new Date(parsedInput.effectiveStartDate),
      effectiveEndDate: normalizeOptionalDate(parsedInput.effectiveEndDate),
      pricingStrategy: parsedInput.pricingStrategy,
      invoiceGroupingMode: parsedInput.invoiceGroupingMode,
      requireProviderWorkOrderNumber: parsedInput.requireProviderWorkOrderNumber,
      requireSiteReferenceNumber: parsedInput.requireSiteReferenceNumber,
      notes: normalizeOptionalText(parsedInput.notes)
    }
  });
}

export async function updateProviderContractProfile(
  actor: ActorContext,
  input: z.infer<typeof providerContractProfileInputSchema>
) {
  const parsedActor = parseActor(actor);
  ensureAdminRole(parsedActor.role);

  const tenantId = parsedActor.tenantId as string;
  const parsedInput = providerContractProfileInputSchema.parse(input);

  if (!parsedInput.providerContractProfileId) {
    throw new Error("Contract profile id is required.");
  }

  const existing = await prisma.providerContractProfile.findFirst({
    where: {
      id: parsedInput.providerContractProfileId,
      organizationId: tenantId
    },
    select: { id: true }
  });

  if (!existing) {
    throw new Error("Contract profile not found.");
  }

  const provider = await prisma.contractProviderAccount.findFirst({
    where: {
      id: parsedInput.providerAccountId,
      organizationId: tenantId
    },
    select: { id: true }
  });

  if (!provider) {
    throw new Error("Provider account not found.");
  }

  return prisma.providerContractProfile.update({
    where: { id: parsedInput.providerContractProfileId },
    data: {
      providerAccountId: parsedInput.providerAccountId,
      name: parsedInput.name,
      status: parsedInput.status,
      effectiveStartDate: new Date(parsedInput.effectiveStartDate),
      effectiveEndDate: normalizeOptionalDate(parsedInput.effectiveEndDate),
      pricingStrategy: parsedInput.pricingStrategy,
      invoiceGroupingMode: parsedInput.invoiceGroupingMode,
      requireProviderWorkOrderNumber: parsedInput.requireProviderWorkOrderNumber,
      requireSiteReferenceNumber: parsedInput.requireSiteReferenceNumber,
      notes: normalizeOptionalText(parsedInput.notes)
    }
  });
}

export async function createProviderContractRate(
  actor: ActorContext,
  input: z.infer<typeof providerContractRateInputSchema>
) {
  const parsedActor = parseActor(actor);
  ensureAdminRole(parsedActor.role);

  const parsedInput = providerContractRateInputSchema.parse(input);
  const contract = await prisma.providerContractProfile.findFirst({
    where: {
      id: parsedInput.providerContractProfileId,
      organizationId: parsedActor.tenantId as string
    },
    select: { id: true }
  });

  if (!contract) {
    throw new Error("Contract profile not found.");
  }

  return prisma.providerContractRate.create({
    data: {
      providerContractProfileId: parsedInput.providerContractProfileId,
      serviceType: parsedInput.serviceType,
      inspectionType: normalizeOptionalText(parsedInput.inspectionType) as never,
      assetCategory: normalizeOptionalText(parsedInput.assetCategory),
      reportType: normalizeOptionalText(parsedInput.reportType),
      pricingMethod: parsedInput.pricingMethod,
      unitRate: parsedInput.unitRate,
      flatRate: parsedInput.flatRate,
      minimumCharge: parsedInput.minimumCharge,
      effectiveStartDate: normalizeOptionalDate(parsedInput.effectiveStartDate),
      effectiveEndDate: normalizeOptionalDate(parsedInput.effectiveEndDate),
      priority: parsedInput.priority
    }
  });
}

export async function updateProviderContractRate(
  actor: ActorContext,
  input: z.infer<typeof providerContractRateInputSchema>
) {
  const parsedActor = parseActor(actor);
  ensureAdminRole(parsedActor.role);

  const parsedInput = providerContractRateInputSchema.parse(input);
  if (!parsedInput.providerContractRateId) {
    throw new Error("Contract rate id is required.");
  }

  const contract = await prisma.providerContractProfile.findFirst({
    where: {
      id: parsedInput.providerContractProfileId,
      organizationId: parsedActor.tenantId as string
    },
    select: { id: true }
  });

  if (!contract) {
    throw new Error("Contract profile not found.");
  }

  return prisma.providerContractRate.update({
    where: { id: parsedInput.providerContractRateId },
    data: {
      providerContractProfileId: parsedInput.providerContractProfileId,
      serviceType: parsedInput.serviceType,
      inspectionType: normalizeOptionalText(parsedInput.inspectionType) as never,
      assetCategory: normalizeOptionalText(parsedInput.assetCategory),
      reportType: normalizeOptionalText(parsedInput.reportType),
      pricingMethod: parsedInput.pricingMethod,
      unitRate: parsedInput.unitRate,
      flatRate: parsedInput.flatRate,
      minimumCharge: parsedInput.minimumCharge,
      effectiveStartDate: normalizeOptionalDate(parsedInput.effectiveStartDate),
      effectiveEndDate: normalizeOptionalDate(parsedInput.effectiveEndDate),
      priority: parsedInput.priority
    }
  });
}

export async function setServiceSiteProviderAssignment(
  actor: ActorContext,
  input: z.infer<typeof serviceSiteProviderAssignmentInputSchema>
) {
  const parsedActor = parseActor(actor);
  ensureAdminRole(parsedActor.role);

  const tenantId = parsedActor.tenantId as string;
  const parsedInput = serviceSiteProviderAssignmentInputSchema.parse(input);
  const site = await prisma.site.findFirst({
    where: {
      id: parsedInput.serviceSiteId,
      tenantId
    },
    select: { id: true }
  });

  if (!site) {
    throw new Error("Service site not found.");
  }

  const providerAccountId = normalizeOptionalText(parsedInput.providerAccountId);
  const providerContractProfileId = normalizeOptionalText(parsedInput.providerContractProfileId);
  const effectiveStartDate = normalizeOptionalDate(parsedInput.effectiveStartDate) ?? new Date();
  const effectiveEndDate = normalizeOptionalDate(parsedInput.effectiveEndDate);

  const currentAssignments = await prisma.serviceSiteProviderAssignment.findMany({
    where: {
      organizationId: tenantId,
      serviceSiteId: parsedInput.serviceSiteId,
      status: "active"
    },
    orderBy: [{ effectiveStartDate: "desc" }, { createdAt: "desc" }]
  });

  if (!providerAccountId) {
    if (currentAssignments.length > 0) {
      await prisma.serviceSiteProviderAssignment.updateMany({
        where: {
          id: { in: currentAssignments.map((assignment) => assignment.id) }
        },
        data: {
          status: "inactive",
          effectiveEndDate: effectiveStartDate
        }
      });
    }

    return {
      mode: "direct_customer",
      message: "Contract-provider assignment cleared. New work orders will bill the direct customer by default."
    };
  }

  const provider = await prisma.contractProviderAccount.findFirst({
    where: {
      id: providerAccountId,
      organizationId: tenantId
    },
    select: { id: true, name: true }
  });

  if (!provider) {
    throw new Error("Provider account not found.");
  }

  if (providerContractProfileId) {
    const contract = await prisma.providerContractProfile.findFirst({
      where: {
        id: providerContractProfileId,
        organizationId: tenantId,
        providerAccountId
      },
      select: { id: true }
    });

    if (!contract) {
      throw new Error("Selected contract profile does not belong to this provider.");
    }
  }

  const nextShape = {
    providerAccountId,
    providerContractProfileId: providerContractProfileId ?? null,
    externalAccountName: normalizeOptionalText(parsedInput.externalAccountName),
    externalAccountNumber: normalizeOptionalText(parsedInput.externalAccountNumber),
    externalLocationCode: normalizeOptionalText(parsedInput.externalLocationCode),
    billingNotes: normalizeOptionalText(parsedInput.billingNotes)
  };

  const currentAssignment = currentAssignments[0] ?? null;
  const isSameAsCurrent =
    currentAssignment
    && currentAssignment.providerAccountId === nextShape.providerAccountId
    && currentAssignment.providerContractProfileId === nextShape.providerContractProfileId
    && currentAssignment.externalAccountName === nextShape.externalAccountName
    && currentAssignment.externalAccountNumber === nextShape.externalAccountNumber
    && currentAssignment.externalLocationCode === nextShape.externalLocationCode
    && currentAssignment.billingNotes === nextShape.billingNotes;

  if (isSameAsCurrent) {
    return {
      mode: "contract_provider",
      message: `Contract-provider assignment for ${provider.name} was already current for this site.`
    };
  }

  await prisma.$transaction(async (tx) => {
    if (currentAssignments.length > 0) {
      await tx.serviceSiteProviderAssignment.updateMany({
        where: {
          id: { in: currentAssignments.map((assignment) => assignment.id) }
        },
        data: {
          status: "inactive",
          effectiveEndDate: effectiveStartDate
        }
      });
    }

    await tx.serviceSiteProviderAssignment.create({
      data: {
        organizationId: tenantId,
        serviceSiteId: parsedInput.serviceSiteId,
        providerAccountId,
        providerContractProfileId,
        status: "active",
        externalAccountName: nextShape.externalAccountName,
        externalAccountNumber: nextShape.externalAccountNumber,
        externalLocationCode: nextShape.externalLocationCode,
        effectiveStartDate,
        effectiveEndDate,
        billingNotes: nextShape.billingNotes
      }
    });
  });

  return {
    mode: "contract_provider",
    message: `Default billing for this site now routes through ${provider.name}.`
  };
}

export function formatProviderContractStatusLabel(status: "draft" | "active" | "inactive" | "expired") {
  switch (status) {
    case "draft":
      return "Draft";
    case "active":
      return "Active";
    case "inactive":
      return "Inactive";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}

export function formatProviderPricingStrategyLabel(value: "provider_rate_card" | "fixed_price" | "custom_rules") {
  switch (value) {
    case "provider_rate_card":
      return "Provider rate card";
    case "fixed_price":
      return "Fixed price";
    case "custom_rules":
      return "Custom rules";
    default:
      return value;
  }
}

export function formatProviderInvoiceGroupingModeLabel(value: "per_work_order" | "per_site" | "monthly_rollup") {
  switch (value) {
    case "per_work_order":
      return "Per work order";
    case "per_site":
      return "Per site";
    case "monthly_rollup":
      return "Monthly rollup";
    default:
      return value;
  }
}

export function formatProviderRatePricingMethodLabel(value: "flat_rate" | "per_unit" | "hourly") {
  switch (value) {
    case "flat_rate":
      return "Flat rate";
    case "per_unit":
      return "Per unit";
    case "hourly":
      return "Hourly";
    default:
      return value;
  }
}

export function formatBillingResolutionModeLabel(value: "direct_customer" | "contract_provider") {
  return value === "contract_provider" ? "Contract provider" : "Direct customer";
}

export function formatBillingPricingSourceLabel(
  value: "provider_contract_rate" | "customer_pricing" | "default_pricing" | "manual_override"
) {
  switch (value) {
    case "provider_contract_rate":
      return "Provider contract rate";
    case "customer_pricing":
      return "Customer pricing";
    case "default_pricing":
      return "Default pricing";
    case "manual_override":
      return "Manual override";
    default:
      return value;
  }
}

export function formatWorkOrderProviderSourceLabel(value: "direct" | "third_party_provider") {
  return value === "third_party_provider" ? "Third-party provider" : "Direct";
}

export function formatContractProviderAccountStatusLabel(value: "active" | "inactive") {
  return value === "active" ? "Active" : "Inactive";
}

export function mapSiteProviderAssignmentForDisplay(site: {
  providerAssignments?: Array<{
    id: string;
    status: "active" | "inactive";
    effectiveStartDate: Date | null;
    effectiveEndDate: Date | null;
    externalAccountName: string | null;
    externalAccountNumber: string | null;
    externalLocationCode: string | null;
    billingNotes: string | null;
    providerAccount: { id: string; name: string } | null;
    providerContractProfile: { id: string; name: string } | null;
  }>;
}) {
  const assignments = site.providerAssignments ?? [];
  const current = assignments.find((assignment) => assignment.status === "active") ?? assignments[0] ?? null;

  return {
    currentAssignment: current ? {
      id: current.id,
      status: current.status,
      statusLabel: buildSiteAssignmentStatusLabel(current.status),
      providerAccountId: current.providerAccount?.id ?? "",
      providerAccountName: current.providerAccount?.name ?? null,
      providerContractProfileId: current.providerContractProfile?.id ?? "",
      providerContractProfileName: current.providerContractProfile?.name ?? null,
      externalAccountName: current.externalAccountName,
      externalAccountNumber: current.externalAccountNumber,
      externalLocationCode: current.externalLocationCode,
      effectiveStartDate: formatDateOnly(current.effectiveStartDate),
      effectiveEndDate: formatDateOnly(current.effectiveEndDate),
      billingNotes: current.billingNotes
    } : null,
    assignmentHistoryCount: assignments.length
  };
}
