import { addDays, endOfDay, isBefore, setHours, setMinutes, startOfDay } from "date-fns";
import {
  InspectionStatus,
  Prisma,
  QuoteDeliveryStatus,
  QuoteStatus,
  QuoteSyncStatus,
  RecurrenceFrequency
} from "@prisma/client";
import { prisma } from "@testworx/db";
import { z } from "zod";

import type { ActorContext, InspectionType } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { sendQuoteEmail } from "./account-email";
import { getServerEnv } from "./env";
import { inspectionTypeRegistry } from "./report-config";
import { generateQuotePdf } from "./quote-pdf";
import {
  resolveQuickBooksItemForBilling,
  saveQuickBooksItemMappingForCode,
  clearQuickBooksItemMappingForCode,
  syncQuoteToQuickBooksEstimate,
  validateMappedQbItem
} from "./quickbooks";
import { createInspection } from "./scheduling";
import { assertTenantContext } from "./permissions";

const adminRoles = ["platform_admin", "tenant_admin", "office_admin"] as const;
const quoteStatusValues = Object.values(QuoteStatus);
const quoteSyncStatusValues = Object.values(QuoteSyncStatus);

type NormalizedQuoteLineItem = {
  tenantId: string;
  sortOrder: number;
  internalCode: string;
  title: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxable: boolean;
  total: number;
  qbItemId: string | null;
  inspectionType: InspectionType | null;
  category: string | null;
};

const inspectionQuoteCatalog = [
  {
    code: "EXTINGUISHER_ANNUAL",
    title: "Fire extinguisher annual inspection",
    description: "Annual field inspection and tagging for portable fire extinguishers.",
    category: "inspection",
    inspectionType: "fire_extinguisher" as const
  },
  {
    code: "FIRE_ALARM_INSPECTION",
    title: "Fire alarm inspection",
    description: "Inspection and reporting for the fire alarm system.",
    category: "inspection",
    inspectionType: "fire_alarm" as const
  },
  {
    code: "WET_FIRE_SPRINKLER_ANNUAL",
    title: "Wet fire sprinkler annual inspection",
    description: "Annual inspection, testing coordination, and reporting for wet fire sprinkler systems.",
    category: "inspection",
    inspectionType: "wet_fire_sprinkler" as const
  },
  {
    code: "JOINT_COMMISSION_FIRE_SPRINKLER",
    title: "Joint Commission fire sprinkler inspection",
    description: "Joint Commission-oriented fire sprinkler inspection and documentation.",
    category: "inspection",
    inspectionType: "joint_commission_fire_sprinkler" as const
  },
  {
    code: "BACKFLOW_TEST",
    title: "Backflow test",
    description: "Certified backflow testing and documentation.",
    category: "inspection",
    inspectionType: "backflow" as const
  },
  {
    code: "FIRE_PUMP_INSPECTION",
    title: "Fire pump inspection",
    description: "Inspection and operational test for the fire pump system.",
    category: "inspection",
    inspectionType: "fire_pump" as const
  },
  {
    code: "DRY_FIRE_SPRINKLER_ANNUAL",
    title: "Dry fire sprinkler annual inspection",
    description: "Annual inspection, testing coordination, and reporting for dry fire sprinkler systems.",
    category: "inspection",
    inspectionType: "dry_fire_sprinkler" as const
  },
  {
    code: "HOOD_STANDARD",
    title: "Kitchen suppression inspection",
    description: "Standard hood and kitchen suppression inspection service.",
    category: "inspection",
    inspectionType: "kitchen_suppression" as const
  },
  {
    code: "KITCHEN_SUPPRESSION_SEMI_ANNUAL",
    title: "Kitchen suppression semi-annual inspection",
    description: "Semi-annual hood and kitchen suppression inspection service.",
    category: "inspection",
    inspectionType: "kitchen_suppression" as const
  },
  {
    code: "INDUSTRIAL_SUPPRESSION_INSPECTION",
    title: "Industrial suppression inspection",
    description: "Inspection and reporting for industrial suppression systems.",
    category: "inspection",
    inspectionType: "industrial_suppression" as const
  },
  {
    code: "DEFICIENCY_REPAIR",
    title: "Deficiency repair",
    description: "Repair work required to resolve inspection deficiencies.",
    category: "repair",
    inspectionType: null
  },
  {
    code: "EMERGENCY_LIGHTING_SERVICE",
    title: "Emergency and exit lighting service",
    description: "Inspection and service for emergency and exit lighting devices.",
    category: "inspection",
    inspectionType: "emergency_exit_lighting" as const
  }
] as const;

export const quoteCatalog = inspectionQuoteCatalog;

export const quoteLineItemInputSchema = z.object({
  id: z.string().trim().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  internalCode: z.string().trim().min(1, "Select a service code."),
  title: z.string().trim().min(1, "Enter a line item title."),
  description: z.string().trim().max(2000).optional().nullable(),
  quantity: z.coerce.number().positive("Quantity must be greater than zero."),
  unitPrice: z.coerce.number().min(0, "Unit price must be zero or greater."),
  discountAmount: z.coerce.number().min(0).default(0),
  taxable: z.boolean().default(false),
  inspectionType: z.enum(Object.keys(inspectionTypeRegistry) as [keyof typeof inspectionTypeRegistry, ...(keyof typeof inspectionTypeRegistry)[]]).optional().nullable(),
  category: z.string().trim().optional().nullable()
});

export const quoteInputSchema = z.object({
  customerCompanyId: z.string().trim().min(1, "Select a customer."),
  siteId: z.string().trim().optional().nullable(),
  contactName: z.string().trim().max(160).optional().nullable(),
  recipientEmail: z.string().trim().email("Enter a valid recipient email.").optional().nullable(),
  issuedAt: z.coerce.date(),
  expiresAt: z.union([z.coerce.date(), z.null()]).optional().nullable(),
  internalNotes: z.string().trim().max(4000).optional().nullable(),
  customerNotes: z.string().trim().max(4000).optional().nullable(),
  taxAmount: z.coerce.number().min(0).default(0),
  lineItems: z.array(quoteLineItemInputSchema).min(1, "Add at least one quote line item.")
});

export type QuoteInput = z.infer<typeof quoteInputSchema>;

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function assertAdminRole(role: string) {
  if (!adminRoles.includes(role as (typeof adminRoles)[number])) {
    throw new Error("Only administrators can manage quotes.");
  }
}

function formatQuoteStatusLabel(status: QuoteStatus) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export const quoteStatusLabels = Object.fromEntries(quoteStatusValues.map((status) => [status, formatQuoteStatusLabel(status)])) as Record<QuoteStatus, string>;
export const quoteSyncStatusLabels = {
  [QuoteSyncStatus.not_synced]: "Not Synced",
  [QuoteSyncStatus.sync_pending]: "Sync Pending",
  [QuoteSyncStatus.synced]: "Synced",
  [QuoteSyncStatus.sync_error]: "Sync Error"
} satisfies Record<QuoteSyncStatus, string>;

export function getQuoteStatusTone(status: QuoteStatus) {
  switch (status) {
    case QuoteStatus.ready_to_send:
    case QuoteStatus.sent:
    case QuoteStatus.viewed:
      return "blue" as const;
    case QuoteStatus.approved:
    case QuoteStatus.converted:
      return "emerald" as const;
    case QuoteStatus.declined:
    case QuoteStatus.cancelled:
      return "rose" as const;
    case QuoteStatus.expired:
      return "amber" as const;
    case QuoteStatus.draft:
    default:
      return "slate" as const;
  }
}

export function getQuoteSyncTone(status: QuoteSyncStatus) {
  switch (status) {
    case QuoteSyncStatus.synced:
      return "emerald" as const;
    case QuoteSyncStatus.sync_error:
      return "rose" as const;
    case QuoteSyncStatus.sync_pending:
      return "blue" as const;
    case QuoteSyncStatus.not_synced:
    default:
      return "slate" as const;
  }
}

function normalizeNullableString(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function calculateLineTotal(input: { quantity: number; unitPrice: number; discountAmount: number }) {
  return roundMoney(Math.max(0, input.quantity * input.unitPrice - input.discountAmount));
}

function calculateQuoteTotals(lineItems: Array<{ quantity: number; unitPrice: number; discountAmount: number }>, taxAmount: number) {
  const subtotal = roundMoney(lineItems.reduce((sum, line) => sum + calculateLineTotal(line), 0));
  return {
    subtotal,
    taxAmount: roundMoney(taxAmount),
    total: roundMoney(subtotal + taxAmount)
  };
}

function getQuoteCatalogItem(code: string) {
  return quoteCatalog.find((item) => item.code === code) ?? null;
}

async function getTenantQuickBooksIntegrationId(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { quickbooksRealmId: true }
  });

  return tenant?.quickbooksRealmId ?? null;
}

async function resolveMappedQbItemId(tenantId: string, internalCode: string) {
  const integrationId = await getTenantQuickBooksIntegrationId(tenantId);
  if (!integrationId) {
    return null;
  }

  const mapping = await prisma.quickBooksItemMap.findUnique({
    where: {
      tenantId_integrationId_internalCode: {
        tenantId,
        integrationId,
        internalCode
      }
    },
    select: {
      qbItemId: true,
      qbActive: true
    }
  });

  return mapping?.qbActive ? mapping.qbItemId : null;
}

async function normalizeQuoteLineItems(tenantId: string, lineItems: QuoteInput["lineItems"]) {
  const normalized: NormalizedQuoteLineItem[] = [];
  for (const [index, line] of lineItems.entries()) {
    const qbItemId = await resolveMappedQbItemId(tenantId, line.internalCode);
    const catalogItem = getQuoteCatalogItem(line.internalCode);
    normalized.push({
      tenantId,
      sortOrder: index,
      internalCode: line.internalCode,
      title: line.title,
      description: normalizeNullableString(line.description),
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountAmount: line.discountAmount,
      taxable: line.taxable,
      total: calculateLineTotal(line),
      qbItemId,
      inspectionType: line.inspectionType ?? catalogItem?.inspectionType ?? null,
      category: normalizeNullableString(line.category) ?? catalogItem?.category ?? null
    });
  }
  return normalized;
}

async function buildNextQuoteNumber(tenantId: string) {
  const count = await prisma.quote.count({ where: { tenantId } });
  return `Q-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
}

function isQuoteEffectivelyExpired(status: QuoteStatus, expiresAt: Date | null) {
  if (!expiresAt) {
    return false;
  }
  if (([QuoteStatus.approved, QuoteStatus.declined, QuoteStatus.converted, QuoteStatus.cancelled] as QuoteStatus[]).includes(status)) {
    return false;
  }
  return isBefore(endOfDay(expiresAt), new Date());
}

function getEffectiveQuoteStatus(status: QuoteStatus, expiresAt: Date | null) {
  return isQuoteEffectivelyExpired(status, expiresAt) ? QuoteStatus.expired : status;
}

async function createQuoteAuditLog(input: {
  tenantId: string;
  actorUserId: string;
  action: string;
  quoteId: string;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: "Quote",
      entityId: input.quoteId,
      metadata: input.metadata
    }
  });
}

async function getQuoteByIdForTenant(tenantId: string, quoteId: string) {
  return prisma.quote.findFirst({
    where: { id: quoteId, tenantId },
    include: {
      customerCompany: true,
      site: true,
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
      convertedInspection: {
        select: {
          id: true,
          scheduledStart: true,
          status: true
        }
      },
      lineItems: { orderBy: { sortOrder: "asc" } }
    }
  });
}

export async function getQuoteFormOptions(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  assertAdminRole(parsedActor.role);

  const [customers, sites] = await Promise.all([
    prisma.customerCompany.findMany({
      where: { tenantId: parsedActor.tenantId as string, isActive: true },
      select: {
        id: true,
        name: true,
        contactName: true,
        billingEmail: true
      },
      orderBy: { name: "asc" }
    }),
    prisma.site.findMany({
      where: { tenantId: parsedActor.tenantId as string },
      select: {
        id: true,
        name: true,
        city: true,
        customerCompanyId: true
      },
      orderBy: [{ name: "asc" }]
    })
  ]);

  return {
    customers,
    sites,
    catalog: quoteCatalog.map((item) => ({
      ...item,
      inspectionTypeLabel: item.inspectionType ? inspectionTypeRegistry[item.inspectionType].label : null
    }))
  };
}

export async function createQuote(actor: ActorContext, input: QuoteInput) {
  const parsedActor = parseActor(actor);
  assertAdminRole(parsedActor.role);
  const parsedInput = quoteInputSchema.parse(input);

  const lineItems = await normalizeQuoteLineItems(parsedActor.tenantId as string, parsedInput.lineItems);
  const totals = calculateQuoteTotals(lineItems, parsedInput.taxAmount);
  const quoteNumber = await buildNextQuoteNumber(parsedActor.tenantId as string);

  const quote = await prisma.quote.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      quoteNumber,
      customerCompanyId: parsedInput.customerCompanyId,
      siteId: normalizeNullableString(parsedInput.siteId),
      contactName: normalizeNullableString(parsedInput.contactName),
      recipientEmail: normalizeNullableString(parsedInput.recipientEmail),
      issuedAt: parsedInput.issuedAt,
      expiresAt: parsedInput.expiresAt ?? null,
      status: QuoteStatus.draft,
      syncStatus: QuoteSyncStatus.not_synced,
      deliveryStatus: QuoteDeliveryStatus.not_sent,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
      internalNotes: normalizeNullableString(parsedInput.internalNotes),
      customerNotes: normalizeNullableString(parsedInput.customerNotes),
      createdByUserId: parsedActor.userId,
      updatedByUserId: parsedActor.userId,
      lineItems: {
        create: lineItems
      }
    }
  });

  await createQuoteAuditLog({
    tenantId: parsedActor.tenantId as string,
    actorUserId: parsedActor.userId,
    action: "quote.created",
    quoteId: quote.id,
    metadata: { quoteNumber }
  });

  return quote;
}

export async function updateQuote(actor: ActorContext, quoteId: string, input: QuoteInput) {
  const parsedActor = parseActor(actor);
  assertAdminRole(parsedActor.role);
  const parsedInput = quoteInputSchema.parse(input);
  const existing = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId: parsedActor.tenantId as string },
    select: {
      id: true,
      syncStatus: true,
      quickbooksEstimateId: true
    }
  });

  if (!existing) {
    throw new Error("Quote not found.");
  }

  const lineItems = await normalizeQuoteLineItems(parsedActor.tenantId as string, parsedInput.lineItems);
  const totals = calculateQuoteTotals(lineItems, parsedInput.taxAmount);

  const updated = await prisma.quote.update({
    where: { id: quoteId },
    data: {
      customerCompanyId: parsedInput.customerCompanyId,
      siteId: normalizeNullableString(parsedInput.siteId),
      contactName: normalizeNullableString(parsedInput.contactName),
      recipientEmail: normalizeNullableString(parsedInput.recipientEmail),
      issuedAt: parsedInput.issuedAt,
      expiresAt: parsedInput.expiresAt ?? null,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
      internalNotes: normalizeNullableString(parsedInput.internalNotes),
      customerNotes: normalizeNullableString(parsedInput.customerNotes),
      updatedByUserId: parsedActor.userId,
      syncStatus: existing.quickbooksEstimateId ? QuoteSyncStatus.not_synced : existing.syncStatus,
      quickbooksSyncError: null,
      lineItems: {
        deleteMany: {},
        create: lineItems
      }
    }
  });

  await createQuoteAuditLog({
    tenantId: parsedActor.tenantId as string,
    actorUserId: parsedActor.userId,
    action: "quote.edited",
    quoteId,
    metadata: {
      quickbooksEstimateId: existing.quickbooksEstimateId
    }
  });

  return updated;
}

export async function saveQuoteLineItemQuickBooksMapping(actor: ActorContext, input: {
  quoteId: string;
  lineItemId: string;
  internalCode: string;
  internalName: string;
  qbItemId: string;
}) {
  const parsedActor = parseActor(actor);
  assertAdminRole(parsedActor.role);

  const lineItem = await prisma.quoteLineItem.findFirst({
    where: {
      id: input.lineItemId,
      quoteId: input.quoteId,
      tenantId: parsedActor.tenantId as string
    },
    select: {
      id: true,
      internalCode: true
    }
  });

  if (!lineItem) {
    throw new Error("Quote line item not found.");
  }

  await saveQuickBooksItemMappingForCode(actor, {
    internalCode: input.internalCode.trim(),
    internalName: input.internalName.trim(),
    qbItemId: input.qbItemId.trim()
  });

  await prisma.quoteLineItem.update({
    where: { id: lineItem.id },
    data: {
      qbItemId: input.qbItemId.trim()
    }
  });

  await createQuoteAuditLog({
    tenantId: parsedActor.tenantId as string,
    actorUserId: parsedActor.userId,
    action: "quote.line_item_mapping_saved",
    quoteId: input.quoteId,
    metadata: {
      lineItemId: lineItem.id,
      internalCode: lineItem.internalCode,
      qbItemId: input.qbItemId.trim()
    }
  });
}

export async function clearQuoteLineItemQuickBooksMapping(actor: ActorContext, input: {
  quoteId: string;
  lineItemId: string;
  internalCode: string;
}) {
  const parsedActor = parseActor(actor);
  assertAdminRole(parsedActor.role);

  const lineItem = await prisma.quoteLineItem.findFirst({
    where: {
      id: input.lineItemId,
      quoteId: input.quoteId,
      tenantId: parsedActor.tenantId as string
    },
    select: {
      id: true,
      internalCode: true
    }
  });

  if (!lineItem) {
    throw new Error("Quote line item not found.");
  }

  await prisma.quoteLineItem.update({
    where: { id: lineItem.id },
    data: {
      qbItemId: null
    }
  });

  await clearQuickBooksItemMappingForCode(actor, input.internalCode.trim());

  await createQuoteAuditLog({
    tenantId: parsedActor.tenantId as string,
    actorUserId: parsedActor.userId,
    action: "quote.line_item_mapping_cleared",
    quoteId: input.quoteId,
    metadata: {
      lineItemId: lineItem.id,
      internalCode: lineItem.internalCode
    }
  });
}

export async function getQuoteWorkspaceData(
  actor: ActorContext,
  filters?: {
    status?: string | null;
    syncStatus?: string | null;
    query?: string | null;
  }
) {
  const parsedActor = parseActor(actor);
  assertAdminRole(parsedActor.role);
  const quotes = await prisma.quote.findMany({
    where: { tenantId: parsedActor.tenantId as string },
    include: {
      customerCompany: { select: { id: true, name: true } },
      site: { select: { id: true, name: true } },
      lineItems: { orderBy: { sortOrder: "asc" } }
    },
    orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }]
  });

  const normalizedQuery = (filters?.query ?? "").trim().toLowerCase();
  const requestedStatus = (filters?.status ?? "all").trim();
  const requestedSyncStatus = (filters?.syncStatus ?? "all").trim();

  return quotes
    .map((quote) => {
      const effectiveStatus = getEffectiveQuoteStatus(quote.status, quote.expiresAt);
      return {
        ...quote,
        effectiveStatus
      };
    })
    .filter((quote) => requestedStatus === "all" || quote.effectiveStatus === requestedStatus)
    .filter((quote) => requestedSyncStatus === "all" || quote.syncStatus === requestedSyncStatus)
    .filter((quote) => {
      if (!normalizedQuery) {
        return true;
      }
      const haystack = [
        quote.quoteNumber,
        quote.customerCompany.name,
        quote.site?.name ?? "",
        quote.recipientEmail ?? "",
        ...quote.lineItems.map((line) => `${line.internalCode} ${line.title} ${line.description ?? ""}`)
      ].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
}

export async function getQuoteDetail(actor: ActorContext, quoteId: string) {
  const parsedActor = parseActor(actor);
  assertAdminRole(parsedActor.role);

  const [quote, auditLogs, formOptions] = await Promise.all([
    getQuoteByIdForTenant(parsedActor.tenantId as string, quoteId),
    prisma.auditLog.findMany({
      where: {
        tenantId: parsedActor.tenantId as string,
        entityType: "Quote",
        entityId: quoteId
      },
      include: {
        actor: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    getQuoteFormOptions(actor)
  ]);

  if (!quote) {
    return null;
  }

  const integrationId = await getTenantQuickBooksIntegrationId(parsedActor.tenantId as string);
  const lineItems = await Promise.all(quote.lineItems.map(async (line) => {
    let currentQuickBooksItem: {
      qbItemId: string;
      qbItemName: string;
      qbActive: boolean;
    } | null = null;
    let mappingState: {
      status: "mapped" | "needs_mapping";
      suggestions: Array<{ qbItemId: string; qbItemName: string; score: number }>;
      reason?: string;
    } = { status: "mapped", suggestions: [] };

    if (integrationId && !line.qbItemId) {
      const validated = await validateMappedQbItem({
        tenantId: parsedActor.tenantId as string,
        integrationId,
        internalCode: line.internalCode
      }).catch(() => ({ ok: false as const, reason: "missing_mapping" as const }));
      const validatedItem = validated.ok ? validated.item ?? null : null;
      if (validatedItem) {
        currentQuickBooksItem = {
          qbItemId: validatedItem.qbItemId,
          qbItemName: validatedItem.qbItemName,
          qbActive: validatedItem.qbActive
        };
      }

      const resolved = await resolveQuickBooksItemForBilling({
        tenantId: parsedActor.tenantId as string,
        integrationId,
        billingCode: line.internalCode,
        displayName: line.title
      });
      mappingState = resolved.status === "mapped"
        ? { status: "mapped", suggestions: [] }
        : { status: "needs_mapping", suggestions: resolved.suggestions, reason: resolved.reason };
    } else if (integrationId && line.qbItemId) {
      const cached = await prisma.quickBooksItemCache.findUnique({
        where: {
          tenantId_integrationId_qbItemId: {
            tenantId: parsedActor.tenantId as string,
            integrationId,
            qbItemId: line.qbItemId
          }
        },
        select: {
          qbItemId: true,
          qbItemName: true,
          qbActive: true
        }
      }).catch(() => null);

      if (cached) {
        currentQuickBooksItem = {
          qbItemId: cached.qbItemId,
          qbItemName: cached.qbItemName,
          qbActive: cached.qbActive
        };
      }

      const validated = await validateMappedQbItem({
        tenantId: parsedActor.tenantId as string,
        integrationId,
        internalCode: line.internalCode
      }).catch(() => ({ ok: false as const, reason: "missing_mapping" as const }));

      if (!validated.ok) {
        const resolved = await resolveQuickBooksItemForBilling({
          tenantId: parsedActor.tenantId as string,
          integrationId,
          billingCode: line.internalCode,
          displayName: line.title
        });
        if (resolved.status !== "mapped") {
          mappingState = { status: "needs_mapping", suggestions: resolved.suggestions, reason: resolved.reason };
        }
      }
    }

    return {
      ...line,
      currentQuickBooksItem,
      mappingState
    };
  }));

  return {
    ...quote,
    effectiveStatus: getEffectiveQuoteStatus(quote.status, quote.expiresAt),
    lineItems,
    auditLogs,
    formOptions
  };
}

export async function getAuthorizedQuotePdf(actor: ActorContext, quoteId: string) {
  const parsedActor = parseActor(actor);
  const where =
    parsedActor.role === "customer_user"
      ? {
          id: quoteId,
          tenantId: parsedActor.tenantId as string,
          customerCompany: {
            users: { some: { id: parsedActor.userId } }
          }
        }
      : {
          id: quoteId,
          tenantId: parsedActor.tenantId as string
        };

  const quote = await prisma.quote.findFirst({
    where,
    include: {
      customerCompany: true,
      site: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      tenant: {
        select: {
          name: true,
          branding: true,
          billingEmail: true
        }
      }
    }
  });

  if (!quote) {
    throw new Error("Quote not found.");
  }

  const pdfBytes = await generateQuotePdf({
    tenant: quote.tenant,
    quote: {
      quoteNumber: quote.quoteNumber,
      recipientEmail: quote.recipientEmail,
      issuedAt: quote.issuedAt,
      expiresAt: quote.expiresAt,
      status: quote.status,
      customerNotes: quote.customerNotes,
      subtotal: quote.subtotal,
      taxAmount: quote.taxAmount,
      total: quote.total
    },
    customerCompany: {
      name: quote.customerCompany.name,
      contactName: quote.contactName ?? quote.customerCompany.contactName,
      billingEmail: quote.recipientEmail ?? quote.customerCompany.billingEmail,
      phone: quote.customerCompany.phone
    },
    site: quote.site
      ? {
          name: quote.site.name,
          addressLine1: quote.site.addressLine1,
          addressLine2: quote.site.addressLine2,
          city: quote.site.city,
          state: quote.site.state,
          postalCode: quote.site.postalCode
        }
      : null,
    lineItems: quote.lineItems.map((line) => ({
      title: line.title,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountAmount: line.discountAmount,
      total: line.total
    }))
  });

  return {
    fileName: `${quote.quoteNumber}.pdf`,
    mimeType: "application/pdf",
    pdfBytes
  };
}

export async function sendQuote(actor: ActorContext, quoteId: string, input?: { recipientEmail?: string | null; subject?: string | null; message?: string | null }) {
  const parsedActor = parseActor(actor);
  assertAdminRole(parsedActor.role);
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId: parsedActor.tenantId as string },
    include: {
      customerCompany: true,
      site: true,
      tenant: {
        select: {
          name: true,
          branding: true,
          billingEmail: true
        }
      },
      lineItems: { orderBy: { sortOrder: "asc" } }
    }
  });

  if (!quote) {
    throw new Error("Quote not found.");
  }

  const recipientEmail = normalizeNullableString(input?.recipientEmail) ?? quote.recipientEmail ?? quote.customerCompany.billingEmail;
  if (!recipientEmail) {
    throw new Error("Add a recipient email before sending this quote.");
  }

  const { pdfBytes, fileName } = await getAuthorizedQuotePdf(actor, quoteId);
  const appUrl = getServerEnv().APP_URL;
  const customerUrl = `${appUrl}/app/customer/quotes/${quote.id}`;
  const subject = normalizeNullableString(input?.subject) ?? `Quote ${quote.quoteNumber} from ${quote.tenant.name}`;
  const body = normalizeNullableString(input?.message)
    ?? `Please review quote ${quote.quoteNumber}. You can review it in the customer portal or from the attached PDF.`;

  await prisma.quote.update({
    where: { id: quote.id },
    data: {
      deliveryStatus: QuoteDeliveryStatus.pending,
      deliverySubject: subject,
      deliveryBody: body,
      lastDeliveryError: null
    }
  });

  const delivery = await sendQuoteEmail({
    recipientEmail,
    recipientName: quote.contactName ?? quote.customerCompany.contactName ?? quote.customerCompany.name,
    tenantName: quote.tenant.name,
    quoteNumber: quote.quoteNumber,
    customerName: quote.customerCompany.name,
    siteName: quote.site?.name ?? null,
    quoteUrl: customerUrl,
    subjectLine: subject,
    messageBody: body,
    attachment: {
      fileName,
      content: Buffer.from(pdfBytes).toString("base64")
    }
  });

  const nextStatus = quote.status === QuoteStatus.draft ? QuoteStatus.sent : quote.status === QuoteStatus.ready_to_send ? QuoteStatus.sent : quote.status;
  await prisma.quote.update({
    where: { id: quote.id },
    data: {
      status: nextStatus,
      deliveryStatus: delivery.sent ? QuoteDeliveryStatus.sent : QuoteDeliveryStatus.error,
      sentAt: delivery.sent ? new Date() : quote.sentAt,
      lastSentToEmail: recipientEmail,
      lastDeliveryMessageId: delivery.messageId,
      lastDeliveryError: delivery.error,
      deliveryAttempts: { increment: 1 },
      recipientEmail,
      updatedByUserId: parsedActor.userId
    }
  });

  await createQuoteAuditLog({
    tenantId: parsedActor.tenantId as string,
    actorUserId: parsedActor.userId,
    action: delivery.sent ? (quote.sentAt ? "quote.resent" : "quote.sent") : "quote.send_failed",
    quoteId: quote.id,
    metadata: {
      recipientEmail,
      provider: delivery.provider,
      reason: delivery.reason,
      error: delivery.error
    }
  });

  if (!delivery.sent) {
    throw new Error(delivery.error ?? "Quote email failed to send.");
  }

  return delivery;
}

export async function updateQuoteStatus(
  actor: ActorContext,
  quoteId: string,
  status: QuoteStatus,
  options?: { note?: string | null }
) {
  const parsedActor = parseActor(actor);
  assertAdminRole(parsedActor.role);

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId: parsedActor.tenantId as string },
    select: { id: true, status: true }
  });

  if (!quote) {
    throw new Error("Quote not found.");
  }

  const now = new Date();
  const data: Prisma.QuoteUpdateInput = {
    status,
    updatedBy: { connect: { id: parsedActor.userId } },
    approvedAt: status === QuoteStatus.approved ? now : quote.status === QuoteStatus.approved ? null : undefined,
    declinedAt: status === QuoteStatus.declined ? now : quote.status === QuoteStatus.declined ? null : undefined
  };

  await prisma.quote.update({
    where: { id: quote.id },
    data
  });

  await createQuoteAuditLog({
    tenantId: parsedActor.tenantId as string,
    actorUserId: parsedActor.userId,
    action: "quote.status_updated",
    quoteId,
    metadata: {
      previousStatus: quote.status,
      nextStatus: status,
      note: normalizeNullableString(options?.note)
    }
  });
}

function defaultConversionStart() {
  const nextDay = addDays(startOfDay(new Date()), 1);
  return setMinutes(setHours(nextDay, 9), 0);
}

export async function convertQuoteToInspection(actor: ActorContext, quoteId: string) {
  const parsedActor = parseActor(actor);
  assertAdminRole(parsedActor.role);
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId: parsedActor.tenantId as string },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } }
  });

  if (!quote) {
    throw new Error("Quote not found.");
  }
  if (quote.convertedInspectionId) {
    throw new Error("This quote has already been converted.");
  }
  if (!quote.siteId) {
    throw new Error("Assign a site before converting this quote into work.");
  }

  const convertibleLines = quote.lineItems.filter((line) => Boolean(line.inspectionType));
  if (convertibleLines.length === 0) {
    throw new Error("Add at least one inspection-linked line item before converting this quote into work.");
  }

  const scheduledStart = defaultConversionStart();
  const inspection = await createInspection(
    { userId: parsedActor.userId, role: parsedActor.role, tenantId: parsedActor.tenantId },
    {
      customerCompanyId: quote.customerCompanyId,
      siteId: quote.siteId,
      inspectionClassification: "standard",
      isPriority: false,
      scheduledStart,
      scheduledEnd: new Date(scheduledStart.getTime() + 60 * 60 * 1000),
      assignedTechnicianIds: [],
      status: InspectionStatus.to_be_completed,
      notes: [`Converted from quote ${quote.quoteNumber}.`, quote.customerNotes ?? ""].filter(Boolean).join("\n"),
      tasks: convertibleLines.map((line) => ({
        inspectionType: line.inspectionType!,
        frequency: RecurrenceFrequency.ONCE,
        assignedTechnicianId: null,
        dueMonth: `${scheduledStart.getFullYear()}-${String(scheduledStart.getMonth() + 1).padStart(2, "0")}`,
        dueDate: scheduledStart,
        schedulingStatus: "not_scheduled" as const,
        notes: line.description ?? line.title
      }))
    }
  );

  await prisma.quote.update({
    where: { id: quote.id },
    data: {
      status: QuoteStatus.converted,
      convertedAt: new Date(),
      convertedInspectionId: inspection.id,
      updatedByUserId: parsedActor.userId
    }
  });

  await createQuoteAuditLog({
    tenantId: parsedActor.tenantId as string,
    actorUserId: parsedActor.userId,
    action: "quote.converted",
    quoteId: quote.id,
    metadata: {
      inspectionId: inspection.id
    }
  });

  return inspection;
}

export async function getCustomerQuoteList(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  if (parsedActor.role !== "customer_user") {
    throw new Error("Customer access required.");
  }

  const user = await prisma.user.findFirst({
    where: { id: parsedActor.userId, tenantId: parsedActor.tenantId as string },
    select: { customerCompanyId: true }
  });
  if (!user?.customerCompanyId) {
    throw new Error("Customer company access is required.");
  }

  const quotes = await prisma.quote.findMany({
    where: {
      tenantId: parsedActor.tenantId as string,
      customerCompanyId: user.customerCompanyId,
      status: {
        notIn: [QuoteStatus.draft, QuoteStatus.cancelled]
      }
    },
    include: {
      site: { select: { id: true, name: true } }
    },
    orderBy: [{ issuedAt: "desc" }]
  });

  return quotes.map((quote) => ({
    ...quote,
    effectiveStatus: getEffectiveQuoteStatus(quote.status, quote.expiresAt)
  }));
}

export async function getCustomerQuoteDetail(actor: ActorContext, quoteId: string) {
  const parsedActor = parseActor(actor);
  if (parsedActor.role !== "customer_user") {
    throw new Error("Customer access required.");
  }

  const user = await prisma.user.findFirst({
    where: { id: parsedActor.userId, tenantId: parsedActor.tenantId as string },
    select: { customerCompanyId: true }
  });
  if (!user?.customerCompanyId) {
    throw new Error("Customer company access is required.");
  }

  const quote = await prisma.quote.findFirst({
    where: {
      id: quoteId,
      tenantId: parsedActor.tenantId as string,
      customerCompanyId: user.customerCompanyId,
      status: {
        notIn: [QuoteStatus.draft, QuoteStatus.cancelled]
      }
    },
    include: {
      customerCompany: true,
      site: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      tenant: {
        select: {
          name: true,
          branding: true,
          billingEmail: true
        }
      }
    }
  });

  if (!quote) {
    return null;
  }

  if (!quote.viewedAt) {
    await prisma.quote.update({
      where: { id: quote.id },
      data: {
        viewedAt: new Date(),
        status: quote.status === QuoteStatus.sent ? QuoteStatus.viewed : quote.status
      }
    });
  }

  const effectiveViewedStatus = !quote.viewedAt && quote.status === QuoteStatus.sent
    ? QuoteStatus.viewed
    : quote.status;

  return {
    ...quote,
    status: effectiveViewedStatus,
    effectiveStatus: getEffectiveQuoteStatus(effectiveViewedStatus, quote.expiresAt)
  };
}
