import { addBusinessDays, addDays, endOfDay, isBefore, setHours, setMinutes, startOfDay, subDays } from "date-fns";
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
import type { QuoteReminderDispatchStatus, QuoteReminderType } from "@prisma/client";

import { sendQuoteEmail, sendQuoteReminderEmail } from "./account-email";
import { resolveTenantBranding } from "./branding";
import { getServerEnv } from "./env";
import { buildQuoteEmailDefaultMessage, buildQuoteEmailSubject } from "./quote-email";
import { getDefaultQuoteExpirationDate } from "./quote-terms";
import { inspectionTypeRegistry } from "./report-config";
import { generateQuotePdf } from "./quote-pdf";
import { resolveServiceFeeForLocationTx } from "./service-fees";
import {
  resolveQuickBooksItemForBilling,
  saveQuickBooksItemMappingForCode,
  clearQuickBooksItemMappingForCode,
  syncQuoteToQuickBooksEstimate,
  validateMappedQbItem
} from "./quickbooks";
import { createInspection, getCustomerFacingSiteLabel } from "./scheduling";
import { assertTenantContext } from "./permissions";

const quoteStatusValues = Object.values(QuoteStatus);
const quoteSyncStatusValues = Object.values(QuoteSyncStatus);
const closedQuoteStatuses: QuoteStatus[] = [QuoteStatus.approved, QuoteStatus.declined, QuoteStatus.converted, QuoteStatus.cancelled];
const actionableQuoteStatuses: QuoteStatus[] = [QuoteStatus.sent, QuoteStatus.viewed, QuoteStatus.ready_to_send];
const quoteReminderTypeValues = {
  sent_not_viewed_first: "sent_not_viewed_first",
  sent_not_viewed_second: "sent_not_viewed_second",
  viewed_pending_first: "viewed_pending_first",
  viewed_pending_second: "viewed_pending_second",
  expiring_soon: "expiring_soon",
  expired_follow_up: "expired_follow_up",
  manual_follow_up: "manual_follow_up"
} as const satisfies Record<string, QuoteReminderType>;
const quoteReminderDispatchStatusValues = {
  pending: "pending",
  sent: "sent",
  skipped: "skipped",
  failed: "failed"
} as const satisfies Record<string, QuoteReminderDispatchStatus>;

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

function toCustomerFacingQuoteSite<T extends {
  name: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}>(site: T | null) {
  if (!site) {
    return null;
  }

  const customerFacingSiteName = getCustomerFacingSiteLabel(site.name);
  if (!customerFacingSiteName) {
    return null;
  }

  return {
    ...site,
    name: customerFacingSiteName
  };
}

type QuoteLineItemDraft = QuoteInput["lineItems"][number];

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
const quickBooksQuoteCodePrefix = "QBO_ITEM:";
const autoQuoteServiceFeeCategory = "service_fee";
export const quoteProposalTypeValues = [
  "fire_alarm",
  "fire_sprinkler",
  "kitchen_suppression",
  "fire_extinguisher",
  "industrial_suppression",
  "emergency_exit_lighting",
  "general_fire_protection"
] as const;
export type QuoteProposalType = (typeof quoteProposalTypeValues)[number];
export const quoteProposalTypeLabels: Record<QuoteProposalType, string> = {
  fire_alarm: "Fire Alarm System",
  fire_sprinkler: "Fire Sprinkler System",
  kitchen_suppression: "Kitchen Suppression System",
  fire_extinguisher: "Fire Extinguisher Service",
  industrial_suppression: "Industrial Suppression System",
  emergency_exit_lighting: "Emergency and Exit Lighting",
  general_fire_protection: "General Fire Protection"
};
export const quoteProposalTypes = quoteProposalTypeValues.map((value) => ({
  value,
  label: quoteProposalTypeLabels[value]
}));

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
  customSiteName: z.string().trim().max(160).optional().nullable(),
  contactName: z.string().trim().max(160).optional().nullable(),
  recipientEmail: z.string().trim().email("Enter a valid recipient email.").optional().nullable(),
  proposalType: z.enum(quoteProposalTypeValues).optional().nullable(),
  issuedAt: z.coerce.date(),
  expiresAt: z.union([z.coerce.date(), z.null()]).optional().nullable(),
  internalNotes: z.string().trim().max(4000).optional().nullable(),
  customerNotes: z.string().trim().max(4000).optional().nullable(),
  taxAmount: z.coerce.number().min(0).default(0),
  lineItems: z.array(quoteLineItemInputSchema).min(1, "Add at least one quote line item.")
});

export type QuoteInput = z.infer<typeof quoteInputSchema>;

function normalizeQuoteCustomSiteName(input: {
  siteId?: string | null;
  customSiteName?: string | null;
}) {
  if (normalizeNullableString(input.siteId)) {
    return null;
  }

  return normalizeNullableString(input.customSiteName);
}

function buildQuoteSiteRecord(input: {
  siteId?: string | null;
  site?: {
    id: string;
    name: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
  } | null;
  customSiteName?: string | null;
}) {
  if (input.site) {
    return input.site;
  }

  const customSiteName = normalizeNullableString(input.customSiteName);
  if (customSiteName) {
    return {
      id: input.siteId ?? `custom:${customSiteName}`,
      name: customSiteName,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null
    };
  }

  if (input.siteId) {
    return {
      id: input.siteId,
      name: "Archived site",
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null
    };
  }

  return null;
}

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

export function hasQuoteManagementAccess(input: {
  role: string;
  allowances?: Record<string, boolean> | null;
}) {
  if (input.role === "platform_admin" || input.role === "tenant_admin") {
    return true;
  }

  if (input.role === "office_admin") {
    return input.allowances?.quoteAccess ?? true;
  }

  return input.allowances?.quoteAccess ?? false;
}

function assertQuoteManagementAccess(actor: Pick<ActorContext, "role" | "allowances">) {
  if (!hasQuoteManagementAccess({ role: actor.role, allowances: actor.allowances })) {
    throw new Error("Your account does not have quote access.");
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

export const hostedQuoteStateLabels = {
  available: "Available",
  approved: "Approved",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
  unavailable: "Unavailable"
} as const;

export const quoteReminderTypeLabels = {
  [quoteReminderTypeValues.sent_not_viewed_first]: "Sent, not viewed",
  [quoteReminderTypeValues.sent_not_viewed_second]: "Sent, not viewed follow-up",
  [quoteReminderTypeValues.viewed_pending_first]: "Viewed, pending approval",
  [quoteReminderTypeValues.viewed_pending_second]: "Viewed, pending follow-up",
  [quoteReminderTypeValues.expiring_soon]: "Expiring soon",
  [quoteReminderTypeValues.expired_follow_up]: "Expired",
  [quoteReminderTypeValues.manual_follow_up]: "Manual follow-up"
} satisfies Record<QuoteReminderType, string>;

export const quoteReminderStageLabels = {
  sent_not_viewed_first: "Awaiting first review",
  sent_not_viewed_second: "Second review follow-up scheduled",
  viewed_pending_first: "Viewed, awaiting approval",
  viewed_pending_second: "Approval follow-up scheduled",
  expiring_soon: "Expiring soon",
  expired_follow_up: "Expired follow-up scheduled",
  paused: "Paused",
  disabled: "Disabled",
  expired_closed: "Expired"
} as const satisfies Record<string, string>;

export function formatQuoteReminderStage(stage: string | null | undefined) {
  const normalized = normalizeNullableString(stage);
  if (!normalized) {
    return "—";
  }

  return quoteReminderStageLabels[normalized as keyof typeof quoteReminderStageLabels]
    ?? normalized.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

const quoteReminderTemplateKeys = [
  "sentNotViewed",
  "viewedPending",
  "expiringSoon",
  "expired"
] as const;

const quoteReminderSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  sentNotViewedFirstBusinessDays: z.number().int().min(1).max(30).default(2),
  sentNotViewedSecondBusinessDays: z.number().int().min(1).max(30).default(5),
  viewedPendingFirstBusinessDays: z.number().int().min(1).max(30).default(2),
  viewedPendingSecondBusinessDays: z.number().int().min(1).max(30).default(5),
  expiringSoonDays: z.number().int().min(1).max(30).default(2),
  expiredFollowUpEnabled: z.boolean().default(true),
  expiredFollowUpDays: z.number().int().min(1).max(30).default(1),
  maxAutoReminders: z.number().int().min(1).max(6).default(5),
  templates: z.object({
    sentNotViewed: z.object({
      subject: z.string().trim().min(1).max(200).default("Reminder: quote {{quoteNumber}} is ready to review"),
      body: z.string().trim().min(1).max(2000).default("We wanted to follow up on the quote we sent over. You can review the details and approve online here.")
    }).default({
      subject: "Reminder: quote {{quoteNumber}} is ready to review",
      body: "We wanted to follow up on the quote we sent over. You can review the details and approve online here."
    }),
    viewedPending: z.object({
      subject: z.string().trim().min(1).max(200).default("Reminder: quote {{quoteNumber}} is ready when you are"),
      body: z.string().trim().min(1).max(2000).default("We noticed you’ve had a chance to review your quote. When you’re ready, you can approve it online and we’ll move forward.")
    }).default({
      subject: "Reminder: quote {{quoteNumber}} is ready when you are",
      body: "We noticed you’ve had a chance to review your quote. When you’re ready, you can approve it online and we’ll move forward."
    }),
    expiringSoon: z.object({
      subject: z.string().trim().min(1).max(200).default("Reminder: quote {{quoteNumber}} is expiring soon"),
      body: z.string().trim().min(1).max(2000).default("Your quote is set to expire soon. Review and approve it here if you’d like to move forward.")
    }).default({
      subject: "Reminder: quote {{quoteNumber}} is expiring soon",
      body: "Your quote is set to expire soon. Review and approve it here if you’d like to move forward."
    }),
    expired: z.object({
      subject: z.string().trim().min(1).max(200).default("Quote {{quoteNumber}} has expired"),
      body: z.string().trim().min(1).max(2000).default("This quote has expired, but we’d be happy to update or reissue it if needed.")
    }).default({
      subject: "Quote {{quoteNumber}} has expired",
      body: "This quote has expired, but we’d be happy to update or reissue it if needed."
    })
  }).default({
    sentNotViewed: {
      subject: "Reminder: quote {{quoteNumber}} is ready to review",
      body: "We wanted to follow up on the quote we sent over. You can review the details and approve online here."
    },
    viewedPending: {
      subject: "Reminder: quote {{quoteNumber}} is ready when you are",
      body: "We noticed you’ve had a chance to review your quote. When you’re ready, you can approve it online and we’ll move forward."
    },
    expiringSoon: {
      subject: "Reminder: quote {{quoteNumber}} is expiring soon",
      body: "Your quote is set to expire soon. Review and approve it here if you’d like to move forward."
    },
    expired: {
      subject: "Quote {{quoteNumber}} has expired",
      body: "This quote has expired, but we’d be happy to update or reissue it if needed."
    }
  })
});

export type QuoteReminderSettings = z.infer<typeof quoteReminderSettingsSchema>;

export const quoteReminderSettingsInputSchema = quoteReminderSettingsSchema.extend({
  templates: quoteReminderSettingsSchema.shape.templates
});

export type QuoteReminderSettingsInput = z.infer<typeof quoteReminderSettingsInputSchema>;

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

function normalizeEmailList(value: string | null | undefined) {
  const normalized = (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (normalized.length === 0) {
    return [] as string[];
  }

  const seen = new Set<string>();
  const unique = normalized.filter((email) => {
    const lower = email.toLowerCase();
    if (seen.has(lower)) {
      return false;
    }
    seen.add(lower);
    return true;
  });

  for (const email of unique) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`Enter a valid CC email address. "${email}" is not valid.`);
    }
  }

  return unique;
}

function getDefaultQuoteReminderSettings(): QuoteReminderSettings {
  return quoteReminderSettingsSchema.parse({});
}

function normalizeQuoteReminderSettings(value: unknown): QuoteReminderSettings {
  const parsed = quoteReminderSettingsSchema.safeParse(value ?? {});
  if (!parsed.success) {
    return getDefaultQuoteReminderSettings();
  }
  return parsed.data;
}

function interpolateReminderTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? "");
}

type ReminderEvaluationQuote = {
  id: string;
  status: QuoteStatus;
  sentAt: Date | null;
  firstViewedAt: Date | null;
  expiresAt: Date | null;
  approvedAt: Date | null;
  declinedAt: Date | null;
  convertedAt: Date | null;
  remindersEnabled: boolean;
  remindersPausedAt: Date | null;
  reminderCount: number;
};

type QuoteReminderStageEvaluation = {
  type: QuoteReminderType;
  scheduledFor: Date;
  stageLabel: string;
  templateKey: (typeof quoteReminderTemplateKeys)[number];
  dedupeKey: string;
};

function isQuoteClosedForReminders(quote: ReminderEvaluationQuote) {
  const effectiveStatus = getEffectiveQuoteStatus(quote.status, quote.expiresAt);
  return closedQuoteStatuses.includes(effectiveStatus) || effectiveStatus === QuoteStatus.expired;
}

function evaluateQuoteReminderStage(
  quote: ReminderEvaluationQuote,
  settings: QuoteReminderSettings,
  existingDedupeKeys: Set<string>
): QuoteReminderStageEvaluation | null {
  if (!settings.enabled || !quote.remindersEnabled || quote.remindersPausedAt || isQuoteClosedForReminders(quote)) {
    return null;
  }

  const effectiveStatus = getEffectiveQuoteStatus(quote.status, quote.expiresAt);
  if (!actionableQuoteStatuses.includes(effectiveStatus)) {
    return null;
  }

  const dueCandidates: QuoteReminderStageEvaluation[] = [];

  if (quote.sentAt && !quote.firstViewedAt) {
    const first = addBusinessDays(quote.sentAt, settings.sentNotViewedFirstBusinessDays);
    dueCandidates.push({
      type: quoteReminderTypeValues.sent_not_viewed_first,
      scheduledFor: first,
      stageLabel: "sent_not_viewed_first",
      templateKey: "sentNotViewed",
      dedupeKey: `${quote.id}:${quoteReminderTypeValues.sent_not_viewed_first}`
    });

    const second = addBusinessDays(quote.sentAt, settings.sentNotViewedSecondBusinessDays);
    dueCandidates.push({
      type: quoteReminderTypeValues.sent_not_viewed_second,
      scheduledFor: second,
      stageLabel: "sent_not_viewed_second",
      templateKey: "sentNotViewed",
      dedupeKey: `${quote.id}:${quoteReminderTypeValues.sent_not_viewed_second}`
    });
  }

  if (quote.firstViewedAt && !quote.approvedAt && !quote.declinedAt) {
    const first = addBusinessDays(quote.firstViewedAt, settings.viewedPendingFirstBusinessDays);
    dueCandidates.push({
      type: quoteReminderTypeValues.viewed_pending_first,
      scheduledFor: first,
      stageLabel: "viewed_pending_first",
      templateKey: "viewedPending",
      dedupeKey: `${quote.id}:${quoteReminderTypeValues.viewed_pending_first}`
    });

    const second = addBusinessDays(quote.firstViewedAt, settings.viewedPendingSecondBusinessDays);
    dueCandidates.push({
      type: quoteReminderTypeValues.viewed_pending_second,
      scheduledFor: second,
      stageLabel: "viewed_pending_second",
      templateKey: "viewedPending",
      dedupeKey: `${quote.id}:${quoteReminderTypeValues.viewed_pending_second}`
    });
  }

  if (quote.expiresAt) {
    const expirationReminderDate = startOfDay(subDays(quote.expiresAt, settings.expiringSoonDays));
    dueCandidates.push({
      type: quoteReminderTypeValues.expiring_soon,
      scheduledFor: expirationReminderDate,
      stageLabel: "expiring_soon",
      templateKey: "expiringSoon",
      dedupeKey: `${quote.id}:${quoteReminderTypeValues.expiring_soon}`
    });
  }

  const autoCandidates = dueCandidates
    .filter((candidate) => !existingDedupeKeys.has(candidate.dedupeKey))
    .sort((left, right) => left.scheduledFor.getTime() - right.scheduledFor.getTime());

  const limitedCandidates = autoCandidates.slice(0, Math.max(1, settings.maxAutoReminders));
  return limitedCandidates[0] ?? null;
}

function buildExpiredFollowUpSchedule(quote: ReminderEvaluationQuote, settings: QuoteReminderSettings) {
  if (!settings.enabled || !settings.expiredFollowUpEnabled || !quote.remindersEnabled || quote.remindersPausedAt || !quote.expiresAt) {
    return null;
  }
  if (quote.approvedAt || quote.declinedAt || quote.convertedAt || quote.status === QuoteStatus.cancelled) {
    return null;
  }
  if (!isQuoteEffectivelyExpired(quote.status, quote.expiresAt)) {
    return null;
  }
  return {
    type: quoteReminderTypeValues.expired_follow_up,
    scheduledFor: addDays(endOfDay(quote.expiresAt), settings.expiredFollowUpDays),
    stageLabel: "expired_follow_up",
    templateKey: "expired",
    dedupeKey: `${quote.id}:${quoteReminderTypeValues.expired_follow_up}`
  } satisfies QuoteReminderStageEvaluation;
}

function createQuoteAccessToken() {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildQuoteAccessUrl(token: string) {
  return `${getServerEnv().APP_URL}/quote/${token}`;
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

function buildQuickBooksQuoteCatalogCode(qbItemId: string) {
  return `${quickBooksQuoteCodePrefix}${qbItemId}`;
}

function buildQuickBooksQuoteCatalogDescription(item: {
  sku: string | null;
}) {
  const sku = normalizeNullableString(item.sku);
  return sku ? `SKU ${sku}` : "";
}

function resolveDirectQuickBooksItemId(code: string) {
  return code.startsWith(quickBooksQuoteCodePrefix) ? code.slice(quickBooksQuoteCodePrefix.length) : null;
}

async function getTenantQuickBooksIntegrationId(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { quickbooksRealmId: true }
  });

  return tenant?.quickbooksRealmId ?? null;
}

async function getTenantQuoteReminderSettingsByTenantId(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { quoteReminderSettings: true }
  });

  return normalizeQuoteReminderSettings(tenant?.quoteReminderSettings);
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
    const directQbItemId = resolveDirectQuickBooksItemId(line.internalCode);
    const qbItemId = directQbItemId ?? await resolveMappedQbItemId(tenantId, line.internalCode);
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

function isAutoManagedQuoteServiceFeeLine(line: QuoteLineItemDraft) {
  return normalizeNullableString(line.category) === autoQuoteServiceFeeCategory
    && line.internalCode.trim().toUpperCase().startsWith("SERVICE_FEE");
}

async function resolveQuoteServiceFeeLocation(input: {
  tenantId: string;
  customerCompanyId: string;
  siteId?: string | null;
}) {
  if (input.siteId) {
    const site = await prisma.site.findFirst({
      where: {
        tenantId: input.tenantId,
        id: input.siteId
      },
      select: {
        id: true,
        city: true,
        state: true,
        postalCode: true
      }
    });

    if (site) {
      return {
        customerCompanyId: input.customerCompanyId,
        siteId: site.id,
        location: {
          city: site.city,
          state: site.state,
          postalCode: site.postalCode
        }
      };
    }
  }

  const customer = await prisma.customerCompany.findFirst({
    where: {
      tenantId: input.tenantId,
      id: input.customerCompanyId
    },
    select: {
      serviceCity: true,
      serviceState: true,
      servicePostalCode: true
    }
  });

  return {
    customerCompanyId: input.customerCompanyId,
    siteId: null,
    location: {
      city: customer?.serviceCity ?? null,
      state: customer?.serviceState ?? null,
      postalCode: customer?.servicePostalCode ?? null
    }
  };
}

async function buildQuoteLineItemsForSave(input: {
  tenantId: string;
  customerCompanyId: string;
  siteId?: string | null;
  lineItems: QuoteInput["lineItems"];
}) {
  const baseLineItems = input.lineItems.filter((line) => !isAutoManagedQuoteServiceFeeLine(line));
  const serviceFeeContext = await resolveQuoteServiceFeeLocation({
    tenantId: input.tenantId,
    customerCompanyId: input.customerCompanyId,
    siteId: input.siteId
  });
  const serviceFee = await resolveServiceFeeForLocationTx(prisma, {
    tenantId: input.tenantId,
    customerCompanyId: serviceFeeContext.customerCompanyId,
    siteId: serviceFeeContext.siteId,
    location: serviceFeeContext.location
  });

  const quoteLineItems: QuoteInput["lineItems"] = [...baseLineItems];

  if ((serviceFee.unitPrice ?? 0) > 0) {
    quoteLineItems.push({
      internalCode: serviceFee.code,
      title: "Service Fee",
      description: null,
      quantity: 1,
      unitPrice: serviceFee.unitPrice ?? 0,
      discountAmount: 0,
      taxable: false,
      inspectionType: null,
      category: autoQuoteServiceFeeCategory
    });
  }

  return normalizeQuoteLineItems(input.tenantId, quoteLineItems);
}

async function buildNextQuoteNumber(tenantId: string) {
  const count = await prisma.quote.count({ where: { tenantId } });
  return `Q-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
}

function isQuoteEffectivelyExpired(status: QuoteStatus, expiresAt: Date | null) {
  if (!expiresAt) {
    return false;
  }
  if (closedQuoteStatuses.includes(status)) {
    return false;
  }
  return isBefore(endOfDay(expiresAt), new Date());
}

function getEffectiveQuoteStatus(status: QuoteStatus, expiresAt: Date | null) {
  return isQuoteEffectivelyExpired(status, expiresAt) ? QuoteStatus.expired : status;
}

async function createQuoteAuditLog(input: {
  tenantId: string;
  actorUserId: string | null;
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

async function refreshQuoteReminderState(quoteId: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      sentAt: true,
      firstViewedAt: true,
      expiresAt: true,
      approvedAt: true,
      declinedAt: true,
      convertedAt: true,
      remindersEnabled: true,
      remindersPausedAt: true,
      reminderCount: true
    }
  });

  if (!quote) {
    return null;
  }

  const [settings, existingDispatches] = await Promise.all([
    getTenantQuoteReminderSettingsByTenantId(quote.tenantId),
    prisma.quoteReminderDispatch.findMany({
      where: { quoteId },
      select: {
        dedupeKey: true,
        reminderType: true,
        status: true,
        sentAt: true,
        attemptedAt: true
      }
    })
  ]);

  const existingDedupeKeys = new Set(existingDispatches.map((dispatch) => dispatch.dedupeKey).filter((value): value is string => Boolean(value)));
  const nextAutoReminder = evaluateQuoteReminderStage(quote, settings, existingDedupeKeys);
  const expiredFollowUp = buildExpiredFollowUpSchedule(quote, settings);
  const expiredCandidate = expiredFollowUp && !existingDedupeKeys.has(expiredFollowUp.dedupeKey) ? expiredFollowUp : null;
  const nextReminder = [nextAutoReminder, expiredCandidate]
    .filter((item): item is QuoteReminderStageEvaluation => Boolean(item))
    .sort((left, right) => left.scheduledFor.getTime() - right.scheduledFor.getTime())[0] ?? null;

  const latestSentReminder = existingDispatches
    .filter((dispatch) => dispatch.status === quoteReminderDispatchStatusValues.sent && dispatch.sentAt)
    .sort((left, right) => (right.sentAt?.getTime() ?? 0) - (left.sentAt?.getTime() ?? 0))[0] ?? null;
  const latestFailedReminder = existingDispatches
    .filter((dispatch) => dispatch.status === quoteReminderDispatchStatusValues.failed && dispatch.attemptedAt)
    .sort((left, right) => (right.attemptedAt?.getTime() ?? 0) - (left.attemptedAt?.getTime() ?? 0))[0] ?? null;

  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      nextReminderAt: nextReminder?.scheduledFor ?? null,
      reminderStage: quote.remindersPausedAt
        ? "paused"
        : !quote.remindersEnabled
          ? "disabled"
          : nextReminder?.stageLabel ?? (isQuoteEffectivelyExpired(quote.status, quote.expiresAt) ? "expired_closed" : null),
      lastReminderAt: latestSentReminder?.sentAt ?? null,
      reminderError: latestFailedReminder ? "Last reminder attempt failed." : null,
      reminderCount: existingDispatches.filter((dispatch) => dispatch.status === quoteReminderDispatchStatusValues.sent).length
    }
  });

  return {
    nextReminderAt: nextReminder?.scheduledFor ?? null,
    reminderStage: nextReminder?.stageLabel ?? null
  };
}

async function ensureQuoteAccessTokenForQuote(input: {
  quoteId: string;
  expiresAt: Date | null;
  recipientEmail?: string | null;
}) {
  const freshToken = createQuoteAccessToken();
  const updated = await prisma.quote.update({
    where: { id: input.quoteId },
    data: {
      quoteAccessToken: freshToken,
      quoteAccessTokenRevokedAt: null,
      quoteAccessTokenExpiresAt: input.expiresAt ? endOfDay(input.expiresAt) : addDays(new Date(), 180),
      quoteAccessTokenSentToEmail: normalizeNullableString(input.recipientEmail)
    },
    select: {
      quoteAccessToken: true,
      quoteAccessTokenExpiresAt: true,
      quoteAccessTokenRevokedAt: true
    }
  });

  return updated;
}

function getHostedQuoteAvailability(quote: {
  status: QuoteStatus;
  expiresAt: Date | null;
  quoteAccessTokenRevokedAt: Date | null;
  quoteAccessTokenExpiresAt: Date | null;
}) {
  if (quote.quoteAccessTokenRevokedAt) {
    return "unavailable" as const;
  }
  if (quote.status === QuoteStatus.cancelled) {
    return "cancelled" as const;
  }
  if (quote.status === QuoteStatus.approved || quote.status === QuoteStatus.converted) {
    return "approved" as const;
  }
  if (quote.status === QuoteStatus.declined) {
    return "declined" as const;
  }
  if (
    (quote.quoteAccessTokenExpiresAt && isBefore(quote.quoteAccessTokenExpiresAt, new Date()))
    || isQuoteEffectivelyExpired(quote.status, quote.expiresAt)
  ) {
    return "expired" as const;
  }
  return "available" as const;
}

async function recordQuoteViewed(input: {
  tenantId: string;
  quoteId: string;
  status: QuoteStatus;
  recipientEmail?: string | null;
}) {
  const now = new Date();
  const nextStatus = input.status === QuoteStatus.sent ? QuoteStatus.viewed : input.status;
  await prisma.quote.update({
    where: { id: input.quoteId },
    data: {
      viewedAt: now,
      firstViewedAt: now,
      lastViewedAt: now,
      viewCount: { increment: 1 },
      lastAccessedByEmail: normalizeNullableString(input.recipientEmail),
      status: nextStatus
    }
  });

  await createQuoteAuditLog({
    tenantId: input.tenantId,
    actorUserId: null,
    action: "quote.viewed",
    quoteId: input.quoteId,
    metadata: {
      recipientEmail: normalizeNullableString(input.recipientEmail)
    }
  });

  await refreshQuoteReminderState(input.quoteId);

  return {
    viewedAt: now,
    firstViewedAt: now,
    lastViewedAt: now,
    viewCountIncremented: true,
    nextStatus
  };
}

async function getQuoteByAccessToken(token: string) {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return null;
  }

  const quote = await prisma.quote.findFirst({
    where: { quoteAccessToken: normalizedToken },
    include: {
      customerCompany: true,
      site: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      tenant: {
        select: {
          id: true,
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

  return quote;
}

function shapeHostedQuoteDetail(quote: NonNullable<Awaited<ReturnType<typeof getQuoteByAccessToken>>>) {
  const accessState = getHostedQuoteAvailability(quote);
  return {
    ...quote,
    accessState,
    effectiveStatus: getEffectiveQuoteStatus(quote.status, quote.expiresAt),
    hostedQuoteUrl: quote.quoteAccessToken ? buildQuoteAccessUrl(quote.quoteAccessToken) : null,
    canRespond: accessState === "available"
  };
}

async function getQuoteByIdForTenant(tenantId: string, quoteId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId },
    include: {
      tenant: {
        select: {
          name: true,
          branding: true,
          billingEmail: true
        }
      },
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

  if (!quote) {
    return null;
  }

  const [customerCompany, site] = await Promise.all([
    prisma.customerCompany.findFirst({
      where: { tenantId, id: quote.customerCompanyId },
      select: {
        id: true,
        name: true,
        contactName: true,
        billingEmail: true,
        phone: true
      }
    }),
    quote.siteId
      ? prisma.site.findFirst({
          where: { tenantId, id: quote.siteId },
          select: {
            id: true,
            name: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            state: true,
            postalCode: true
          }
        })
      : Promise.resolve(null)
  ]);

  return {
    ...quote,
    customerCompany: customerCompany ?? {
      id: quote.customerCompanyId,
      name: "Archived customer",
      contactName: null,
      billingEmail: null,
      phone: null
    },
    site: buildQuoteSiteRecord({
      siteId: quote.siteId,
      site,
      customSiteName: quote.customSiteName
    })
  };
}

async function loadQuoteReferenceMaps(
  tenantId: string,
  quotes: Array<{ customerCompanyId: string; siteId: string | null }>
) {
  const customerCompanyIds = [...new Set(quotes.map((quote) => quote.customerCompanyId).filter(Boolean))];
  const siteIds = [...new Set(quotes.map((quote) => quote.siteId).filter((siteId): siteId is string => Boolean(siteId)))];

  const [customerCompanies, sites] = await Promise.all([
    customerCompanyIds.length > 0
      ? prisma.customerCompany.findMany({
          where: {
            tenantId,
            id: { in: customerCompanyIds }
          },
          select: {
            id: true,
            name: true
          }
        })
      : Promise.resolve([]),
    siteIds.length > 0
      ? prisma.site.findMany({
          where: {
            tenantId,
            id: { in: siteIds }
          },
          select: {
            id: true,
            name: true
          }
        })
      : Promise.resolve([])
  ]);

  return {
    customerCompanyMap: new Map(customerCompanies.map((customerCompany) => [customerCompany.id, customerCompany])),
    siteMap: new Map(sites.map((site) => [site.id, site]))
  };
}

export async function getQuoteFormOptions(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  assertQuoteManagementAccess(parsedActor);

  const [customers, sites, quickBooksCatalogItems] = await Promise.all([
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
    }),
    prisma.quickBooksCatalogItem.findMany({
      where: {
        tenantId: parsedActor.tenantId as string,
        active: true
      },
      select: {
        quickbooksItemId: true,
        name: true,
        sku: true,
        itemType: true,
        unitPrice: true
      },
      orderBy: [{ name: "asc" }]
    })
  ]);

  return {
    customers,
    sites,
    proposalTypes: quoteProposalTypes,
    catalog: [
      ...quoteCatalog.map((item) => ({
        ...item,
        source: "internal" as const,
        inspectionTypeLabel: item.inspectionType ? inspectionTypeRegistry[item.inspectionType].label : null
      })),
      ...quickBooksCatalogItems.map((item) => ({
        code: buildQuickBooksQuoteCatalogCode(item.quickbooksItemId),
        title: item.name,
        description: buildQuickBooksQuoteCatalogDescription(item),
        category: item.itemType.toLowerCase(),
        inspectionType: null,
        inspectionTypeLabel: null,
        source: "quickbooks" as const,
        quickbooksItemId: item.quickbooksItemId,
        quickbooksItemType: item.itemType,
        unitPrice: item.unitPrice
      }))
    ]
  };
}

export async function getQuoteReminderSettings(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  assertQuoteManagementAccess(parsedActor);
  return getTenantQuoteReminderSettingsByTenantId(parsedActor.tenantId as string);
}

export async function updateQuoteReminderSettings(actor: ActorContext, input: QuoteReminderSettingsInput) {
  const parsedActor = parseActor(actor);
  assertQuoteManagementAccess(parsedActor);
  const parsedInput = quoteReminderSettingsInputSchema.parse(input);

  await prisma.tenant.update({
    where: { id: parsedActor.tenantId as string },
    data: {
      quoteReminderSettings: parsedInput
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "quote.reminder_settings_updated",
      entityType: "Tenant",
      entityId: parsedActor.tenantId as string,
      metadata: parsedInput as Prisma.InputJsonValue
    }
  });

  const tenantQuotes = await prisma.quote.findMany({
    where: { tenantId: parsedActor.tenantId as string },
    select: { id: true }
  });
  await Promise.all(tenantQuotes.map((quote) => refreshQuoteReminderState(quote.id)));

  return parsedInput;
}

export async function createQuote(actor: ActorContext, input: QuoteInput) {
  const parsedActor = parseActor(actor);
  assertQuoteManagementAccess(parsedActor);
  const parsedInput = quoteInputSchema.parse(input);

  const lineItems = await buildQuoteLineItemsForSave({
    tenantId: parsedActor.tenantId as string,
    customerCompanyId: parsedInput.customerCompanyId,
    siteId: parsedInput.siteId,
    lineItems: parsedInput.lineItems
  });
  const totals = calculateQuoteTotals(lineItems, parsedInput.taxAmount);
  const quoteNumber = await buildNextQuoteNumber(parsedActor.tenantId as string);
  const expiresAt = parsedInput.expiresAt ?? getDefaultQuoteExpirationDate(parsedInput.issuedAt);

  const quote = await prisma.quote.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      quoteNumber,
      customerCompanyId: parsedInput.customerCompanyId,
      siteId: normalizeNullableString(parsedInput.siteId),
      customSiteName: normalizeQuoteCustomSiteName(parsedInput),
      contactName: normalizeNullableString(parsedInput.contactName),
      recipientEmail: normalizeNullableString(parsedInput.recipientEmail),
      proposalType: parsedInput.proposalType ?? null,
      issuedAt: parsedInput.issuedAt,
      expiresAt,
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

  await refreshQuoteReminderState(quote.id);

  return quote;
}

export async function updateQuote(actor: ActorContext, quoteId: string, input: QuoteInput) {
  const parsedActor = parseActor(actor);
  assertQuoteManagementAccess(parsedActor);
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

  const lineItems = await buildQuoteLineItemsForSave({
    tenantId: parsedActor.tenantId as string,
    customerCompanyId: parsedInput.customerCompanyId,
    siteId: parsedInput.siteId,
    lineItems: parsedInput.lineItems
  });
  const totals = calculateQuoteTotals(lineItems, parsedInput.taxAmount);
  const expiresAt = parsedInput.expiresAt ?? getDefaultQuoteExpirationDate(parsedInput.issuedAt);

  const updated = await prisma.quote.update({
    where: { id: quoteId },
    data: {
      customerCompanyId: parsedInput.customerCompanyId,
      siteId: normalizeNullableString(parsedInput.siteId),
      customSiteName: normalizeQuoteCustomSiteName(parsedInput),
      contactName: normalizeNullableString(parsedInput.contactName),
      recipientEmail: normalizeNullableString(parsedInput.recipientEmail),
      proposalType: parsedInput.proposalType ?? null,
      issuedAt: parsedInput.issuedAt,
      expiresAt,
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

  await refreshQuoteReminderState(quoteId);

  return updated;
}

export async function deleteQuote(actor: ActorContext, quoteId: string) {
  const parsedActor = parseActor(actor);
  assertQuoteManagementAccess(parsedActor);

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId: parsedActor.tenantId as string },
    select: {
      id: true,
      quoteNumber: true,
      quickbooksEstimateId: true,
      syncStatus: true,
      convertedInspectionId: true
    }
  });

  if (!quote) {
    throw new Error("Quote not found.");
  }

  if (quote.convertedInspectionId) {
    throw new Error("Converted quotes cannot be deleted. Open the linked inspection from the quote instead.");
  }

  if (quote.quickbooksEstimateId) {
    throw new Error("Quotes already synced to QuickBooks cannot be deleted.");
  }

  if (quote.syncStatus === QuoteSyncStatus.sync_pending) {
    throw new Error("Wait for the QuickBooks sync to finish before deleting this quote.");
  }

  await createQuoteAuditLog({
    tenantId: parsedActor.tenantId as string,
    actorUserId: parsedActor.userId,
    action: "quote.deleted",
    quoteId: quote.id,
    metadata: {
      quoteNumber: quote.quoteNumber
    }
  });

  await prisma.quote.delete({
    where: { id: quote.id }
  });

  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber
  };
}

export async function saveQuoteLineItemQuickBooksMapping(actor: ActorContext, input: {
  quoteId: string;
  lineItemId: string;
  internalCode: string;
  internalName: string;
  qbItemId: string;
}) {
  const parsedActor = parseActor(actor);
  assertQuoteManagementAccess(parsedActor);

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
  assertQuoteManagementAccess(parsedActor);

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
  assertQuoteManagementAccess(parsedActor);
  const quotes = await prisma.quote.findMany({
    where: { tenantId: parsedActor.tenantId as string },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } }
    },
    orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }]
  });
  const { customerCompanyMap, siteMap } = await loadQuoteReferenceMaps(parsedActor.tenantId as string, quotes);

  const normalizedQuery = (filters?.query ?? "").trim().toLowerCase();
  const requestedStatus = (filters?.status ?? "all").trim();
  const requestedSyncStatus = (filters?.syncStatus ?? "all").trim();

  return quotes
    .map((quote) => {
      const effectiveStatus = getEffectiveQuoteStatus(quote.status, quote.expiresAt);
      const customerCompany = customerCompanyMap.get(quote.customerCompanyId) ?? {
        id: quote.customerCompanyId,
        name: "Archived customer"
      };
      const site = quote.siteId
        ? siteMap.get(quote.siteId) ?? { id: quote.siteId, name: "Archived site" }
        : normalizeNullableString(quote.customSiteName)
          ? { id: `custom:${quote.id}`, name: normalizeNullableString(quote.customSiteName)! }
          : null;
      return {
        ...quote,
        customerCompany,
        site,
        effectiveStatus,
        engagementStatus: getHostedQuoteAvailability(quote),
        reminderStatus: quote.remindersPausedAt
          ? "paused"
          : !quote.remindersEnabled
            ? "disabled"
            : quote.nextReminderAt
              ? "scheduled"
              : quote.lastReminderAt
                ? "sent"
                : "idle"
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
        quote.customerCompany?.name ?? "Archived customer",
        quote.site?.name ?? "",
        quote.recipientEmail ?? "",
        ...quote.lineItems.map((line) => `${line.internalCode} ${line.title} ${line.description ?? ""}`)
      ].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
}

export async function getQuoteDetail(actor: ActorContext, quoteId: string) {
  const parsedActor = parseActor(actor);
  assertQuoteManagementAccess(parsedActor);

  const [quote, auditLogs, formOptions, reminderSettings, reminderDispatches] = await Promise.all([
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
    getQuoteFormOptions(actor),
    getTenantQuoteReminderSettingsByTenantId(parsedActor.tenantId as string),
    prisma.quoteReminderDispatch.findMany({
      where: {
        tenantId: parsedActor.tenantId as string,
        quoteId
      },
      orderBy: { createdAt: "desc" }
    })
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
    tenant: quote.tenant,
    effectiveStatus: getEffectiveQuoteStatus(quote.status, quote.expiresAt),
    engagementStatus: getHostedQuoteAvailability(quote),
    hostedQuoteUrl: quote.quoteAccessToken ? buildQuoteAccessUrl(quote.quoteAccessToken) : null,
    reminderSettings,
    reminderDispatches,
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

  const [customerCompany, site] = await Promise.all([
    prisma.customerCompany.findFirst({
      where: { tenantId: parsedActor.tenantId as string, id: quote.customerCompanyId },
      select: {
        id: true,
        name: true,
        contactName: true,
        billingEmail: true,
        phone: true
      }
    }),
    quote.siteId
      ? prisma.site.findFirst({
          where: { tenantId: parsedActor.tenantId as string, id: quote.siteId },
          select: {
            id: true,
            name: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            state: true,
            postalCode: true
          }
        })
      : Promise.resolve(null)
  ]);

  const pdfBytes = await generateQuotePdf({
    tenant: quote.tenant,
    quote: {
      quoteNumber: quote.quoteNumber,
      recipientEmail: quote.recipientEmail,
      proposalType: quote.proposalType,
      issuedAt: quote.issuedAt,
      expiresAt: quote.expiresAt,
      status: quote.status,
      customerNotes: quote.customerNotes,
      subtotal: quote.subtotal,
      taxAmount: quote.taxAmount,
      total: quote.total,
      hostedQuoteUrl: quote.quoteAccessToken ? buildQuoteAccessUrl(quote.quoteAccessToken) : null
    },
    customerCompany: {
      name: customerCompany?.name ?? "Archived customer",
      contactName: quote.contactName ?? customerCompany?.contactName ?? null,
      billingEmail: quote.recipientEmail ?? customerCompany?.billingEmail ?? null,
      phone: customerCompany?.phone ?? null
    },
    site: toCustomerFacingQuoteSite(
      buildQuoteSiteRecord({
        siteId: quote.siteId,
        site: site
          ? {
              id: site.id,
              name: site.name,
              addressLine1: site.addressLine1,
              addressLine2: site.addressLine2,
              city: site.city,
              state: site.state,
              postalCode: site.postalCode
            }
          : null,
        customSiteName: quote.customSiteName
      })
    ),
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

export async function sendQuote(actor: ActorContext, quoteId: string, input?: { recipientEmail?: string | null; ccEmails?: string | null; subject?: string | null; message?: string | null }) {
  const parsedActor = parseActor(actor);
  assertQuoteManagementAccess(parsedActor);
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId: parsedActor.tenantId as string },
    include: {
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

  const [customerCompany, site] = await Promise.all([
    prisma.customerCompany.findFirst({
      where: { tenantId: parsedActor.tenantId as string, id: quote.customerCompanyId },
      select: {
        id: true,
        name: true,
        contactName: true,
        billingEmail: true
      }
    }),
    quote.siteId
      ? prisma.site.findFirst({
          where: { tenantId: parsedActor.tenantId as string, id: quote.siteId },
          select: {
            id: true,
            name: true
          }
        })
      : Promise.resolve(null)
  ]);

  const recipientEmail = normalizeNullableString(input?.recipientEmail) ?? quote.recipientEmail ?? customerCompany?.billingEmail;
  if (!recipientEmail) {
    throw new Error("Add a recipient email before sending this quote.");
  }
  const ccEmails = normalizeEmailList(input?.ccEmails);
  if (ccEmails.some((email) => email.toLowerCase() === recipientEmail.toLowerCase())) {
    throw new Error("Do not include the primary recipient again in CC.");
  }

  const access = quote.quoteAccessToken
    && !quote.quoteAccessTokenRevokedAt
    && (!quote.quoteAccessTokenExpiresAt || !isBefore(quote.quoteAccessTokenExpiresAt, new Date()))
    ? {
        quoteAccessToken: quote.quoteAccessToken,
        quoteAccessTokenExpiresAt: quote.quoteAccessTokenExpiresAt
      }
    : await ensureQuoteAccessTokenForQuote({
        quoteId: quote.id,
        expiresAt: quote.expiresAt,
        recipientEmail
      });

  const { pdfBytes, fileName } = await getAuthorizedQuotePdf(actor, quoteId);
  const customerUrl = buildQuoteAccessUrl(access.quoteAccessToken as string);
  const companyName = resolveTenantBranding({
    tenantName: quote.tenant.name,
    branding: quote.tenant.branding,
    billingEmail: quote.tenant.billingEmail
  }).legalBusinessName;
  const subject = normalizeNullableString(input?.subject) ?? buildQuoteEmailSubject({ companyName, quoteNumber: quote.quoteNumber });
  const body = normalizeNullableString(input?.message) ?? buildQuoteEmailDefaultMessage();

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
    ccEmails,
    recipientName: quote.contactName ?? customerCompany?.contactName ?? customerCompany?.name ?? "Customer",
    tenantName: companyName,
    quoteNumber: quote.quoteNumber,
    customerName: customerCompany?.name ?? "Archived customer",
    siteName: site?.name ?? quote.customSiteName ?? null,
    quoteUrl: customerUrl,
    subjectLine: subject,
    messageBody: body,
    expiresAt: quote.expiresAt,
    attachment: {
      fileName,
      content: Buffer.from(pdfBytes).toString("base64")
    }
  });

  const nextStatus = quote.status === QuoteStatus.draft ? QuoteStatus.sent : quote.status === QuoteStatus.ready_to_send ? QuoteStatus.sent : quote.status;
  const deliveryTimestamp = delivery.sent ? new Date() : quote.sentAt;
  await prisma.quote.update({
    where: { id: quote.id },
    data: {
      status: nextStatus,
      deliveryStatus: delivery.sent ? QuoteDeliveryStatus.sent : QuoteDeliveryStatus.error,
      sentAt: deliveryTimestamp,
      lastSentAt: deliveryTimestamp,
      lastSentToEmail: recipientEmail,
      lastDeliveryMessageId: delivery.messageId,
      lastDeliveryError: delivery.error,
      deliveryAttempts: { increment: 1 },
      resendCount: delivery.sent && quote.sentAt ? { increment: 1 } : undefined,
      quoteAccessTokenSentToEmail: recipientEmail,
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
      ccEmails,
      hostedQuoteUrl: customerUrl,
      provider: delivery.provider,
      reason: delivery.reason,
      error: delivery.error
    }
  });

  if (!delivery.sent) {
    throw new Error(delivery.error ?? "Quote email failed to send.");
  }

  await refreshQuoteReminderState(quote.id);

  return delivery;
}

function getReminderTemplateForType(settings: QuoteReminderSettings, type: QuoteReminderType) {
  if (type === quoteReminderTypeValues.sent_not_viewed_first || type === quoteReminderTypeValues.sent_not_viewed_second) {
    return settings.templates.sentNotViewed;
  }
  if (type === quoteReminderTypeValues.viewed_pending_first || type === quoteReminderTypeValues.viewed_pending_second || type === quoteReminderTypeValues.manual_follow_up) {
    return settings.templates.viewedPending;
  }
  if (type === quoteReminderTypeValues.expiring_soon) {
    return settings.templates.expiringSoon;
  }
  return settings.templates.expired;
}

function buildReminderTitle(type: QuoteReminderType, quoteNumber: string) {
  switch (type) {
    case quoteReminderTypeValues.sent_not_viewed_first:
    case quoteReminderTypeValues.sent_not_viewed_second:
      return `Quote ${quoteNumber} is ready to review`;
    case quoteReminderTypeValues.viewed_pending_first:
    case quoteReminderTypeValues.viewed_pending_second:
    case quoteReminderTypeValues.manual_follow_up:
      return `Quote ${quoteNumber} is ready when you are`;
    case quoteReminderTypeValues.expiring_soon:
      return `Quote ${quoteNumber} is expiring soon`;
    case quoteReminderTypeValues.expired_follow_up:
      return `Quote ${quoteNumber} has expired`;
    default:
      return `Quote ${quoteNumber} follow-up`;
  }
}

async function sendQuoteReminderInternal(input: {
  quoteId: string;
  tenantId: string;
  reminderType: QuoteReminderType;
  dedupeKey?: string | null;
  actorUserId?: string | null;
  manual?: boolean;
}) {
  const quote = await prisma.quote.findFirst({
    where: { id: input.quoteId, tenantId: input.tenantId },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
          branding: true,
          billingEmail: true,
          quoteReminderSettings: true
        }
      },
      customerCompany: {
        select: {
          id: true,
          name: true,
          contactName: true,
          billingEmail: true,
          phone: true
        }
      },
      site: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!quote) {
    throw new Error("Quote not found.");
  }

  const effectiveStatus = getEffectiveQuoteStatus(quote.status, quote.expiresAt);
  if (closedQuoteStatuses.includes(effectiveStatus) || effectiveStatus === QuoteStatus.expired && input.reminderType !== quoteReminderTypeValues.expired_follow_up) {
    await createQuoteAuditLog({
      tenantId: quote.tenantId,
      actorUserId: input.actorUserId ?? null,
      action: "quote.reminder_skipped",
      quoteId: quote.id,
      metadata: {
        reminderType: input.reminderType,
        reason: "quote_no_longer_actionable"
      }
    });
    return { sent: false, skipped: true, reason: "quote_no_longer_actionable" as const };
  }

  if (!quote.remindersEnabled || quote.remindersPausedAt) {
    await createQuoteAuditLog({
      tenantId: quote.tenantId,
      actorUserId: input.actorUserId ?? null,
      action: "quote.reminder_skipped",
      quoteId: quote.id,
      metadata: {
        reminderType: input.reminderType,
        reason: quote.remindersPausedAt ? "reminders_paused" : "reminders_disabled"
      }
    });
    return { sent: false, skipped: true, reason: quote.remindersPausedAt ? "reminders_paused" as const : "reminders_disabled" as const };
  }

  const recipientEmail = normalizeNullableString(quote.recipientEmail) ?? normalizeNullableString(quote.customerCompany.billingEmail);
  if (!recipientEmail) {
    await prisma.quote.update({
      where: { id: quote.id },
      data: {
        reminderError: "Missing recipient email for reminders.",
        nextReminderAt: null
      }
    });
    await createQuoteAuditLog({
      tenantId: quote.tenantId,
      actorUserId: input.actorUserId ?? null,
      action: "quote.reminder_failed",
      quoteId: quote.id,
      metadata: {
        reminderType: input.reminderType,
        reason: "missing_recipient_email"
      }
    });
    return { sent: false, skipped: true, reason: "missing_recipient_email" as const };
  }

  const settings = normalizeQuoteReminderSettings(quote.tenant.quoteReminderSettings);
  const template = getReminderTemplateForType(settings, input.reminderType);
  const hostedQuoteUrl = quote.quoteAccessToken ? buildQuoteAccessUrl(quote.quoteAccessToken) : null;
  if (!hostedQuoteUrl) {
    await createQuoteAuditLog({
      tenantId: quote.tenantId,
      actorUserId: input.actorUserId ?? null,
      action: "quote.reminder_failed",
      quoteId: quote.id,
      metadata: {
        reminderType: input.reminderType,
        reason: "missing_hosted_quote_link"
      }
    });
    return { sent: false, skipped: true, reason: "missing_hosted_quote_link" as const };
  }

  const mergeValues = {
    quoteNumber: quote.quoteNumber,
    customerName: quote.customerCompany.name,
    total: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(quote.total)
  };
  const subjectLine = interpolateReminderTemplate(template.subject, mergeValues);
  const messageBody = interpolateReminderTemplate(template.body, mergeValues);

  const dispatch = await prisma.quoteReminderDispatch.create({
    data: {
      tenantId: quote.tenantId,
      quoteId: quote.id,
      reminderType: input.reminderType,
      status: quoteReminderDispatchStatusValues.pending,
      dedupeKey: input.dedupeKey ?? undefined,
      recipientEmail,
      scheduledFor: new Date()
    }
  }).catch(async (error) => {
    if (input.dedupeKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.quoteReminderDispatch.findFirst({
        where: {
          quoteId: quote.id,
          dedupeKey: input.dedupeKey
        }
      });
    }
    throw error;
  });

  if (!dispatch) {
    return { sent: false, skipped: true, reason: "duplicate_dispatch" as const };
  }

  if (dispatch.status === quoteReminderDispatchStatusValues.sent || dispatch.status === quoteReminderDispatchStatusValues.skipped) {
    return { sent: false, skipped: true, reason: "duplicate_dispatch" as const };
  }

  const delivery = await sendQuoteReminderEmail({
    recipientEmail,
    recipientName: quote.contactName ?? quote.customerCompany.contactName ?? quote.customerCompany.name,
    tenantName: quote.tenant.name,
    quoteNumber: quote.quoteNumber,
    customerName: quote.customerCompany.name,
    siteName: quote.site?.name ?? quote.customSiteName ?? null,
    quoteUrl: hostedQuoteUrl,
    quoteTotal: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(quote.total),
    reminderTitle: buildReminderTitle(input.reminderType, quote.quoteNumber),
    subjectLine,
    messageBody,
    actionLabel: input.reminderType === quoteReminderTypeValues.expired_follow_up ? "View expired quote" : "View quote",
    expiresAt: quote.expiresAt
  });

  await prisma.quoteReminderDispatch.update({
    where: { id: dispatch.id },
    data: {
      status: delivery.sent ? quoteReminderDispatchStatusValues.sent : quoteReminderDispatchStatusValues.failed,
      attemptedAt: new Date(),
      sentAt: delivery.sent ? new Date() : null,
      messageId: delivery.messageId,
      error: delivery.error
    }
  });

  await prisma.quote.update({
    where: { id: quote.id },
    data: {
      lastReminderAt: delivery.sent ? new Date() : quote.lastReminderAt,
      reminderError: delivery.sent ? null : (delivery.error ?? "Reminder send failed.")
    }
  });

  await createQuoteAuditLog({
    tenantId: quote.tenantId,
    actorUserId: input.actorUserId ?? null,
    action: delivery.sent ? "quote.reminder_sent" : "quote.reminder_failed",
    quoteId: quote.id,
    metadata: {
      reminderType: input.reminderType,
      recipientEmail,
      messageId: delivery.messageId,
      manual: input.manual ?? false,
      error: delivery.error
    }
  });

  await refreshQuoteReminderState(quote.id);

  if (!delivery.sent) {
    throw new Error(delivery.error ?? "Unable to send quote reminder.");
  }

  return { sent: true, skipped: false, delivery };
}

export async function updateQuoteReminderControl(
  actor: ActorContext,
  quoteId: string,
  action: "pause" | "resume" | "disable" | "enable"
) {
  const parsedActor = parseActor(actor);
  assertQuoteManagementAccess(parsedActor);

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId: parsedActor.tenantId as string },
    select: { id: true }
  });

  if (!quote) {
    throw new Error("Quote not found.");
  }

  const now = new Date();
  await prisma.quote.update({
    where: { id: quoteId },
    data: action === "pause"
      ? {
          remindersEnabled: true,
          remindersPausedAt: now,
          remindersPausedByUserId: parsedActor.userId,
          nextReminderAt: null,
          reminderStage: "paused"
        }
      : action === "resume"
        ? {
            remindersEnabled: true,
            remindersPausedAt: null,
            remindersPausedByUserId: null
          }
        : action === "disable"
          ? {
              remindersEnabled: false,
              remindersPausedAt: null,
              remindersPausedByUserId: null,
              nextReminderAt: null,
              reminderStage: "disabled"
            }
          : {
              remindersEnabled: true,
              remindersPausedAt: null,
              remindersPausedByUserId: null
            }
  });

  await createQuoteAuditLog({
    tenantId: parsedActor.tenantId as string,
    actorUserId: parsedActor.userId,
    action: `quote.reminders_${action}`,
    quoteId,
    metadata: {
      action
    }
  });

  await refreshQuoteReminderState(quoteId);
}

export async function sendQuoteReminderNow(actor: ActorContext, quoteId: string) {
  const parsedActor = parseActor(actor);
  assertQuoteManagementAccess(parsedActor);

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId: parsedActor.tenantId as string },
    select: {
      id: true,
      tenantId: true,
      status: true,
      sentAt: true,
      firstViewedAt: true,
      expiresAt: true,
      approvedAt: true,
      declinedAt: true,
      convertedAt: true,
      remindersEnabled: true,
      remindersPausedAt: true,
      reminderCount: true
    }
  });

  if (!quote) {
    throw new Error("Quote not found.");
  }

  const settings = await getTenantQuoteReminderSettingsByTenantId(parsedActor.tenantId as string);
  const existingDispatches = await prisma.quoteReminderDispatch.findMany({
    where: { quoteId },
    select: { dedupeKey: true }
  });
  const nextReminder = evaluateQuoteReminderStage(
    quote,
    settings,
    new Set(existingDispatches.map((dispatch) => dispatch.dedupeKey).filter((value): value is string => Boolean(value)))
  );
  const expiredReminder = buildExpiredFollowUpSchedule(quote, settings);
  const selectedType = nextReminder?.type
    ?? expiredReminder?.type
    ?? (quote.firstViewedAt ? quoteReminderTypeValues.viewed_pending_first : quoteReminderTypeValues.sent_not_viewed_first);

  return sendQuoteReminderInternal({
    quoteId,
    tenantId: parsedActor.tenantId as string,
    reminderType: selectedType,
    dedupeKey: `manual:${quoteId}:${Date.now()}`,
    actorUserId: parsedActor.userId,
    manual: true
  });
}

export async function runQuoteReminderSweep(options?: { tenantId?: string | null; limit?: number }) {
  const where: Prisma.QuoteWhereInput = {
    remindersEnabled: true,
    remindersPausedAt: null,
    status: {
      in: [QuoteStatus.sent, QuoteStatus.viewed, QuoteStatus.ready_to_send]
    }
  };

  if (options?.tenantId) {
    where.tenantId = options.tenantId;
  }

  const quotes = await prisma.quote.findMany({
    where,
    select: {
      id: true,
      tenantId: true,
      status: true,
      sentAt: true,
      firstViewedAt: true,
      expiresAt: true,
      approvedAt: true,
      declinedAt: true,
      convertedAt: true,
      remindersEnabled: true,
      remindersPausedAt: true,
      reminderCount: true
    },
    take: options?.limit ?? 200,
    orderBy: [{ nextReminderAt: "asc" }, { sentAt: "asc" }]
  });

  let sentCount = 0;
  let skippedCount = 0;
  const now = new Date();

  for (const quote of quotes) {
    const [settings, existingDispatches] = await Promise.all([
      getTenantQuoteReminderSettingsByTenantId(quote.tenantId),
      prisma.quoteReminderDispatch.findMany({
        where: { quoteId: quote.id },
        select: { dedupeKey: true }
      })
    ]);

    const dedupeKeys = new Set(existingDispatches.map((dispatch) => dispatch.dedupeKey).filter((value): value is string => Boolean(value)));
    const nextReminder = evaluateQuoteReminderStage(quote, settings, dedupeKeys);
    const expiredReminder = buildExpiredFollowUpSchedule(quote, settings);
    const dueReminder = [nextReminder, expiredReminder]
      .filter((item): item is QuoteReminderStageEvaluation => Boolean(item))
      .filter((item) => item.scheduledFor.getTime() <= now.getTime())
      .sort((left, right) => left.scheduledFor.getTime() - right.scheduledFor.getTime())[0] ?? null;

    if (!dueReminder) {
      await refreshQuoteReminderState(quote.id);
      continue;
    }

    try {
      const result = await sendQuoteReminderInternal({
        quoteId: quote.id,
        tenantId: quote.tenantId,
        reminderType: dueReminder.type,
        dedupeKey: dueReminder.dedupeKey,
        actorUserId: null,
        manual: false
      });
      if (result.sent) {
        sentCount += 1;
      } else {
        skippedCount += 1;
      }
    } catch {
      skippedCount += 1;
    }
  }

  return {
    processed: quotes.length,
    sentCount,
    skippedCount
  };
}

export async function updateQuoteStatus(
  actor: ActorContext,
  quoteId: string,
  status: QuoteStatus,
  options?: { note?: string | null }
) {
  const parsedActor = parseActor(actor);
  assertQuoteManagementAccess(parsedActor);

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
    declinedAt: status === QuoteStatus.declined ? now : quote.status === QuoteStatus.declined ? null : undefined,
    customerResponseNote: normalizeNullableString(options?.note) ?? undefined
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

  await refreshQuoteReminderState(quoteId);
}

function defaultConversionStart() {
  const nextDay = addDays(startOfDay(new Date()), 1);
  return setMinutes(setHours(nextDay, 9), 0);
}

export async function convertQuoteToInspection(actor: ActorContext, quoteId: string) {
  const parsedActor = parseActor(actor);
  assertQuoteManagementAccess(parsedActor);
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
  if (getEffectiveQuoteStatus(quote.status, quote.expiresAt) !== QuoteStatus.approved) {
    throw new Error("Approve this quote before converting it into work.");
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

  await refreshQuoteReminderState(quote.id);

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

  const viewUpdate = await recordQuoteViewed({
    tenantId: quote.tenantId,
    quoteId: quote.id,
    status: quote.status,
    recipientEmail: quote.recipientEmail ?? quote.customerCompany.billingEmail ?? null
  });
  const effectiveViewedStatus = viewUpdate.nextStatus;

  return {
    ...quote,
    status: effectiveViewedStatus,
    viewedAt: viewUpdate.viewedAt,
    firstViewedAt: quote.firstViewedAt ?? viewUpdate.firstViewedAt,
    lastViewedAt: viewUpdate.lastViewedAt,
    viewCount: quote.viewCount + 1,
    effectiveStatus: getEffectiveQuoteStatus(effectiveViewedStatus, quote.expiresAt),
    hostedQuoteUrl: quote.quoteAccessToken ? buildQuoteAccessUrl(quote.quoteAccessToken) : null
  };
}

export async function regenerateQuoteAccessToken(actor: ActorContext, quoteId: string) {
  const parsedActor = parseActor(actor);
  assertQuoteManagementAccess(parsedActor);

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId: parsedActor.tenantId as string },
    select: {
      id: true,
      quoteAccessToken: true,
      expiresAt: true,
      recipientEmail: true
    }
  });

  if (!quote) {
    throw new Error("Quote not found.");
  }

  const refreshed = await ensureQuoteAccessTokenForQuote({
    quoteId: quote.id,
    expiresAt: quote.expiresAt,
    recipientEmail: quote.recipientEmail
  });

  await createQuoteAuditLog({
    tenantId: parsedActor.tenantId as string,
    actorUserId: parsedActor.userId,
    action: "quote.link_regenerated",
    quoteId: quote.id,
    metadata: {
      previousTokenPresent: Boolean(quote.quoteAccessToken),
      hostedQuoteUrl: refreshed.quoteAccessToken ? buildQuoteAccessUrl(refreshed.quoteAccessToken) : null
    }
  });

  return refreshed.quoteAccessToken ? buildQuoteAccessUrl(refreshed.quoteAccessToken) : null;
}

export async function getHostedQuoteDetailByToken(token: string) {
  const quote = await getQuoteByAccessToken(token);
  if (!quote) {
    return { accessState: "unavailable" as const, quote: null };
  }

  const accessState = getHostedQuoteAvailability(quote);
  if (accessState === "unavailable") {
    return { accessState, quote: null };
  }

  const updatedView = await recordQuoteViewed({
    tenantId: quote.tenantId,
    quoteId: quote.id,
    status: quote.status,
    recipientEmail: quote.quoteAccessTokenSentToEmail ?? quote.recipientEmail ?? quote.customerCompany.billingEmail ?? null
  });

  return {
    accessState,
    quote: {
      ...shapeHostedQuoteDetail(quote),
      status: updatedView.nextStatus,
      viewedAt: updatedView.viewedAt,
      firstViewedAt: quote.firstViewedAt ?? updatedView.firstViewedAt,
      lastViewedAt: updatedView.lastViewedAt,
      viewCount: quote.viewCount + 1,
      effectiveStatus: getEffectiveQuoteStatus(updatedView.nextStatus, quote.expiresAt)
    }
  };
}

async function respondToQuoteByAccessToken(input: {
  token: string;
  response: "approved" | "declined";
  note?: string | null;
}) {
  const quote = await getQuoteByAccessToken(input.token);
  if (!quote) {
    return { accessState: "unavailable" as const, quote: null };
  }

  const accessState = getHostedQuoteAvailability(quote);
  if (accessState === "unavailable" || accessState === "cancelled" || accessState === "expired") {
    return { accessState, quote: shapeHostedQuoteDetail(quote) };
  }

  if (accessState === "approved") {
    return { accessState: "approved" as const, quote: shapeHostedQuoteDetail(quote) };
  }

  if (accessState === "declined") {
    return { accessState: "declined" as const, quote: shapeHostedQuoteDetail(quote) };
  }

  const now = new Date();
  const nextStatus = input.response === "approved" ? QuoteStatus.approved : QuoteStatus.declined;
  const note = normalizeNullableString(input.note);
  const updated = await prisma.quote.update({
    where: { id: quote.id },
    data: {
      status: nextStatus,
      approvedAt: nextStatus === QuoteStatus.approved ? now : quote.approvedAt,
      declinedAt: nextStatus === QuoteStatus.declined ? now : quote.declinedAt,
      customerResponseNote: note,
      lastAccessedByEmail: quote.quoteAccessTokenSentToEmail ?? quote.recipientEmail ?? quote.customerCompany.billingEmail ?? null
    },
    include: {
      customerCompany: true,
      site: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      tenant: {
        select: {
          id: true,
          name: true,
          branding: true,
          billingEmail: true
        }
      }
    }
  });

  await createQuoteAuditLog({
    tenantId: updated.tenantId,
    actorUserId: null,
    action: input.response === "approved" ? "quote.approved" : "quote.declined",
    quoteId: updated.id,
    metadata: {
      note,
      via: "secure_link",
      recipientEmail: updated.quoteAccessTokenSentToEmail ?? updated.recipientEmail
    }
  });

  await refreshQuoteReminderState(updated.id);

  return {
    accessState: input.response,
    quote: shapeHostedQuoteDetail(updated)
  };
}

export async function approveQuoteByAccessToken(token: string, options?: { note?: string | null }) {
  return respondToQuoteByAccessToken({ token, response: "approved", note: options?.note });
}

export async function declineQuoteByAccessToken(token: string, options?: { note?: string | null }) {
  return respondToQuoteByAccessToken({ token, response: "declined", note: options?.note });
}

export async function getPublicQuotePdfByAccessToken(token: string) {
  const quote = await getQuoteByAccessToken(token);
  if (!quote) {
    throw new Error("Quote not found.");
  }
  if (quote.quoteAccessTokenRevokedAt) {
    throw new Error("Quote access is no longer available.");
  }

  const pdfBytes = await generateQuotePdf({
    tenant: quote.tenant,
    quote: {
      quoteNumber: quote.quoteNumber,
      recipientEmail: quote.recipientEmail,
      proposalType: quote.proposalType,
      issuedAt: quote.issuedAt,
      expiresAt: quote.expiresAt,
      status: quote.status,
      customerNotes: quote.customerNotes,
      subtotal: quote.subtotal,
      taxAmount: quote.taxAmount,
      total: quote.total,
      hostedQuoteUrl: quote.quoteAccessToken ? buildQuoteAccessUrl(quote.quoteAccessToken) : null
    },
    customerCompany: {
      name: quote.customerCompany.name,
      contactName: quote.contactName ?? quote.customerCompany.contactName ?? null,
      billingEmail: quote.recipientEmail ?? quote.customerCompany.billingEmail ?? null,
      phone: quote.customerCompany.phone ?? null
    },
    site: toCustomerFacingQuoteSite(
      buildQuoteSiteRecord({
        siteId: quote.siteId,
        site: quote.site
          ? {
              id: quote.site.id,
              name: quote.site.name,
              addressLine1: quote.site.addressLine1,
              addressLine2: quote.site.addressLine2,
              city: quote.site.city,
              state: quote.site.state,
              postalCode: quote.site.postalCode
            }
          : null,
        customSiteName: quote.customSiteName
      })
    ),
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
