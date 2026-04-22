import { Prisma } from "@prisma/client";
import { prisma } from "@testworx/db";
import { z } from "zod";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { assertTenantContext } from "./permissions";
import { getTenantQuickBooksConnectionStatus, syncTradeWorxCustomerCompanyToQuickBooks } from "./quickbooks";
import {
  customerBillingSettingsInputSchema,
  invoiceDeliverySettingsSchema,
  requiredBillingReferencesSchema,
  validateCustomerBillingSettingsTx
} from "./third-party-billing";

export const customerPaymentTermsOptions = ["due_on_receipt", "net_15", "net_30", "net_60", "custom"] as const;

export type CustomerPaymentTermsCode = (typeof customerPaymentTermsOptions)[number];

const customerPaymentTermsLabels: Record<CustomerPaymentTermsCode, string> = {
  due_on_receipt: "Due at time of service",
  net_15: "Net 15",
  net_30: "Net 30",
  net_60: "Net 60",
  custom: "Custom terms"
};

const customerCompanySelect = {
  id: true,
  name: true,
  contactName: true,
  billingEmail: true,
  phone: true,
  isTaxExempt: true,
  serviceAddressLine1: true,
  serviceAddressLine2: true,
  serviceCity: true,
  serviceState: true,
  servicePostalCode: true,
  serviceCountry: true,
  billingAddressSameAsService: true,
  billingAddressLine1: true,
  billingAddressLine2: true,
  billingCity: true,
  billingState: true,
  billingPostalCode: true,
  billingCountry: true,
  notes: true,
  isActive: true,
  paymentTermsCode: true,
  customPaymentTermsLabel: true,
  customPaymentTermsDays: true,
  billingType: true,
  billToAccountId: true,
  contractProfileId: true,
  invoiceDeliverySettings: true,
  autoBillingEnabled: true,
  requiredBillingReferences: true,
  quickbooksCustomerId: true,
  createdAt: true,
  updatedAt: true
} as const;

const customerCompanyDirectorySelect = {
  id: true,
  name: true
} as const;

type SelectedCustomerCompany = {
  id: string;
  name: string;
  contactName: string | null;
  billingEmail: string | null;
  phone: string | null;
  isTaxExempt: boolean;
  serviceAddressLine1: string | null;
  serviceAddressLine2: string | null;
  serviceCity: string | null;
  serviceState: string | null;
  servicePostalCode: string | null;
  serviceCountry: string | null;
  billingAddressSameAsService: boolean;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPostalCode: string | null;
  billingCountry: string | null;
  notes: string | null;
  isActive: boolean;
  paymentTermsCode: string;
  customPaymentTermsLabel: string | null;
  customPaymentTermsDays: number | null;
  billingType: string;
  billToAccountId: string | null;
  contractProfileId: string | null;
  invoiceDeliverySettings: Prisma.JsonValue | null;
  autoBillingEnabled: boolean;
  requiredBillingReferences: Prisma.JsonValue | null;
  quickbooksCustomerId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SelectedCustomerCompanyDirectoryEntry = {
  id: string;
  name: string;
};

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function ensureTenantAdmin(parsedActor: ReturnType<typeof parseActor>) {
  if (!["tenant_admin", "platform_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can manage customers.");
  }
}

function nullableTrimmedString(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);
}

function optionalPositiveInt() {
  return z
    .union([z.number().int().min(1).max(365), z.nan(), z.null(), z.undefined()])
    .optional()
    .transform((value) => {
      if (value == null || Number.isNaN(value)) {
        return undefined;
      }

      return value;
    });
}

export function getCustomerPaymentTermsLabel(input: {
  paymentTermsCode: string;
  customPaymentTermsLabel?: string | null;
  customPaymentTermsDays?: number | null;
}) {
  if (input.paymentTermsCode === "custom") {
    if (input.customPaymentTermsLabel?.trim()) {
      return input.customPaymentTermsLabel.trim();
    }

    if (input.customPaymentTermsDays) {
      return `Net ${input.customPaymentTermsDays}`;
    }
  }

  if (input.paymentTermsCode in customerPaymentTermsLabels) {
    return customerPaymentTermsLabels[input.paymentTermsCode as CustomerPaymentTermsCode];
  }

  return customerPaymentTermsLabels.net_30;
}

export function isDueAtTimeOfServiceCustomer(input: {
  paymentTermsCode?: string | null;
}) {
  return (input.paymentTermsCode ?? "net_30") === "due_on_receipt";
}

export const customerCompanyInputSchema = z
  .object({
    customerCompanyId: z.string().trim().optional(),
    name: z.string().trim().min(1, "Company name is required.").max(160),
    contactName: nullableTrimmedString(160),
    billingEmail: z
      .string()
      .trim()
      .email("Enter a valid billing email.")
      .or(z.literal(""))
      .optional()
      .transform((value) => value || undefined),
    phone: nullableTrimmedString(60),
    isTaxExempt: z.boolean().default(false),
    serviceAddressLine1: nullableTrimmedString(160),
    serviceAddressLine2: nullableTrimmedString(160),
    serviceCity: nullableTrimmedString(120),
    serviceState: nullableTrimmedString(120),
    servicePostalCode: nullableTrimmedString(40),
    serviceCountry: nullableTrimmedString(120),
    billingAddressSameAsService: z.boolean().default(true),
    billingAddressLine1: nullableTrimmedString(160),
    billingAddressLine2: nullableTrimmedString(160),
    billingCity: nullableTrimmedString(120),
    billingState: nullableTrimmedString(120),
    billingPostalCode: nullableTrimmedString(40),
    billingCountry: nullableTrimmedString(120),
    notes: nullableTrimmedString(2000),
    isActive: z.boolean().default(true),
    paymentTermsCode: z
      .enum(customerPaymentTermsOptions, {
        message: "Select payment terms."
      })
      .default("net_30"),
    customPaymentTermsLabel: nullableTrimmedString(120),
    customPaymentTermsDays: optionalPositiveInt(),
    billingType: z.enum(["standard", "third_party"]).default("standard"),
    billToAccountId: nullableTrimmedString(160),
    contractProfileId: nullableTrimmedString(160),
    invoiceDeliverySettings: invoiceDeliverySettingsSchema.default({ method: "payer_email" }),
    autoBillingEnabled: z.boolean().default(false),
    requiredBillingReferences: requiredBillingReferencesSchema.default({})
  })
  .superRefine((input, context) => {
    if (input.paymentTermsCode === "custom" && !input.customPaymentTermsLabel && !input.customPaymentTermsDays) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customPaymentTermsLabel"],
        message: "Enter custom payment terms or the number of days."
      });
    }

    if (!input.billingAddressSameAsService) {
      const requiredBillingFields: Array<[keyof typeof input, string]> = [
        ["billingAddressLine1", "Billing address line 1 is required."],
        ["billingCity", "Billing city is required."],
        ["billingState", "Billing state or region is required."],
        ["billingPostalCode", "Billing postal code is required."],
        ["billingCountry", "Billing country is required."]
      ];

      for (const [field, message] of requiredBillingFields) {
        if (!input[field]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message
          });
        }
      }
    }

    const parsedBilling = customerBillingSettingsInputSchema.safeParse({
      billingType: input.billingType,
      billToAccountId: input.billToAccountId,
      contractProfileId: input.contractProfileId,
      invoiceDeliverySettings: input.invoiceDeliverySettings,
      autoBillingEnabled: input.autoBillingEnabled,
      requiredBillingReferences: input.requiredBillingReferences
    });

    if (!parsedBilling.success) {
      const firstIssue = parsedBilling.error.issues[0];
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: firstIssue?.path ?? ["billingType"],
        message: firstIssue?.message ?? "Invalid billing settings."
      });
    }
  });

function normalizeCustomerCompanyInput(input: z.infer<typeof customerCompanyInputSchema>) {
  const billingAddressSameAsService = input.billingAddressSameAsService ?? true;
  const paymentTermsCode = input.paymentTermsCode ?? "net_30";
  const customPaymentTermsLabel = paymentTermsCode === "custom" ? input.customPaymentTermsLabel ?? null : null;
  const customPaymentTermsDays = paymentTermsCode === "custom" ? input.customPaymentTermsDays ?? null : null;
  const billingSettings = customerBillingSettingsInputSchema.parse({
    billingType: input.billingType ?? "standard",
    billToAccountId: input.billToAccountId ?? undefined,
    contractProfileId: input.contractProfileId ?? undefined,
    invoiceDeliverySettings: input.invoiceDeliverySettings ?? { method: "payer_email" },
    autoBillingEnabled: input.autoBillingEnabled ?? false,
    requiredBillingReferences: input.requiredBillingReferences ?? {}
  });

  return {
    customerCompanyId: input.customerCompanyId?.trim() || undefined,
    name: input.name,
    contactName: input.contactName ?? null,
    billingEmail: input.billingEmail ?? null,
    phone: input.phone ?? null,
    isTaxExempt: input.isTaxExempt ?? false,
    serviceAddressLine1: input.serviceAddressLine1 ?? null,
    serviceAddressLine2: input.serviceAddressLine2 ?? null,
    serviceCity: input.serviceCity ?? null,
    serviceState: input.serviceState ?? null,
    servicePostalCode: input.servicePostalCode ?? null,
    serviceCountry: input.serviceCountry ?? null,
    billingAddressSameAsService,
    billingAddressLine1: billingAddressSameAsService ? input.serviceAddressLine1 ?? null : input.billingAddressLine1 ?? null,
    billingAddressLine2: billingAddressSameAsService ? input.serviceAddressLine2 ?? null : input.billingAddressLine2 ?? null,
    billingCity: billingAddressSameAsService ? input.serviceCity ?? null : input.billingCity ?? null,
    billingState: billingAddressSameAsService ? input.serviceState ?? null : input.billingState ?? null,
    billingPostalCode: billingAddressSameAsService ? input.servicePostalCode ?? null : input.billingPostalCode ?? null,
    billingCountry: billingAddressSameAsService ? input.serviceCountry ?? null : input.billingCountry ?? null,
    notes: input.notes ?? null,
    isActive: input.isActive ?? true,
    paymentTermsCode,
    customPaymentTermsLabel,
    customPaymentTermsDays,
    billingType: billingSettings.billingType,
    billToAccountId: billingSettings.billingType === "third_party" ? billingSettings.billToAccountId ?? null : null,
    contractProfileId: billingSettings.billingType === "third_party" ? billingSettings.contractProfileId ?? null : null,
    invoiceDeliverySettings: billingSettings.invoiceDeliverySettings,
    autoBillingEnabled: billingSettings.autoBillingEnabled,
    requiredBillingReferences: billingSettings.requiredBillingReferences
  };
}

type CustomerCompanySyncResult = {
  customer: SelectedCustomerCompany;
  quickBooksSyncError: string | null;
  quickBooksSynced: boolean;
};

type CustomerCompanyDeleteResult = {
  id: string;
  name: string;
};

function formatDeleteCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildCustomerDeleteBlockedMessage(name: string, counts: {
  users: number;
  sites: number;
  inspections: number;
  quotes: number;
  billingSummaries: number;
}) {
  const blockers: string[] = [];

  if (counts.users > 0) {
    blockers.push(formatDeleteCount(counts.users, "linked user"));
  }

  if (counts.sites > 0) {
    blockers.push(formatDeleteCount(counts.sites, "site"));
  }

  if (counts.inspections > 0) {
    blockers.push(formatDeleteCount(counts.inspections, "inspection"));
  }

  if (counts.quotes > 0) {
    blockers.push(formatDeleteCount(counts.quotes, "quote"));
  }

  if (counts.billingSummaries > 0) {
    blockers.push(formatDeleteCount(counts.billingSummaries, "billing record"));
  }

  if (blockers.length === 0) {
    return null;
  }

  return `Cannot delete ${name} yet. Remove or move the linked ${blockers.join(", ")} first.`;
}

export async function getTenantCustomerCompanySettings(actor: ActorContext) {
  const result = await getPaginatedTenantCustomerCompanySettings(actor, { page: 1, limit: 5000 });
  return result.customers;
}

export async function getPaginatedTenantCustomerCompanySettings(
  actor: ActorContext,
  input?: {
    page?: number;
    limit?: number;
    query?: string | null;
  }
) {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);
  const page = Math.max(input?.page ?? 1, 1);
  const limit = Math.min(Math.max(input?.limit ?? 10, 1), 100);
  const tenantId = parsedActor.tenantId as string;
  const query = (input?.query ?? "").trim();
  const where = {
    tenantId,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { contactName: { contains: query, mode: "insensitive" as const } },
            { billingEmail: { contains: query, mode: "insensitive" as const } },
            { phone: { contains: query, mode: "insensitive" as const } }
          ]
        }
      : {})
  };

  const [totalCount, customers, overallCountRaw] = await Promise.all([
    prisma.customerCompany.count({
      where
    }),
    prisma.customerCompany.findMany({
      where,
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: customerCompanySelect
    }),
    query
      ? prisma.customerCompany.count({
          where: { tenantId }
        })
      : Promise.resolve(0)
  ]);

  const totalPages = Math.max(Math.ceil(totalCount / limit), 1);
  const safePage = Math.min(page, totalPages);
  const pagedCustomers =
    safePage === page
      ? customers
      : await prisma.customerCompany.findMany({
          where,
          orderBy: [{ name: "asc" }, { createdAt: "asc" }],
          skip: (safePage - 1) * limit,
          take: limit,
          select: customerCompanySelect
        });

  return {
    customers: pagedCustomers,
    pagination: {
      page: safePage,
      limit,
      totalCount,
      totalPages,
      overallCount: query ? overallCountRaw : totalCount
    },
    filters: {
      query
    }
  };
}

export async function getPaginatedTenantCustomerCompanyDirectory(
  actor: ActorContext,
  input?: {
    page?: number;
    limit?: number;
    query?: string | null;
  }
) {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);
  const page = Math.max(input?.page ?? 1, 1);
  const limit = Math.min(Math.max(input?.limit ?? 10, 1), 100);
  const tenantId = parsedActor.tenantId as string;
  const query = (input?.query ?? "").trim();
  const where = {
    tenantId,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { contactName: { contains: query, mode: "insensitive" as const } },
            { billingEmail: { contains: query, mode: "insensitive" as const } },
            { phone: { contains: query, mode: "insensitive" as const } }
          ]
        }
      : {})
  };

  const [totalCount, customers, overallCountRaw] = await Promise.all([
    prisma.customerCompany.count({
      where
    }),
    prisma.customerCompany.findMany({
      where,
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: customerCompanyDirectorySelect
    }),
    query
      ? prisma.customerCompany.count({
          where: { tenantId }
        })
      : Promise.resolve(0)
  ]);

  const totalPages = Math.max(Math.ceil(totalCount / limit), 1);
  const safePage = Math.min(page, totalPages);
  const pagedCustomers: SelectedCustomerCompanyDirectoryEntry[] =
    safePage === page
      ? customers
      : await prisma.customerCompany.findMany({
          where,
          orderBy: [{ name: "asc" }, { createdAt: "asc" }],
          skip: (safePage - 1) * limit,
          take: limit,
          select: customerCompanyDirectorySelect
        });

  return {
    customers: pagedCustomers,
    pagination: {
      page: safePage,
      limit,
      totalCount,
      totalPages,
      overallCount: query ? overallCountRaw : totalCount
    },
    filters: {
      query
    }
  };
}

async function syncCustomerCompanyIfQuickBooksConnected(actor: ActorContext, customerCompanyId: string) {
  try {
    const status = await getTenantQuickBooksConnectionStatus(actor);
    if (!status.connection.connected) {
      return { quickBooksSynced: false, quickBooksSyncError: null };
    }

    await syncTradeWorxCustomerCompanyToQuickBooks(actor, customerCompanyId);
    return { quickBooksSynced: true, quickBooksSyncError: null };
  } catch (error) {
    return {
      quickBooksSynced: false,
      quickBooksSyncError: error instanceof Error ? error.message : "QuickBooks customer sync failed."
    };
  }
}

export async function createCustomerCompany(
  actor: ActorContext,
  input: z.infer<typeof customerCompanyInputSchema>
): Promise<CustomerCompanySyncResult> {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);
  const parsedInput = normalizeCustomerCompanyInput(customerCompanyInputSchema.parse(input));

  const existing = await prisma.customerCompany.findFirst({
    where: {
      tenantId: parsedActor.tenantId as string,
      name: parsedInput.name
    },
    select: { id: true }
  });

  if (existing) {
    throw new Error("A customer with that name already exists.");
  }

  const validatedBilling = await validateCustomerBillingSettingsTx(prisma, {
    tenantId: parsedActor.tenantId as string,
    billingSettings: {
      billingType: parsedInput.billingType,
      billToAccountId: parsedInput.billToAccountId ?? undefined,
      contractProfileId: parsedInput.contractProfileId ?? undefined,
      invoiceDeliverySettings: parsedInput.invoiceDeliverySettings,
      autoBillingEnabled: parsedInput.autoBillingEnabled,
      requiredBillingReferences: parsedInput.requiredBillingReferences
    }
  });

  const customer = await prisma.customerCompany.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      ...parsedInput,
      billingType: validatedBilling.billingSettings.billingType,
      billToAccountId: validatedBilling.billingSettings.billToAccountId ?? null,
      contractProfileId: validatedBilling.billingSettings.contractProfileId ?? null,
      invoiceDeliverySettings: validatedBilling.billingSettings.invoiceDeliverySettings as unknown as Prisma.InputJsonValue,
      autoBillingEnabled: validatedBilling.billingSettings.autoBillingEnabled,
      requiredBillingReferences: validatedBilling.billingSettings.requiredBillingReferences as unknown as Prisma.InputJsonValue
    },
    select: customerCompanySelect
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "customer.company_created",
      entityType: "CustomerCompany",
      entityId: customer.id,
      metadata: {
        name: customer.name,
        billingEmail: customer.billingEmail,
        phone: customer.phone,
        isTaxExempt: customer.isTaxExempt,
        isActive: customer.isActive,
        paymentTermsCode: customer.paymentTermsCode,
        billingAddressSameAsService: customer.billingAddressSameAsService,
        billingType: customer.billingType,
        billToAccountId: customer.billToAccountId,
        contractProfileId: customer.contractProfileId
      }
    }
  });

  const syncResult = await syncCustomerCompanyIfQuickBooksConnected(parsedActor, customer.id);
  const refreshedCustomer = syncResult.quickBooksSynced
    ? await prisma.customerCompany.findFirst({
        where: {
          id: customer.id,
          tenantId: parsedActor.tenantId as string
        },
        select: customerCompanySelect
      })
    : customer;

  return {
    customer: refreshedCustomer ?? customer,
    ...syncResult
  };
}

export async function updateCustomerCompany(
  actor: ActorContext,
  input: z.infer<typeof customerCompanyInputSchema>
): Promise<CustomerCompanySyncResult> {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);
  const parsedInput = normalizeCustomerCompanyInput(customerCompanyInputSchema.parse(input));

  if (!parsedInput.customerCompanyId) {
    throw new Error("A customer id is required to update a customer.");
  }

  const existing = await prisma.customerCompany.findFirst({
    where: {
      id: parsedInput.customerCompanyId,
      tenantId: parsedActor.tenantId as string
    },
    select: {
      id: true,
      name: true
    }
  });

  if (!existing) {
    throw new Error("Customer not found.");
  }

  const nameConflict = await prisma.customerCompany.findFirst({
    where: {
      tenantId: parsedActor.tenantId as string,
      name: parsedInput.name,
      NOT: { id: existing.id }
    },
    select: { id: true }
  });

  if (nameConflict) {
    throw new Error("Another customer already uses that name.");
  }

  const validatedBilling = await validateCustomerBillingSettingsTx(prisma, {
    tenantId: parsedActor.tenantId as string,
    billingSettings: {
      billingType: parsedInput.billingType,
      billToAccountId: parsedInput.billToAccountId ?? undefined,
      contractProfileId: parsedInput.contractProfileId ?? undefined,
      invoiceDeliverySettings: parsedInput.invoiceDeliverySettings,
      autoBillingEnabled: parsedInput.autoBillingEnabled,
      requiredBillingReferences: parsedInput.requiredBillingReferences
    }
  });

  const customer = await prisma.customerCompany.update({
    where: { id: existing.id },
    data: {
      ...parsedInput,
      billingType: validatedBilling.billingSettings.billingType,
      billToAccountId: validatedBilling.billingSettings.billToAccountId ?? null,
      contractProfileId: validatedBilling.billingSettings.contractProfileId ?? null,
      invoiceDeliverySettings: validatedBilling.billingSettings.invoiceDeliverySettings as unknown as Prisma.InputJsonValue,
      autoBillingEnabled: validatedBilling.billingSettings.autoBillingEnabled,
      requiredBillingReferences: validatedBilling.billingSettings.requiredBillingReferences as unknown as Prisma.InputJsonValue
    },
    select: customerCompanySelect
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "customer.company_updated",
      entityType: "CustomerCompany",
      entityId: customer.id,
      metadata: {
        name: customer.name,
        billingEmail: customer.billingEmail,
        phone: customer.phone,
        isTaxExempt: customer.isTaxExempt,
        isActive: customer.isActive,
        paymentTermsCode: customer.paymentTermsCode,
        billingAddressSameAsService: customer.billingAddressSameAsService,
        billingType: customer.billingType,
        billToAccountId: customer.billToAccountId,
        contractProfileId: customer.contractProfileId
      }
    }
  });

  const syncResult = await syncCustomerCompanyIfQuickBooksConnected(parsedActor, customer.id);
  const refreshedCustomer = syncResult.quickBooksSynced
    ? await prisma.customerCompany.findFirst({
        where: {
          id: customer.id,
          tenantId: parsedActor.tenantId as string
        },
        select: customerCompanySelect
      })
    : customer;

  return {
    customer: refreshedCustomer ?? customer,
    ...syncResult
  };
}

export async function deleteCustomerCompany(
  actor: ActorContext,
  customerCompanyId: string
): Promise<CustomerCompanyDeleteResult> {
  const parsedActor = parseActor(actor);
  ensureTenantAdmin(parsedActor);
  const tenantId = parsedActor.tenantId as string;

  const existing = await prisma.customerCompany.findFirst({
    where: {
      id: customerCompanyId,
      tenantId
    },
    select: {
      id: true,
      name: true,
      quickbooksCustomerId: true
    }
  });

  if (!existing) {
    throw new Error("Customer not found.");
  }

  const [users, sites, inspections, quotes, billingSummaries] = await Promise.all([
    prisma.user.count({
      where: {
        tenantId,
        customerCompanyId: existing.id
      }
    }),
    prisma.site.count({
      where: {
        tenantId,
        customerCompanyId: existing.id
      }
    }),
    prisma.inspection.count({
      where: {
        tenantId,
        customerCompanyId: existing.id
      }
    }),
    prisma.quote.count({
      where: {
        tenantId,
        customerCompanyId: existing.id
      }
    }),
    prisma.inspectionBillingSummary.count({
      where: {
        tenantId,
        customerCompanyId: existing.id
      }
    })
  ]);

  const blockedMessage = buildCustomerDeleteBlockedMessage(existing.name, {
    users,
    sites,
    inspections,
    quotes,
    billingSummaries
  });

  if (blockedMessage) {
    throw new Error(blockedMessage);
  }

  await prisma.$transaction(async (tx) => {
    await tx.serviceFeeRule.deleteMany({
      where: {
        tenantId,
        customerCompanyId: existing.id
      }
    });

    await tx.emailReminderSendLog.deleteMany({
      where: {
        tenantId,
        customerCompanyId: existing.id
      }
    });

    await tx.accountInvitation.updateMany({
      where: {
        tenantId,
        customerCompanyId: existing.id
      },
      data: {
        customerCompanyId: null
      }
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId: parsedActor.userId,
        action: "customer.company_deleted",
        entityType: "CustomerCompany",
        entityId: existing.id,
        metadata: {
          name: existing.name,
          quickbooksCustomerId: existing.quickbooksCustomerId
        }
      }
    });

    await tx.customerCompany.delete({
      where: {
        id: existing.id
      }
    });
  });

  return {
    id: existing.id,
    name: existing.name
  };
}
