import { Prisma } from "@prisma/client";
import { prisma } from "@testworx/db";
import { z } from "zod";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import type { BillableItem } from "./inspection-billing";
import { assertTenantContext } from "./permissions";

type DbClient = Prisma.TransactionClient | typeof prisma;

export const billingTypeValues = ["standard", "third_party"] as const;
export type BillingTypeValue = (typeof billingTypeValues)[number];

export const deliveryMethodValues = ["payer_email", "customer_email", "manual"] as const;
export type DeliveryMethod = (typeof deliveryMethodValues)[number];

export const groupingModeValues = ["standard", "group_by_site", "group_by_inspection"] as const;
export type GroupingMode = (typeof groupingModeValues)[number];

export const pricingModeValues = ["standard", "contract_rule_override", "manual_review"] as const;
export type PricingMode = (typeof pricingModeValues)[number];

const trimmedString = (max: number) =>
  z.string().trim().max(max).optional().transform((value) => value || undefined);

const nullableTrimmedString = (max: number) =>
  z.string().trim().max(max).optional().transform((value) => value || undefined);

const normalizedStringArray = z
  .union([z.array(z.string()), z.string(), z.undefined(), z.null()])
  .optional()
  .transform((value) => {
    if (!value) {
      return [];
    }

    const rawValues = Array.isArray(value) ? value : value.split(",");
    return rawValues.map((entry) => entry.trim()).filter(Boolean);
  });

export const invoiceDeliverySettingsSchema = z.object({
  method: z.enum(deliveryMethodValues).default("payer_email"),
  recipientEmail: z.string().trim().email().optional().or(z.literal("")).transform((value) => value || undefined),
  label: trimmedString(120)
});

export type InvoiceDeliverySettings = z.infer<typeof invoiceDeliverySettingsSchema>;

export const requiredBillingReferencesSchema = z.object({
  requirePo: z.boolean().default(false),
  requireCustomerReference: z.boolean().default(false),
  labels: normalizedStringArray.default([])
});

export type RequiredBillingReferences = z.infer<typeof requiredBillingReferencesSchema>;

const pricingRuleBucketSchema = z.object({
  defaultUnitPrice: z.number().finite().nonnegative().optional(),
  codeUnitPrices: z.record(z.string(), z.number().finite().nonnegative()).optional(),
  note: trimmedString(500)
});

export type PricingRuleBucket = z.infer<typeof pricingRuleBucketSchema>;

const groupingRulesSchema = z.object({
  mode: z.enum(groupingModeValues).default("standard"),
  note: trimmedString(500)
});

export type GroupingRules = z.infer<typeof groupingRulesSchema>;

const attachmentRulesSchema = z.object({
  requireFinalizedReport: z.boolean().default(false),
  requireSignedDocument: z.boolean().default(false),
  requiredDocumentLabels: normalizedStringArray.default([])
});

export type AttachmentRules = z.infer<typeof attachmentRulesSchema>;

const deliveryRulesSchema = z.object({
  holdForManualReview: z.boolean().default(true),
  deliveryMethod: z.enum(deliveryMethodValues).optional(),
  recipientEmail: z.string().trim().email().optional().or(z.literal("")).transform((value) => value || undefined)
});

export type DeliveryRules = z.infer<typeof deliveryRulesSchema>;

const referenceRulesSchema = z.object({
  requirePo: z.boolean().default(false),
  requireCustomerReference: z.boolean().default(false),
  labels: normalizedStringArray.default([])
});

export type ReferenceRules = z.infer<typeof referenceRulesSchema>;

export const billingContractProfileRuleBucketsSchema = z.object({
  inspectionRules: pricingRuleBucketSchema.optional(),
  serviceRules: pricingRuleBucketSchema.optional(),
  emergencyRules: pricingRuleBucketSchema.optional(),
  deficiencyRules: pricingRuleBucketSchema.optional(),
  groupingRules: groupingRulesSchema.optional(),
  attachmentRules: attachmentRulesSchema.optional(),
  deliveryRules: deliveryRulesSchema.optional(),
  referenceRules: referenceRulesSchema.optional()
});

export type BillingContractProfileRuleBuckets = z.infer<typeof billingContractProfileRuleBucketsSchema>;

export const billingPayerAccountInputSchema = z.object({
  payerAccountId: z.string().trim().optional(),
  name: z.string().trim().min(1, "Payer account name is required.").max(160),
  contactName: nullableTrimmedString(160),
  billingEmail: z.string().trim().email("Enter a valid payer billing email.").optional().or(z.literal("")).transform((value) => value || undefined),
  phone: nullableTrimmedString(60),
  billingAddressLine1: nullableTrimmedString(160),
  billingAddressLine2: nullableTrimmedString(160),
  billingCity: nullableTrimmedString(120),
  billingState: nullableTrimmedString(120),
  billingPostalCode: nullableTrimmedString(40),
  billingCountry: nullableTrimmedString(120),
  invoiceDeliverySettings: invoiceDeliverySettingsSchema.default({ method: "payer_email" }),
  quickbooksCustomerId: nullableTrimmedString(160),
  externalAccountCode: nullableTrimmedString(120),
  externalReference: nullableTrimmedString(160),
  isActive: z.boolean().default(true)
});

export const billingContractProfileInputSchema = z.object({
  contractProfileId: z.string().trim().optional(),
  payerAccountId: z.string().trim().optional().transform((value) => value || undefined),
  name: z.string().trim().min(1, "Contract profile name is required.").max(160),
  isActive: z.boolean().default(true),
  effectiveStartDate: z.string().trim().min(1, "Effective start date is required."),
  effectiveEndDate: z.string().trim().optional().transform((value) => value || undefined),
  inspectionRules: pricingRuleBucketSchema.optional().default({}),
  serviceRules: pricingRuleBucketSchema.optional().default({}),
  emergencyRules: pricingRuleBucketSchema.optional().default({}),
  deficiencyRules: pricingRuleBucketSchema.optional().default({}),
  groupingRules: groupingRulesSchema.optional().default({ mode: "standard" }),
  attachmentRules: attachmentRulesSchema.optional().default({}),
  deliveryRules: deliveryRulesSchema.optional().default({ holdForManualReview: true }),
  referenceRules: referenceRulesSchema.optional().default({})
});

export type BillingPayerAccountInput = z.infer<typeof billingPayerAccountInputSchema>;
export type BillingContractProfileInput = z.infer<typeof billingContractProfileInputSchema>;

export const customerBillingSettingsInputSchema = z.object({
  billingType: z.enum(billingTypeValues).default("standard"),
  billToAccountId: z.string().trim().optional().transform((value) => value || undefined),
  contractProfileId: z.string().trim().optional().transform((value) => value || undefined),
  invoiceDeliverySettings: invoiceDeliverySettingsSchema.default({ method: "payer_email" }),
  autoBillingEnabled: z.boolean().default(false),
  requiredBillingReferences: requiredBillingReferencesSchema.default({})
});

export type CustomerBillingSettingsInput = z.infer<typeof customerBillingSettingsInputSchema>;

export type BillingPayerAccountRecord = {
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
  billingCountry: string | null;
  invoiceDeliverySettings: InvoiceDeliverySettings;
  quickbooksCustomerId: string | null;
  externalAccountCode: string | null;
  externalReference: string | null;
  isActive: boolean;
};

export type BillingContractProfileRecord = {
  id: string;
  payerAccountId: string | null;
  name: string;
  isActive: boolean;
  effectiveStartDate: Date;
  effectiveEndDate: Date | null;
  inspectionRules: PricingRuleBucket;
  serviceRules: PricingRuleBucket;
  emergencyRules: PricingRuleBucket;
  deficiencyRules: PricingRuleBucket;
  groupingRules: GroupingRules;
  attachmentRules: AttachmentRules;
  deliveryRules: DeliveryRules;
  referenceRules: ReferenceRules;
};

export type ResolvedBillingContext = {
  billingType: BillingTypeValue;
  billToAccount: BillingPayerAccountRecord | null;
  contractProfile: BillingContractProfileRecord | null;
  routing: {
    billToAccountId: string | null;
    billToName: string;
    quickbooksCustomerId: string | null;
  };
  pricing: {
    mode: PricingMode;
    source: string;
    overridesByCode: Record<string, number>;
  };
  grouping: GroupingRules;
  attachments: AttachmentRules;
  delivery: {
    holdForManualReview: boolean;
    deliveryMethod?: DeliveryMethod;
    method: DeliveryMethod;
    recipientEmail: string | null;
  };
  references: ReferenceRules;
  autoBillingEnabled: boolean;
};

const defaultInvoiceDeliverySettings: InvoiceDeliverySettings = { method: "payer_email" };
const defaultRequiredBillingReferences: RequiredBillingReferences = {
  requirePo: false,
  requireCustomerReference: false,
  labels: []
};
const defaultGroupingRules: GroupingRules = { mode: "standard" };
const defaultAttachmentRules: AttachmentRules = {
  requireFinalizedReport: false,
  requireSignedDocument: false,
  requiredDocumentLabels: []
};
const defaultDeliveryRules: DeliveryRules = { holdForManualReview: true };
const defaultReferenceRules: ReferenceRules = {
  requirePo: false,
  requireCustomerReference: false,
  labels: []
};

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function ensureAdmin(parsedActor: ReturnType<typeof parseActor>) {
  if (!["platform_admin", "tenant_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can manage billing configuration.");
  }
}

function parseJsonValue<T>(value: unknown, schema: z.ZodType<T>, fallback: T) {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

function normalizePayerRecord(record: {
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
  billingCountry: string | null;
  invoiceDeliverySettings: unknown;
  quickbooksCustomerId: string | null;
  externalAccountCode: string | null;
  externalReference: string | null;
  isActive: boolean;
}): BillingPayerAccountRecord {
  const parsedInvoiceDeliverySettings = invoiceDeliverySettingsSchema.safeParse(record.invoiceDeliverySettings);
  const invoiceDeliverySettings: InvoiceDeliverySettings = parsedInvoiceDeliverySettings.success
    ? {
        method: parsedInvoiceDeliverySettings.data.method ?? "payer_email",
        recipientEmail: parsedInvoiceDeliverySettings.data.recipientEmail,
        label: parsedInvoiceDeliverySettings.data.label
      }
    : defaultInvoiceDeliverySettings;

  return {
    ...record,
    invoiceDeliverySettings
  };
}

function normalizeContractRecord(record: {
  id: string;
  payerAccountId: string | null;
  name: string;
  isActive: boolean;
  effectiveStartDate: Date;
  effectiveEndDate: Date | null;
  inspectionRules: unknown;
  serviceRules: unknown;
  emergencyRules: unknown;
  deficiencyRules: unknown;
  groupingRules: unknown;
  attachmentRules: unknown;
  deliveryRules: unknown;
  referenceRules: unknown;
}): BillingContractProfileRecord {
  const parsedGroupingRules = groupingRulesSchema.safeParse(record.groupingRules);
  const groupingRules: GroupingRules = parsedGroupingRules.success
    ? {
        mode: parsedGroupingRules.data.mode ?? "standard",
        note: parsedGroupingRules.data.note
      }
    : defaultGroupingRules;
  const parsedAttachmentRules = attachmentRulesSchema.safeParse(record.attachmentRules);
  const attachmentRules: AttachmentRules = parsedAttachmentRules.success
    ? {
        requireFinalizedReport: parsedAttachmentRules.data.requireFinalizedReport ?? false,
        requireSignedDocument: parsedAttachmentRules.data.requireSignedDocument ?? false,
        requiredDocumentLabels: Array.isArray(parsedAttachmentRules.data.requiredDocumentLabels)
          ? parsedAttachmentRules.data.requiredDocumentLabels
          : []
      }
    : defaultAttachmentRules;
  const parsedDeliveryRules = deliveryRulesSchema.safeParse(record.deliveryRules);
  const deliveryRules: DeliveryRules = parsedDeliveryRules.success
    ? {
        holdForManualReview: parsedDeliveryRules.data.holdForManualReview ?? true,
        deliveryMethod: parsedDeliveryRules.data.deliveryMethod,
        recipientEmail: parsedDeliveryRules.data.recipientEmail
      }
    : defaultDeliveryRules;
  const parsedReferenceRules = referenceRulesSchema.safeParse(record.referenceRules);
  const referenceRules: ReferenceRules = parsedReferenceRules.success
    ? {
        requirePo: parsedReferenceRules.data.requirePo ?? false,
        requireCustomerReference: parsedReferenceRules.data.requireCustomerReference ?? false,
        labels: Array.isArray(parsedReferenceRules.data.labels) ? parsedReferenceRules.data.labels : []
      }
    : defaultReferenceRules;

  return {
    ...record,
    inspectionRules: parseJsonValue(record.inspectionRules, pricingRuleBucketSchema, {}),
    serviceRules: parseJsonValue(record.serviceRules, pricingRuleBucketSchema, {}),
    emergencyRules: parseJsonValue(record.emergencyRules, pricingRuleBucketSchema, {}),
    deficiencyRules: parseJsonValue(record.deficiencyRules, pricingRuleBucketSchema, {}),
    groupingRules,
    attachmentRules,
    deliveryRules,
    referenceRules
  };
}

function normalizeCustomerBillingSettings(input: CustomerBillingSettingsInput): CustomerBillingSettingsInput {
  if (input.billingType === "standard") {
    return {
      billingType: "standard",
      billToAccountId: undefined,
      contractProfileId: undefined,
      invoiceDeliverySettings: input.invoiceDeliverySettings,
      autoBillingEnabled: input.autoBillingEnabled,
      requiredBillingReferences: input.requiredBillingReferences
    };
  }

  return input;
}

function isDateWithinRange(date: Date, start: Date, end: Date | null) {
  return date.getTime() >= start.getTime() && (!end || date.getTime() <= end.getTime());
}

async function getValidatedPayerAccount(db: DbClient, tenantId: string, payerAccountId: string | undefined) {
  if (!payerAccountId) {
    return null;
  }

  const payer = await db.billingPayerAccount.findFirst({
    where: {
      id: payerAccountId,
      tenantId
    }
  });

  if (!payer) {
    throw new Error("Selected bill-to payer was not found.");
  }

  if (!payer.isActive) {
    throw new Error("Selected bill-to payer is inactive.");
  }

  return normalizePayerRecord(payer);
}

async function getValidatedContractProfile(
  db: DbClient,
  tenantId: string,
  contractProfileId: string | undefined,
  billingDate: Date,
  payerAccountId?: string | null
) {
  if (!contractProfileId) {
    return null;
  }

  const contract = await db.billingContractProfile.findFirst({
    where: {
      id: contractProfileId,
      tenantId
    }
  });

  if (!contract) {
    throw new Error("Selected contract profile was not found.");
  }

  if (!contract.isActive) {
    throw new Error("Selected contract profile is inactive.");
  }

  if (!isDateWithinRange(billingDate, contract.effectiveStartDate, contract.effectiveEndDate)) {
    throw new Error("Selected contract profile is not effective for this billing date.");
  }

  if (payerAccountId && contract.payerAccountId && contract.payerAccountId !== payerAccountId) {
    throw new Error("Selected contract profile does not belong to the selected payer.");
  }

  return normalizeContractRecord(contract);
}

function resolvePricingBucketKey(input: {
  inspectionClassification?: string | null;
  hasDeficiencyWork?: boolean;
  hasServiceWork?: boolean;
}) {
  if (input.inspectionClassification === "emergency") {
    return "emergencyRules" as const;
  }

  if (input.hasDeficiencyWork) {
    return "deficiencyRules" as const;
  }

  if (input.hasServiceWork) {
    return "serviceRules" as const;
  }

  return "inspectionRules" as const;
}

function resolvePricingOutcome(contractProfile: BillingContractProfileRecord | null, bucketKey: keyof Pick<
  BillingContractProfileRecord,
  "inspectionRules" | "serviceRules" | "emergencyRules" | "deficiencyRules"
>) {
  const bucket = contractProfile?.[bucketKey];
  const fallbackBucket = contractProfile?.serviceRules;
  const overridesByCode = bucket?.codeUnitPrices ?? fallbackBucket?.codeUnitPrices ?? {};

  if (Object.keys(overridesByCode).length > 0) {
    return {
      mode: "contract_rule_override" as const,
      source: bucket?.codeUnitPrices ? bucketKey : "serviceRules",
      overridesByCode
    };
  }

  return {
    mode: "standard" as const,
    source: "existing_standard_billing_logic",
    overridesByCode: {}
  };
}

export function applyBillingContextToItems(items: BillableItem[], context: ResolvedBillingContext) {
  if (!Object.keys(context.pricing.overridesByCode).length) {
    return items;
  }

  return items.map((item) => {
    const billingCode = item.code?.trim();
    if (!billingCode) {
      return item;
    }

    const overrideUnitPrice = context.pricing.overridesByCode[billingCode];
    if (overrideUnitPrice === undefined || overrideUnitPrice === null) {
      return item;
    }

    return {
      ...item,
      unitPrice: overrideUnitPrice,
      amount: Number((item.quantity * overrideUnitPrice).toFixed(2))
    };
  });
}

export async function resolveCustomerBillingContextTx(
  db: DbClient,
  input: {
    tenantId: string;
    customerCompanyId: string;
    billingDate?: Date;
    inspectionClassification?: string | null;
    hasDeficiencyWork?: boolean;
    hasServiceWork?: boolean;
  }
): Promise<ResolvedBillingContext> {
  const billingDate = input.billingDate ?? new Date();
  const customer = await db.customerCompany.findFirst({
    where: {
      id: input.customerCompanyId,
      tenantId: input.tenantId
    }
  });

  if (!customer) {
    throw new Error("Customer billing settings not found.");
  }

  const billingSettings = normalizeCustomerBillingSettings(
    customerBillingSettingsInputSchema.parse({
      billingType: customer.billingType ?? "standard",
      billToAccountId: customer.billToAccountId ?? undefined,
      contractProfileId: customer.contractProfileId ?? undefined,
      invoiceDeliverySettings: customer.invoiceDeliverySettings ?? defaultInvoiceDeliverySettings,
      autoBillingEnabled: customer.autoBillingEnabled ?? false,
      requiredBillingReferences: customer.requiredBillingReferences ?? defaultRequiredBillingReferences
    })
  );

  const payerAccount = await getValidatedPayerAccount(db, input.tenantId, billingSettings.billToAccountId);
  const contractProfile = await getValidatedContractProfile(
    db,
    input.tenantId,
    billingSettings.contractProfileId,
    billingDate,
    payerAccount?.id ?? null
  );

  if (billingSettings.billingType === "third_party" && (!payerAccount || !contractProfile)) {
    throw new Error("Third-party billing requires both an active payer account and an active contract profile.");
  }

  const bucketKey = resolvePricingBucketKey(input);
  const pricing = resolvePricingOutcome(contractProfile, bucketKey);
  const routing = {
    billToAccountId: payerAccount?.id ?? null,
    billToName: payerAccount?.name ?? customer.name,
    quickbooksCustomerId: payerAccount?.quickbooksCustomerId ?? customer.quickbooksCustomerId ?? null
  };
  const deliveryMethod = contractProfile?.deliveryRules.deliveryMethod
    ?? billingSettings.invoiceDeliverySettings.method
    ?? payerAccount?.invoiceDeliverySettings.method
    ?? "payer_email";

  return {
    billingType: billingSettings.billingType,
    billToAccount: payerAccount,
    contractProfile,
    routing,
    pricing,
    grouping: contractProfile?.groupingRules ?? defaultGroupingRules,
    attachments: contractProfile?.attachmentRules ?? defaultAttachmentRules,
    delivery: {
      holdForManualReview: contractProfile?.deliveryRules.holdForManualReview ?? true,
      deliveryMethod: contractProfile?.deliveryRules.deliveryMethod,
      method: deliveryMethod,
      recipientEmail:
        contractProfile?.deliveryRules.recipientEmail
        ?? billingSettings.invoiceDeliverySettings.recipientEmail
        ?? payerAccount?.invoiceDeliverySettings.recipientEmail
        ?? payerAccount?.billingEmail
        ?? customer.billingEmail
        ?? null
    },
    references: contractProfile?.referenceRules ?? billingSettings.requiredBillingReferences,
    autoBillingEnabled: billingSettings.autoBillingEnabled
  };
}

export async function resolveCustomerBillingContext(
  actor: ActorContext,
  input: {
    customerCompanyId: string;
    inspectionId?: string;
    billingDate?: Date;
  }
) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);
  return resolveCustomerBillingContextTx(prisma, {
    tenantId: parsedActor.tenantId as string,
    customerCompanyId: input.customerCompanyId,
    billingDate: input.billingDate
  });
}

export async function validateCustomerBillingSettingsTx(
  db: DbClient,
  input: {
    tenantId: string;
    billingSettings: CustomerBillingSettingsInput;
    billingDate?: Date;
  }
) {
  const billingSettings = normalizeCustomerBillingSettings(customerBillingSettingsInputSchema.parse(input.billingSettings));
  const billingDate = input.billingDate ?? new Date();
  const payerAccount = await getValidatedPayerAccount(db, input.tenantId, billingSettings.billToAccountId);
  const contractProfile = await getValidatedContractProfile(
    db,
    input.tenantId,
    billingSettings.contractProfileId,
    billingDate,
    payerAccount?.id ?? null
  );

  if (billingSettings.billingType === "third_party" && (!payerAccount || !contractProfile)) {
    throw new Error("Third-party billing requires both an active payer account and an active contract profile.");
  }

  return {
    billingSettings,
    payerAccount,
    contractProfile
  };
}

export async function getTenantBillingPayerAccounts(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);
  const rows = await prisma.billingPayerAccount.findMany({
    where: { tenantId: parsedActor.tenantId as string },
    orderBy: [{ isActive: "desc" }, { name: "asc" }]
  });

  return rows.map(normalizePayerRecord);
}

export async function getTenantBillingContractProfiles(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);
  const rows = await prisma.billingContractProfile.findMany({
    where: { tenantId: parsedActor.tenantId as string },
    orderBy: [{ isActive: "desc" }, { effectiveStartDate: "desc" }, { name: "asc" }]
  });

  return rows.map(normalizeContractRecord);
}

export async function createBillingPayerAccount(actor: ActorContext, input: BillingPayerAccountInput) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);
  const parsed = billingPayerAccountInputSchema.parse(input);

  const existing = await prisma.billingPayerAccount.findFirst({
    where: {
      tenantId: parsedActor.tenantId as string,
      name: parsed.name
    },
    select: { id: true }
  });

  if (existing) {
    throw new Error("A bill-to payer with that name already exists.");
  }

  const payer = await prisma.billingPayerAccount.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      name: parsed.name,
      contactName: parsed.contactName ?? null,
      billingEmail: parsed.billingEmail ?? null,
      phone: parsed.phone ?? null,
      billingAddressLine1: parsed.billingAddressLine1 ?? null,
      billingAddressLine2: parsed.billingAddressLine2 ?? null,
      billingCity: parsed.billingCity ?? null,
      billingState: parsed.billingState ?? null,
      billingPostalCode: parsed.billingPostalCode ?? null,
      billingCountry: parsed.billingCountry ?? null,
      invoiceDeliverySettings: parsed.invoiceDeliverySettings as unknown as Prisma.InputJsonValue,
      quickbooksCustomerId: parsed.quickbooksCustomerId ?? null,
      externalAccountCode: parsed.externalAccountCode ?? null,
      externalReference: parsed.externalReference ?? null,
      isActive: parsed.isActive
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "billing.payer_account_created",
      entityType: "BillingPayerAccount",
      entityId: payer.id,
      metadata: { name: payer.name }
    }
  });

  return normalizePayerRecord(payer);
}

export async function updateBillingPayerAccount(actor: ActorContext, input: BillingPayerAccountInput) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);
  const parsed = billingPayerAccountInputSchema.parse(input);

  if (!parsed.payerAccountId) {
    throw new Error("Payer account id is required.");
  }

  const existing = await prisma.billingPayerAccount.findFirst({
    where: {
      id: parsed.payerAccountId,
      tenantId: parsedActor.tenantId as string
    },
    select: { id: true }
  });

  if (!existing) {
    throw new Error("Bill-to payer not found.");
  }

  const conflict = await prisma.billingPayerAccount.findFirst({
    where: {
      tenantId: parsedActor.tenantId as string,
      name: parsed.name,
      NOT: { id: existing.id }
    },
    select: { id: true }
  });

  if (conflict) {
    throw new Error("Another bill-to payer already uses that name.");
  }

  const payer = await prisma.billingPayerAccount.update({
    where: { id: existing.id },
    data: {
      name: parsed.name,
      contactName: parsed.contactName ?? null,
      billingEmail: parsed.billingEmail ?? null,
      phone: parsed.phone ?? null,
      billingAddressLine1: parsed.billingAddressLine1 ?? null,
      billingAddressLine2: parsed.billingAddressLine2 ?? null,
      billingCity: parsed.billingCity ?? null,
      billingState: parsed.billingState ?? null,
      billingPostalCode: parsed.billingPostalCode ?? null,
      billingCountry: parsed.billingCountry ?? null,
      invoiceDeliverySettings: parsed.invoiceDeliverySettings as unknown as Prisma.InputJsonValue,
      quickbooksCustomerId: parsed.quickbooksCustomerId ?? null,
      externalAccountCode: parsed.externalAccountCode ?? null,
      externalReference: parsed.externalReference ?? null,
      isActive: parsed.isActive
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "billing.payer_account_updated",
      entityType: "BillingPayerAccount",
      entityId: payer.id,
      metadata: { name: payer.name }
    }
  });

  return normalizePayerRecord(payer);
}

export async function createBillingContractProfile(actor: ActorContext, input: BillingContractProfileInput) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);
  const parsed = billingContractProfileInputSchema.parse(input);

  const existing = await prisma.billingContractProfile.findFirst({
    where: {
      tenantId: parsedActor.tenantId as string,
      name: parsed.name
    },
    select: { id: true }
  });

  if (existing) {
    throw new Error("A contract profile with that name already exists.");
  }

  if (parsed.payerAccountId) {
    await getValidatedPayerAccount(prisma, parsedActor.tenantId as string, parsed.payerAccountId);
  }

  const profile = await prisma.billingContractProfile.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      payerAccountId: parsed.payerAccountId ?? null,
      name: parsed.name,
      isActive: parsed.isActive,
      effectiveStartDate: new Date(parsed.effectiveStartDate),
      effectiveEndDate: parsed.effectiveEndDate ? new Date(parsed.effectiveEndDate) : null,
      inspectionRules: parsed.inspectionRules as unknown as Prisma.InputJsonValue,
      serviceRules: parsed.serviceRules as unknown as Prisma.InputJsonValue,
      emergencyRules: parsed.emergencyRules as unknown as Prisma.InputJsonValue,
      deficiencyRules: parsed.deficiencyRules as unknown as Prisma.InputJsonValue,
      groupingRules: parsed.groupingRules as unknown as Prisma.InputJsonValue,
      attachmentRules: parsed.attachmentRules as unknown as Prisma.InputJsonValue,
      deliveryRules: parsed.deliveryRules as unknown as Prisma.InputJsonValue,
      referenceRules: parsed.referenceRules as unknown as Prisma.InputJsonValue
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "billing.contract_profile_created",
      entityType: "BillingContractProfile",
      entityId: profile.id,
      metadata: { name: profile.name }
    }
  });

  return normalizeContractRecord(profile);
}

export async function updateBillingContractProfile(actor: ActorContext, input: BillingContractProfileInput) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);
  const parsed = billingContractProfileInputSchema.parse(input);

  if (!parsed.contractProfileId) {
    throw new Error("Contract profile id is required.");
  }

  const existing = await prisma.billingContractProfile.findFirst({
    where: {
      id: parsed.contractProfileId,
      tenantId: parsedActor.tenantId as string
    },
    select: { id: true }
  });

  if (!existing) {
    throw new Error("Contract profile not found.");
  }

  const conflict = await prisma.billingContractProfile.findFirst({
    where: {
      tenantId: parsedActor.tenantId as string,
      name: parsed.name,
      NOT: { id: existing.id }
    },
    select: { id: true }
  });

  if (conflict) {
    throw new Error("Another contract profile already uses that name.");
  }

  if (parsed.payerAccountId) {
    await getValidatedPayerAccount(prisma, parsedActor.tenantId as string, parsed.payerAccountId);
  }

  const profile = await prisma.billingContractProfile.update({
    where: { id: existing.id },
    data: {
      payerAccountId: parsed.payerAccountId ?? null,
      name: parsed.name,
      isActive: parsed.isActive,
      effectiveStartDate: new Date(parsed.effectiveStartDate),
      effectiveEndDate: parsed.effectiveEndDate ? new Date(parsed.effectiveEndDate) : null,
      inspectionRules: parsed.inspectionRules as unknown as Prisma.InputJsonValue,
      serviceRules: parsed.serviceRules as unknown as Prisma.InputJsonValue,
      emergencyRules: parsed.emergencyRules as unknown as Prisma.InputJsonValue,
      deficiencyRules: parsed.deficiencyRules as unknown as Prisma.InputJsonValue,
      groupingRules: parsed.groupingRules as unknown as Prisma.InputJsonValue,
      attachmentRules: parsed.attachmentRules as unknown as Prisma.InputJsonValue,
      deliveryRules: parsed.deliveryRules as unknown as Prisma.InputJsonValue,
      referenceRules: parsed.referenceRules as unknown as Prisma.InputJsonValue
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "billing.contract_profile_updated",
      entityType: "BillingContractProfile",
      entityId: profile.id,
      metadata: { name: profile.name }
    }
  });

  return normalizeContractRecord(profile);
}
