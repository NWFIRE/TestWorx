import { ComplianceReportingDivision, InspectionStatus, type Prisma } from "@prisma/client";
import { prisma } from "@testworx/db";
import { z } from "zod";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { resolveComplianceReportingFeeTx } from "./compliance-reporting-fees";
import { assertEnvForFeature, getOptionalQuickBooksEnv, getServerEnv } from "./env";
import { syncInspectionArchiveStateTx } from "./inspection-archive";
import type { JsonObject } from "./json-types";
import { assertTenantContext } from "./permissions";
import { resolveServiceFeeForLocationTx } from "./service-fees";

type QuickBooksTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

type QuickBooksTokenExchangeResult = {
  token: QuickBooksTokenResponse;
  intuitTid: string | null;
  httpStatus: number;
};

type QuickBooksConfig = {
  enabled: boolean;
  clientId: string | null;
  sandbox: boolean;
  mode: QuickBooksConnectionMode;
  callbackUrl: string;
};

type QuickBooksConnectionMode = "sandbox" | "live";

type QuickBooksTenantConnection = {
  id: string;
  name: string;
  quickbooksRealmId: string | null;
  quickbooksCompanyName: string | null;
  quickbooksConnectionMode: QuickBooksConnectionMode | null;
  quickbooksAccessToken: string | null;
  quickbooksRefreshToken: string | null;
  quickbooksTokenExpiresAt: Date | null;
  quickbooksConnectedAt: Date | null;
};

type QuickBooksConnectionStatus = {
  appMode: QuickBooksConnectionMode;
  appModeLabel: "Sandbox" | "Live";
  storedMode: QuickBooksConnectionMode | null;
  storedModeLabel: "Sandbox" | "Live" | "Unknown";
  hasStoredConnection: boolean;
  connected: boolean;
  reconnectRequired: boolean;
  modeMismatch: boolean;
  statusLabel: string;
  guidance: string | null;
  validationError: string | null;
};

type QuickBooksSupportReference = {
  intuitTid: string | null;
  message: string | null;
  action: string;
  createdAt: Date;
};

type QuickBooksBillingSummary = {
  id: string;
  tenantId: string;
  inspectionId: string;
  customerCompanyId: string;
  billingType?: "standard" | "third_party";
  billToAccountId?: string | null;
  billToName?: string | null;
  status: string;
  subtotal: number;
  notes: string | null;
  items: Array<{
    id: string;
    code?: string;
    description: string;
    quantity: number;
    unitPrice?: number | null;
    amount?: number | null;
    unit?: string;
    category: string;
  }>;
  quickbooksSyncStatus: string | null;
  quickbooksSendStatus: string | null;
  quickbooksInvoiceId: string | null;
  quickbooksInvoiceNumber: string | null;
};

type QuickBooksInvoiceSendResult = {
  summaryId: string;
  inspectionId: string;
  invoiceId: string;
  sendStatus: "sent" | "send_failed" | "send_skipped";
  sentTo: string | null;
  error: string | null;
};

type QuickBooksInvoiceRecord = {
  id: string;
  docNumber: string | null;
};

type QuickBooksCustomerInvoiceHistoryEntry = {
  invoiceId: string;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  dueDate: Date | null;
  totalAmount: number;
  balanceDue: number;
  paidAmount: number;
  paymentStatus: "paid" | "partial" | "open" | "overdue";
  statusLabel: string;
  memo: string | null;
  lastUpdatedAt: Date | null;
  lineItemSummary: string[];
  invoiceUrl: string;
};

type QuickBooksCatalogListItem = {
  id: string;
  quickbooksItemId: string;
  name: string;
  sku: string | null;
  itemType: string;
  active: boolean;
  taxable: boolean;
  unitPrice: number | null;
  importedAt: Date;
};

type QuickBooksItemSuggestion = {
  qbItemId: string;
  qbItemName: string;
  score: number;
};

type ResolvedQbItem =
  | {
      status: "mapped";
      qbItemId: string;
      qbItemName: string;
    }
  | {
      status: "needs_mapping";
      suggestions: QuickBooksItemSuggestion[];
      reason?: "missing_mapping" | "missing_item" | "inactive_item";
    };

type QuickBooksItemMappingStatus = "mapped" | "unmapped" | "inactive_in_quickbooks";

type QuickBooksItemMappingRow = {
  internalCode: string;
  internalName: string;
  currentMapping: {
    qbItemId: string;
    qbItemName: string;
    qbItemType: string | null;
    matchSource: string;
    qbActive: boolean;
  } | null;
  status: QuickBooksItemMappingStatus;
  suggestions: QuickBooksItemSuggestion[];
};

type QuickBooksItemMappingManualOption = {
  qbItemId: string;
  qbItemName: string;
  qbItemType: string | null;
  qbActive: boolean;
};

type QuickBooksCustomerRecord = {
  quickbooksCustomerId: string;
  displayName: string;
  companyName: string | null;
  syncToken: string | null;
  billingEmail: string | null;
  phone: string | null;
  contactName: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPostalCode: string | null;
  billingCountry: string | null;
  serviceAddressLine1: string | null;
  serviceAddressLine2: string | null;
  serviceCity: string | null;
  serviceState: string | null;
  servicePostalCode: string | null;
  serviceCountry: string | null;
  billingAddressSameAsService: boolean;
  paymentTermsCode: string;
  customPaymentTermsLabel: string | null;
  customPaymentTermsDays: number | null;
  quickbooksPaymentTermName: string | null;
  quickbooksPaymentTermId: string | null;
};

type QuickBooksCustomerSyncResult = {
  importedCustomerCount: number;
  customersCreated: number;
  customersUpdated: number;
  customersSynced: number;
};

type QuickBooksCustomerImportMatchStrategy = "quickbooks_id" | "billing_email" | "display_name" | "new";
type QuickBooksCustomerOutboundSyncStrategy = "quickbooks_id" | "display_name" | "created";

type QuickBooksCatalogFilterInput = {
  search?: string;
  itemType?: string;
  status?: "all" | "active" | "inactive";
  page?: number;
  limit?: number;
};

type QuickBooksFailureLogInput = {
  tenantId: string;
  actorUserId?: string | null;
  action: string;
  operation: string;
  message: string;
  entityType?: string;
  entityId?: string;
  httpStatus?: number | null;
  intuitTid?: string | null;
  rawBody?: string | null;
  connectionMode?: QuickBooksConnectionMode | null;
  metadata?: JsonObject;
};

export const quickBooksCatalogItemInputSchema = z.object({
  catalogItemId: z.string().trim().optional(),
  name: z.string().trim().min(1, "Name is required.").max(100),
  sku: z.string().trim().max(100).optional().transform((value) => value || undefined),
  itemType: z.enum(["Service", "NonInventory"]).default("Service"),
  unitPrice: z.number().finite().nonnegative().nullable(),
  taxable: z.boolean().default(false),
  active: z.boolean().default(true)
});

const directQuickBooksInvoiceLineInputSchema = z.object({
  catalogItemId: z.string().trim().min(1, "Select a product or service."),
  description: z.string().trim().min(1, "Line item description is required."),
  quantity: z.number().finite().positive("Quantity must be greater than zero."),
  unitPrice: z.number().finite().nonnegative("Unit price must be zero or greater."),
  taxable: z.boolean().default(false)
});

export const directInvoiceProposalTypeValues = [
  "fire_alarm",
  "fire_sprinkler",
  "kitchen_suppression",
  "fire_extinguisher",
  "industrial_suppression",
  "emergency_exit_lighting",
  "general_fire_protection"
] as const;
export type DirectInvoiceProposalType = (typeof directInvoiceProposalTypeValues)[number];

export const directQuickBooksInvoiceInputSchema = z.object({
  customerCompanyId: z.string().trim().optional(),
  walkInMode: z.boolean().default(false),
  walkInCustomerName: z.string().trim().optional(),
  walkInCustomerEmail: z.string().trim().email("Enter a valid billing email.").optional().or(z.literal("")),
  walkInCustomerPhone: z.string().trim().optional(),
  siteLabel: z.string().trim().optional(),
  proposalType: z.enum(directInvoiceProposalTypeValues).optional().nullable(),
  issueDate: z.string().trim().min(1, "Issue date is required."),
  dueDate: z.string().trim().optional(),
  memo: z.string().trim().optional(),
  sendEmail: z.boolean().default(false),
  lineItems: z.array(directQuickBooksInvoiceLineInputSchema).min(1, "Add at least one invoice line.")
}).superRefine((value, context) => {
  if (!value.customerCompanyId && !value.walkInCustomerName?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select an existing customer or enter a walk-in customer name.",
      path: ["walkInCustomerName"]
    });
  }

  if (value.customerCompanyId && !value.walkInMode && !value.proposalType) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select an invoice type for automatic fee rules.",
      path: ["proposalType"]
    });
  }
});

class QuickBooksRequestError extends Error {
  operation: string;
  httpStatus: number | null;
  intuitTid: string | null;
  rawBody: string | null;
  connectionMode: QuickBooksConnectionMode | null;

  constructor(input: {
    message: string;
    operation: string;
    httpStatus?: number | null;
    intuitTid?: string | null;
    rawBody?: string | null;
    connectionMode?: QuickBooksConnectionMode | null;
  }) {
    super(input.message);
    this.name = "QuickBooksRequestError";
    this.operation = input.operation;
    this.httpStatus = input.httpStatus ?? null;
    this.intuitTid = input.intuitTid ?? null;
    this.rawBody = input.rawBody ?? null;
    this.connectionMode = input.connectionMode ?? null;
  }
}

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function canManageQuickBooksConnection(role: string) {
  return ["tenant_admin", "platform_admin", "office_admin"].includes(role);
}

function canManageQuickBooksSync(role: string) {
  return ["tenant_admin", "platform_admin", "office_admin"].includes(role);
}

export function getQuickBooksConfiguration(): QuickBooksConfig {
  const env = getOptionalQuickBooksEnv();
  const app = getServerEnv();
  const mode = env.QUICKBOOKS_SANDBOX ? "sandbox" : "live";
  return {
    enabled: Boolean(env.QUICKBOOKS_CLIENT_ID && env.QUICKBOOKS_CLIENT_SECRET),
    clientId: env.QUICKBOOKS_CLIENT_ID,
    sandbox: env.QUICKBOOKS_SANDBOX,
    mode,
    callbackUrl: `${app.APP_URL}/api/quickbooks/callback`
  };
}

function formatQuickBooksConnectionModeLabel(mode: QuickBooksConnectionMode) {
  return mode === "sandbox" ? "Sandbox" : "Live";
}

function resolveQuickBooksAppMode() {
  return getQuickBooksConfiguration().mode;
}

function getQuickBooksConnectionStatus(connection: QuickBooksTenantConnection): QuickBooksConnectionStatus {
  const appMode = resolveQuickBooksAppMode();
  const appModeLabel = formatQuickBooksConnectionModeLabel(appMode);
  const storedMode = connection.quickbooksConnectionMode;
  const storedModeLabel = storedMode ? formatQuickBooksConnectionModeLabel(storedMode) : "Unknown";
  const hasStoredConnection = Boolean(connection.quickbooksRealmId && connection.quickbooksRefreshToken);
  const reconnectRequired = hasStoredConnection && !storedMode;
  const modeMismatch = hasStoredConnection && Boolean(storedMode) && storedMode !== appMode;
  const connected = hasStoredConnection && !reconnectRequired && !modeMismatch;

  let statusLabel = "Not connected";
  let guidance: string | null = null;

  if (connected) {
    statusLabel = `${appModeLabel} connected`;
  } else if (modeMismatch && storedMode) {
    statusLabel = `Reconnect required (${storedModeLabel} stored, ${appModeLabel} app)`;
    guidance = `This tenant is connected to QuickBooks ${storedModeLabel}. Reconnect in ${appModeLabel} mode before importing or syncing.`;
  } else if (reconnectRequired) {
    statusLabel = "Reconnect required";
    guidance = `Reconnect QuickBooks in ${appModeLabel} mode before importing or syncing. This connection was saved before environment tracking was added.`;
  }

  return {
    appMode,
    appModeLabel,
    storedMode,
    storedModeLabel,
    hasStoredConnection,
    connected,
    reconnectRequired,
    modeMismatch,
    statusLabel,
    guidance,
    validationError: null
  };
}

function isQuickBooksAuthorizationError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /ApplicationAuthorizationFailed|errorCode=003100|\"code\":\"3100\"|statusCode=403/i.test(error.message);
}

async function validateQuickBooksConnectionStatus(connection: QuickBooksTenantConnection) {
  const baseStatus = getQuickBooksConnectionStatus(connection);
  if (!baseStatus.connected) {
    return {
      status: baseStatus,
      companyName: connection.quickbooksCompanyName
    };
  }

  try {
    const companyName = await fetchQuickBooksCompanyName(connection);
    if (!companyName) {
      return {
        status: {
          ...baseStatus,
          connected: false,
          reconnectRequired: true,
          statusLabel: "Reconnect required",
          guidance: `Reconnect QuickBooks in ${baseStatus.appModeLabel} mode before importing or syncing. The current authorization could not be validated.`,
          validationError: "QuickBooks company validation returned no company details."
        } satisfies QuickBooksConnectionStatus,
        companyName: null
      };
    }

    return {
      status: baseStatus,
      companyName
    };
  } catch (error) {
    const normalizedError = normalizeQuickBooksError({
      error,
      fallbackOperation: "connection.validate",
      connectionMode: connection.quickbooksConnectionMode
    });
    await createQuickBooksFailureAuditLog({
      tenantId: connection.id,
      action: isQuickBooksAuthorizationError(error) ? "quickbooks.auth_failed" : "quickbooks.request_failed",
      operation: normalizedError.operation,
      message: normalizedError.message,
      httpStatus: normalizedError.httpStatus,
      intuitTid: normalizedError.intuitTid,
      rawBody: normalizedError.rawBody,
      connectionMode: connection.quickbooksConnectionMode
    });
    const validationError = normalizedError.message;
    const guidance = isQuickBooksAuthorizationError(error)
      ? `Reconnect QuickBooks in ${baseStatus.appModeLabel} mode before importing or syncing. The current QuickBooks authorization is no longer valid.`
      : `QuickBooks validation failed in ${baseStatus.appModeLabel} mode. Retry the connection if this continues.`;

    return {
      status: {
        ...baseStatus,
        connected: false,
        reconnectRequired: true,
        statusLabel: "Reconnect required",
        guidance,
        validationError
      } satisfies QuickBooksConnectionStatus,
      companyName: null
    };
  }
}

function assertQuickBooksConnectionUsable(connection: QuickBooksTenantConnection, purpose: string) {
  if (!connection.quickbooksRealmId || !connection.quickbooksRefreshToken) {
    throw new Error("Connect QuickBooks in tenant settings before continuing.");
  }

  const status = getQuickBooksConnectionStatus(connection);
  if (status.reconnectRequired) {
    throw new Error(`Reconnect QuickBooks in ${status.appModeLabel} mode before ${purpose}. This connection was saved before environment tracking was added.`);
  }

  if (status.modeMismatch) {
    throw new Error(`This tenant is connected to QuickBooks ${status.storedModeLabel}. Reconnect in ${status.appModeLabel} mode before ${purpose}.`);
  }

  return status;
}

export function buildQuickBooksInvoiceAppUrl(invoiceId: string, mode?: QuickBooksConnectionMode | null) {
  const effectiveMode = mode ?? resolveQuickBooksAppMode();
  const host = effectiveMode === "sandbox" ? "sandbox.qbo.intuit.com" : "qbo.intuit.com";
  return `https://${host}/app/invoice?txnId=${encodeURIComponent(invoiceId)}`;
}

function isVerifiedQuickBooksSyncStatus(status: string | null | undefined) {
  return status === "synced" || status === "sent";
}

function getQuickBooksAuthBaseUrl() {
  return "https://appcenter.intuit.com/connect/oauth2";
}

function getQuickBooksTokenUrl() {
  return "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
}

function getQuickBooksApiBaseUrl(sandbox: boolean, realmId: string) {
  return `${sandbox ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com"}/v3/company/${realmId}`;
}

function readIntuitTid(headers: Headers) {
  const raw = headers.get("intuit_tid");
  return raw && raw.trim().length > 0 ? raw.trim() : null;
}

function normalizeQuickBooksError(input: {
  error: unknown;
  fallbackOperation: string;
  connectionMode?: QuickBooksConnectionMode | null;
}) {
  if (input.error instanceof QuickBooksRequestError) {
    return input.error;
  }

  const message = input.error instanceof Error ? input.error.message : "QuickBooks request failed.";
  return new QuickBooksRequestError({
    message,
    operation: input.fallbackOperation,
    connectionMode: input.connectionMode ?? null
  });
}

function isQuickBooksDuplicateCustomerNameError(error: unknown) {
  if (!(error instanceof QuickBooksRequestError)) {
    return false;
  }

  const haystack = `${error.message}\n${error.rawBody ?? ""}`;
  return /Duplicate Name Exists Error|\"code\":\"6240\"|\"code\":6240|code\":\"6240\"|code\":6240/i.test(haystack);
}

async function createQuickBooksFailureAuditLog(input: QuickBooksFailureLogInput) {
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType ?? "Tenant",
      entityId: input.entityId ?? input.tenantId,
      metadata: {
        operation: input.operation,
        message: input.message,
        httpStatus: input.httpStatus ?? null,
        intuitTid: input.intuitTid ?? null,
        rawBody: input.rawBody ?? null,
        connectionMode: input.connectionMode ?? null,
        ...(input.metadata ?? {})
      } satisfies JsonObject
    }
  });
}

function buildAuthorizationHeader(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function qboQueryEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function sanitizeItemName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9 _-]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 100) || "TESTWORX ITEM";
}

function sanitizeCatalogMatchValue(value: string | null | undefined) {
  return value ? sanitizeItemName(value) : null;
}

export function normalizeQbName(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/\b(service|services|inspection|inspections|system|systems)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreQbItemMatch(term: string, candidate: string) {
  const a = normalizeQbName(term);
  const b = normalizeQbName(candidate);

  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 100;
  }

  if (b.startsWith(a) || a.startsWith(b)) {
    return 90;
  }

  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  return Math.round((overlap / Math.max(aTokens.size, bTokens.size)) * 70);
}

function getQuickBooksIntegrationId(connection: Pick<QuickBooksTenantConnection, "quickbooksRealmId">) {
  if (!connection.quickbooksRealmId) {
    throw new Error("QuickBooks integration is not connected for this tenant.");
  }

  return connection.quickbooksRealmId;
}

function getQuickBooksRuleLabelForBillingCode(billingCode: string) {
  const ruleKeys: Record<string, string> = {
    "KS-INSPECTION": "Standard Hood Inspection",
    "KS-INSPECTION-GUARDIAN/DENLAR": "Guardian Denlar Hood Inspection",
    "KS-INSPECTION-CAPTIVEAIRE": "CaptiveAire Hood Inspection"
  };

  return ruleKeys[billingCode] ?? null;
}

function buildQuickBooksBillingCodeMappingError(params: {
  billingCode: string;
  description: string;
  resolvedReason: "unmapped" | "missing_mapping" | "inactive_item" | "missing_item" | undefined;
  suggestions: Array<{ qbItemName: string }>;
}) {
  const { billingCode, description, resolvedReason, suggestions } = params;
  const suggestionText = suggestions.length > 0
    ? ` Suggested items: ${suggestions.map((suggestion) => suggestion.qbItemName).join(", ")}.`
    : "";
  const reasonText = resolvedReason === "inactive_item"
    ? " The mapped QuickBooks item is inactive."
    : resolvedReason === "missing_item"
      ? " The mapped QuickBooks item is missing from the local cache."
      : " No QuickBooks item is mapped yet.";
  const normalizedCode = billingCode.trim().toUpperCase();
  const isServiceFee = normalizedCode.startsWith("SERVICE_FEE");

  if (!isServiceFee) {
    return `QuickBooks item not mapped for billing code "${billingCode}".${reasonText}${suggestionText}`;
  }

  const guidance = normalizedCode === "SERVICE_FEE"
    ? " This service fee price is already being resolved correctly from your location-based fee rules. Map billing code \"SERVICE_FEE\" to the QuickBooks item you want to use for all service fees, or give specific location rules their own fee codes like \"SERVICE_FEE_LOCAL\" and map those separately."
    : ` This service fee price is already being resolved correctly from your location-based fee rules. QuickBooks still needs an item mapping for this specific fee code so it knows which product or service to use for "${description}".`;

  return `QuickBooks item not mapped for billing code "${billingCode}".${reasonText}${guidance}${suggestionText}`;
}

async function exchangeQuickBooksToken(grant: Record<string, string>) {
  const env = assertEnvForFeature("quickbooks") as {
    QUICKBOOKS_CLIENT_ID: string;
    QUICKBOOKS_CLIENT_SECRET: string;
    QUICKBOOKS_SANDBOX: boolean;
  };
  const callbackUrl = `${getServerEnv().APP_URL}/api/quickbooks/callback`;
  const body = new URLSearchParams({ redirect_uri: callbackUrl, ...grant });

  const response = await fetch(getQuickBooksTokenUrl(), {
    method: "POST",
    headers: {
      Authorization: buildAuthorizationHeader(env.QUICKBOOKS_CLIENT_ID, env.QUICKBOOKS_CLIENT_SECRET),
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new QuickBooksRequestError({
      message: `QuickBooks token exchange failed: ${errorText || response.statusText}`,
      operation: grant.grant_type === "refresh_token" ? "token.refresh" : "token.exchange",
      httpStatus: response.status,
      intuitTid: readIntuitTid(response.headers),
      rawBody: errorText || null,
      connectionMode: resolveQuickBooksAppMode()
    });
  }

  return {
    token: await response.json() as QuickBooksTokenResponse,
    intuitTid: readIntuitTid(response.headers),
    httpStatus: response.status
  } satisfies QuickBooksTokenExchangeResult;
}

async function getTenantQuickBooksConnection(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      quickbooksRealmId: true,
      quickbooksCompanyName: true,
      quickbooksConnectionMode: true,
      quickbooksAccessToken: true,
      quickbooksRefreshToken: true,
      quickbooksTokenExpiresAt: true,
      quickbooksConnectedAt: true
    }
  });

  if (!tenant) {
    throw new Error("Tenant not found.");
  }

  return tenant satisfies QuickBooksTenantConnection;
}

async function refreshQuickBooksTokenIfNeeded(connection: QuickBooksTenantConnection) {
  if (!connection.quickbooksRealmId || !connection.quickbooksRefreshToken) {
    throw new Error("QuickBooks is not connected for this tenant.");
  }

  const now = Date.now();
  if (
    connection.quickbooksAccessToken &&
    connection.quickbooksTokenExpiresAt &&
    connection.quickbooksTokenExpiresAt.getTime() > now + 2 * 60 * 1000
  ) {
    return connection;
  }

  let refreshed: QuickBooksTokenExchangeResult;
  try {
    refreshed = await exchangeQuickBooksToken({
      grant_type: "refresh_token",
      refresh_token: connection.quickbooksRefreshToken
    });
  } catch (error) {
    const normalizedError = normalizeQuickBooksError({
      error,
      fallbackOperation: "token.refresh",
      connectionMode: connection.quickbooksConnectionMode
    });
    await createQuickBooksFailureAuditLog({
      tenantId: connection.id,
      action: "quickbooks.auth_failed",
      operation: normalizedError.operation,
      message: normalizedError.message,
      httpStatus: normalizedError.httpStatus,
      intuitTid: normalizedError.intuitTid,
      rawBody: normalizedError.rawBody,
      connectionMode: connection.quickbooksConnectionMode
    });
    throw normalizedError;
  }

  return prisma.tenant.update({
    where: { id: connection.id },
    data: {
      quickbooksAccessToken: refreshed.token.access_token,
      quickbooksRefreshToken: refreshed.token.refresh_token,
      quickbooksTokenExpiresAt: new Date(Date.now() + refreshed.token.expires_in * 1000)
    },
    select: {
      id: true,
      name: true,
      quickbooksRealmId: true,
      quickbooksCompanyName: true,
      quickbooksConnectionMode: true,
      quickbooksAccessToken: true,
      quickbooksRefreshToken: true,
      quickbooksTokenExpiresAt: true,
      quickbooksConnectedAt: true
    }
  });
}

async function quickBooksApiRequest<T>(connection: QuickBooksTenantConnection, input: {
  path: string;
  method?: "GET" | "POST";
  searchParams?: URLSearchParams;
  body?: unknown;
}) {
  const config = getQuickBooksConfiguration();
  const refreshed = await refreshQuickBooksTokenIfNeeded(connection);
  const url = new URL(`${getQuickBooksApiBaseUrl(config.sandbox, refreshed.quickbooksRealmId as string)}${input.path}`);
  if (input.searchParams) {
    url.search = input.searchParams.toString();
  }

  const response = await fetch(url, {
    method: input.method ?? "GET",
    headers: {
      Authorization: `Bearer ${refreshed.quickbooksAccessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new QuickBooksRequestError({
      message: `QuickBooks request failed: ${errorText || response.statusText}`,
      operation: `${input.method ?? "GET"} ${input.path}`,
      httpStatus: response.status,
      intuitTid: readIntuitTid(response.headers),
      rawBody: errorText || null,
      connectionMode: connection.quickbooksConnectionMode
    });
  }

  return response.json() as Promise<T>;
}

async function getLatestQuickBooksSupportReference(tenantId: string) {
  const latest = await prisma.auditLog.findFirst({
    where: {
      tenantId,
      action: {
        in: [
          "quickbooks.auth_failed",
          "quickbooks.request_failed",
          "quickbooks.sync_failed",
          "quickbooks.customer_import_failed",
          "quickbooks.customer_sync_failed",
          "quickbooks.catalog_import_failed",
          "quickbooks.send_failed"
        ]
      }
    },
    orderBy: { createdAt: "desc" },
    select: {
      action: true,
      createdAt: true,
      metadata: true
    }
  });

  if (!latest || !latest.metadata || typeof latest.metadata !== "object" || Array.isArray(latest.metadata)) {
    return null;
  }

  const metadata = latest.metadata as Record<string, unknown>;
  return {
    action: latest.action,
    createdAt: latest.createdAt,
    intuitTid: typeof metadata.intuitTid === "string" && metadata.intuitTid.trim().length > 0 ? metadata.intuitTid.trim() : null,
    message: typeof metadata.message === "string" && metadata.message.trim().length > 0 ? metadata.message.trim() : null
  } satisfies QuickBooksSupportReference;
}

function readQuickBooksDocNumber(invoice: unknown) {
  if (!invoice || typeof invoice !== "object") {
    return null;
  }

  const rawDocNumber = (invoice as Record<string, unknown>).DocNumber;
  return typeof rawDocNumber === "string" && rawDocNumber.trim().length > 0
    ? rawDocNumber.trim()
    : null;
}

function normalizeQuickBooksInvoiceRecord(invoice: unknown): QuickBooksInvoiceRecord | null {
  if (!invoice || typeof invoice !== "object") {
    return null;
  }

  const rawId = "Id" in invoice ? invoice.Id : undefined;
  if (typeof rawId !== "string" || rawId.trim().length === 0) {
    return null;
  }

  return {
    id: rawId.trim(),
    docNumber: readQuickBooksDocNumber(invoice)
  } satisfies QuickBooksInvoiceRecord;
}

async function fetchQuickBooksInvoice(connection: QuickBooksTenantConnection, input: {
  invoiceId?: string | null;
  docNumber?: string | null;
}) {
  const normalizedInvoiceId = typeof input.invoiceId === "string" && input.invoiceId.trim().length > 0
    ? input.invoiceId.trim()
    : null;
  const normalizedDocNumber = typeof input.docNumber === "string" && input.docNumber.trim().length > 0
    ? input.docNumber.trim()
    : null;

  if (normalizedInvoiceId) {
    try {
      const invoiceById = await quickBooksApiRequest<{ Invoice?: unknown }>(connection, {
        path: `/invoice/${normalizedInvoiceId}`
      });
      const normalized = normalizeQuickBooksInvoiceRecord(invoiceById.Invoice);
      if (normalized) {
        return normalized;
      }
    } catch {
      return null;
    }

    return null;
  }

  if (normalizedDocNumber) {
    const queryResponse = await quickBooksApiRequest<{ QueryResponse?: { Invoice?: unknown[] } }>(connection, {
      path: "/query",
      searchParams: new URLSearchParams({
        query: `select * from Invoice where DocNumber = '${qboQueryEscape(normalizedDocNumber)}' maxresults 1`
      })
    });
    const normalized = normalizeQuickBooksInvoiceRecord(queryResponse.QueryResponse?.Invoice?.[0]);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function readQuickBooksDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readQuickBooksNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeQuickBooksInvoiceHistoryEntry(
  invoice: unknown,
  mode: QuickBooksConnectionMode | null
): QuickBooksCustomerInvoiceHistoryEntry | null {
  if (!invoice || typeof invoice !== "object") {
    return null;
  }

  const record = invoice as Record<string, unknown>;
  const id = typeof record.Id === "string" && record.Id.trim() ? record.Id.trim() : null;
  if (!id) {
    return null;
  }

  const invoiceNumber = readQuickBooksDocNumber(invoice);
  const invoiceDate = readQuickBooksDate(record.TxnDate);
  const dueDate = readQuickBooksDate(record.DueDate);
  const totalAmount = readQuickBooksNumber(record.TotalAmt);
  const balanceDue = readQuickBooksNumber(record.Balance);
  const paidAmount = Math.max(0, Number((totalAmount - balanceDue).toFixed(2)));
  const memo =
    typeof record.PrivateNote === "string" && record.PrivateNote.trim()
      ? record.PrivateNote.trim()
      : typeof (record.CustomerMemo as { value?: unknown } | undefined)?.value === "string" &&
          String((record.CustomerMemo as { value?: unknown }).value).trim()
        ? String((record.CustomerMemo as { value?: unknown }).value).trim()
        : null;
  const lastUpdatedAt = readQuickBooksDate((record.MetaData as { LastUpdatedTime?: unknown } | undefined)?.LastUpdatedTime);
  const now = new Date();
  const paymentStatus: QuickBooksCustomerInvoiceHistoryEntry["paymentStatus"] =
    balanceDue <= 0
      ? "paid"
      : balanceDue < totalAmount
        ? "partial"
        : dueDate && dueDate.getTime() < now.getTime()
          ? "overdue"
          : "open";
  const statusLabel =
    paymentStatus === "paid"
      ? "Paid"
      : paymentStatus === "partial"
        ? "Partially paid"
        : paymentStatus === "overdue"
          ? "Overdue"
          : "Open";
  const lineItemSummary = Array.isArray(record.Line)
    ? (record.Line as Array<Record<string, unknown>>)
        .map((line) => (typeof line.Description === "string" ? line.Description.trim() : ""))
        .filter(Boolean)
        .slice(0, 4)
    : [];

  return {
    invoiceId: id,
    invoiceNumber,
    invoiceDate,
    dueDate,
    totalAmount,
    balanceDue,
    paidAmount,
    paymentStatus,
    statusLabel,
    memo,
    lastUpdatedAt,
    lineItemSummary,
    invoiceUrl: buildQuickBooksInvoiceAppUrl(id, mode)
  };
}

async function fetchQuickBooksEstimate(connection: QuickBooksTenantConnection, input: {
  estimateId?: string | null;
  docNumber?: string | null;
}) {
  const normalizedEstimateId = typeof input.estimateId === "string" && input.estimateId.trim().length > 0
    ? input.estimateId.trim()
    : null;
  const normalizedDocNumber = typeof input.docNumber === "string" && input.docNumber.trim().length > 0
    ? input.docNumber.trim()
    : null;

  if (normalizedEstimateId) {
    try {
      const estimateById = await quickBooksApiRequest<{ Estimate?: unknown }>(connection, {
        path: `/estimate/${normalizedEstimateId}`
      });
      const normalized = normalizeQuickBooksInvoiceRecord(estimateById.Estimate);
      if (normalized) {
        return normalized;
      }
    } catch {
      return null;
    }

    return null;
  }

  if (normalizedDocNumber) {
    const queryResponse = await quickBooksApiRequest<{ QueryResponse?: { Estimate?: unknown[] } }>(connection, {
      path: "/query",
      searchParams: new URLSearchParams({
        query: `select * from Estimate where DocNumber = '${qboQueryEscape(normalizedDocNumber)}' maxresults 1`
      })
    });
    const normalized = normalizeQuickBooksInvoiceRecord(queryResponse.QueryResponse?.Estimate?.[0]);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function readQuickBooksStringField(value: unknown, field: string) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = (value as Record<string, unknown>)[field];
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

function readQuickBooksBooleanField(value: unknown, field: string) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = (value as Record<string, unknown>)[field];
  return typeof raw === "boolean" ? raw : null;
}

function readQuickBooksNumberField(value: unknown, field: string) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = (value as Record<string, unknown>)[field];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function buildQuickBooksContactName(value: unknown) {
  const parts = [
    readQuickBooksStringField(value, "GivenName"),
    readQuickBooksStringField(value, "MiddleName"),
    readQuickBooksStringField(value, "FamilyName")
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" ") : null;
}

function readQuickBooksAddress(value: unknown) {
  return {
    line1: readQuickBooksStringField(value, "Line1"),
    line2: readQuickBooksStringField(value, "Line2"),
    city: readQuickBooksStringField(value, "City"),
    state: readQuickBooksStringField(value, "CountrySubDivisionCode"),
    postalCode: readQuickBooksStringField(value, "PostalCode"),
    country: readQuickBooksStringField(value, "Country")
  };
}

function normalizeAddressValue(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") || null;
}

function addressesMatch(
  first: ReturnType<typeof readQuickBooksAddress>,
  second: ReturnType<typeof readQuickBooksAddress>
) {
  return normalizeAddressValue(first.line1) === normalizeAddressValue(second.line1)
    && normalizeAddressValue(first.line2) === normalizeAddressValue(second.line2)
    && normalizeAddressValue(first.city) === normalizeAddressValue(second.city)
    && normalizeAddressValue(first.state) === normalizeAddressValue(second.state)
    && normalizeAddressValue(first.postalCode) === normalizeAddressValue(second.postalCode)
    && normalizeAddressValue(first.country) === normalizeAddressValue(second.country);
}

function parseCustomPaymentDays(label: string | null) {
  if (!label) {
    return null;
  }

  const match = label.match(/net\s*(\d{1,3})/i);
  if (!match?.[1]) {
    return null;
  }

  const days = Number.parseInt(match[1], 10);
  return Number.isFinite(days) ? days : null;
}

async function resolveQuickBooksPaymentTerms(connection: QuickBooksTenantConnection, customer: unknown) {
  const salesTermRef = customer && typeof customer === "object"
    ? ((customer as Record<string, unknown>).SalesTermRef as Record<string, unknown> | undefined)
    : undefined;

  const quickbooksPaymentTermId = readQuickBooksStringField(salesTermRef, "value");
  let quickbooksPaymentTermName = readQuickBooksStringField(salesTermRef, "name");

  if (!quickbooksPaymentTermName && quickbooksPaymentTermId) {
    try {
      const response = await quickBooksApiRequest<{ Term?: unknown }>(connection, {
        path: `/term/${encodeURIComponent(quickbooksPaymentTermId)}`
      });
      quickbooksPaymentTermName = readQuickBooksStringField(response.Term, "Name");
    } catch {
      quickbooksPaymentTermName = null;
    }
  }

  const normalizedTermName = quickbooksPaymentTermName?.trim().toLowerCase() || null;

  if (!normalizedTermName || /due\s+on\s+receipt|due\s+upon\s+receipt|due\s+at\s+time\s+of\s+service|due\s+immediately/i.test(normalizedTermName)) {
    return {
      paymentTermsCode: "due_on_receipt",
      customPaymentTermsLabel: null,
      customPaymentTermsDays: null,
      quickbooksPaymentTermName,
      quickbooksPaymentTermId
    };
  }

  if (/net\s*15/i.test(normalizedTermName)) {
    return {
      paymentTermsCode: "net_15",
      customPaymentTermsLabel: null,
      customPaymentTermsDays: null,
      quickbooksPaymentTermName,
      quickbooksPaymentTermId
    };
  }

  if (/net\s*30/i.test(normalizedTermName)) {
    return {
      paymentTermsCode: "net_30",
      customPaymentTermsLabel: null,
      customPaymentTermsDays: null,
      quickbooksPaymentTermName,
      quickbooksPaymentTermId
    };
  }

  if (/net\s*60/i.test(normalizedTermName)) {
    return {
      paymentTermsCode: "net_60",
      customPaymentTermsLabel: null,
      customPaymentTermsDays: null,
      quickbooksPaymentTermName,
      quickbooksPaymentTermId
    };
  }

  return {
    paymentTermsCode: "custom",
    customPaymentTermsLabel: quickbooksPaymentTermName,
    customPaymentTermsDays: parseCustomPaymentDays(quickbooksPaymentTermName),
    quickbooksPaymentTermName,
    quickbooksPaymentTermId
  };
}

async function normalizeQuickBooksCustomer(connection: QuickBooksTenantConnection, customer: unknown) {
  const quickbooksCustomerId = readQuickBooksStringField(customer, "Id");
  const displayName = readQuickBooksStringField(customer, "DisplayName");

  if (!quickbooksCustomerId || !displayName) {
    return null;
  }

  const primaryEmail = customer && typeof customer === "object"
    ? ((customer as Record<string, unknown>).PrimaryEmailAddr as Record<string, unknown> | undefined)
    : undefined;
  const primaryPhone = customer && typeof customer === "object"
    ? ((customer as Record<string, unknown>).PrimaryPhone as Record<string, unknown> | undefined)
    : undefined;
  const billAddr = customer && typeof customer === "object"
    ? ((customer as Record<string, unknown>).BillAddr as Record<string, unknown> | undefined)
    : undefined;
  const shipAddr = customer && typeof customer === "object"
    ? ((customer as Record<string, unknown>).ShipAddr as Record<string, unknown> | undefined)
    : undefined;
  const billingAddress = readQuickBooksAddress(billAddr);
  const serviceAddress = readQuickBooksAddress(shipAddr);
  const paymentTerms = await resolveQuickBooksPaymentTerms(connection, customer);

  return {
    quickbooksCustomerId,
    displayName,
    companyName: readQuickBooksStringField(customer, "CompanyName"),
    syncToken: readQuickBooksStringField(customer, "SyncToken"),
    billingEmail: readQuickBooksStringField(primaryEmail, "Address"),
    phone: readQuickBooksStringField(primaryPhone, "FreeFormNumber"),
    contactName: buildQuickBooksContactName(customer),
    billingAddressLine1: billingAddress.line1,
    billingAddressLine2: billingAddress.line2,
    billingCity: billingAddress.city,
    billingState: billingAddress.state,
    billingPostalCode: billingAddress.postalCode,
    billingCountry: billingAddress.country,
    serviceAddressLine1: serviceAddress.line1,
    serviceAddressLine2: serviceAddress.line2,
    serviceCity: serviceAddress.city,
    serviceState: serviceAddress.state,
    servicePostalCode: serviceAddress.postalCode,
    serviceCountry: serviceAddress.country,
    billingAddressSameAsService: Boolean(
      (billingAddress.line1 || billingAddress.city || billingAddress.state || billingAddress.postalCode || billingAddress.country)
      && (serviceAddress.line1 || serviceAddress.city || serviceAddress.state || serviceAddress.postalCode || serviceAddress.country)
      && addressesMatch(billingAddress, serviceAddress)
    ),
    paymentTermsCode: paymentTerms.paymentTermsCode,
    customPaymentTermsLabel: paymentTerms.customPaymentTermsLabel,
    customPaymentTermsDays: paymentTerms.customPaymentTermsDays,
    quickbooksPaymentTermName: paymentTerms.quickbooksPaymentTermName,
    quickbooksPaymentTermId: paymentTerms.quickbooksPaymentTermId
  } satisfies QuickBooksCustomerRecord;
}

function normalizeQuickBooksCatalogItem(item: unknown) {
  const quickbooksItemId = readQuickBooksStringField(item, "Id");
  const name = readQuickBooksStringField(item, "Name");
  const itemType = readQuickBooksStringField(item, "Type");

  if (!quickbooksItemId || !name || !itemType) {
    return null;
  }

  const incomeAccountRef = item && typeof item === "object"
    ? ((item as Record<string, unknown>).IncomeAccountRef as Record<string, unknown> | undefined)
    : undefined;
  const salesTaxCodeRef = item && typeof item === "object"
    ? ((item as Record<string, unknown>).SalesTaxCodeRef as Record<string, unknown> | undefined)
    : undefined;
  const salesTaxCode = readQuickBooksStringField(salesTaxCodeRef, "value")
    ?? readQuickBooksStringField(salesTaxCodeRef, "name")
    ?? readQuickBooksStringField(item, "SalesTaxCode")
    ?? readQuickBooksStringField(item, "TaxCodeRef");
  const taxable = salesTaxCode ? salesTaxCode.trim().toUpperCase() === "TAX" : false;

  return {
    quickbooksItemId,
    name,
    sku: readQuickBooksStringField(item, "Sku"),
    itemType,
    active: readQuickBooksBooleanField(item, "Active") ?? true,
    taxable,
    syncToken: readQuickBooksStringField(item, "SyncToken"),
    unitPrice: readQuickBooksNumberField(item, "UnitPrice"),
    incomeAccountId: readQuickBooksStringField(incomeAccountRef, "value"),
    incomeAccountName: readQuickBooksStringField(incomeAccountRef, "name"),
    rawJson: item as JsonObject
  };
}

async function fetchQuickBooksCatalogItemById(connection: QuickBooksTenantConnection, quickbooksItemId: string) {
  const response = await quickBooksApiRequest<{ Item?: unknown }>(connection, {
    path: `/item/${encodeURIComponent(quickbooksItemId)}`
  });

  return response.Item ?? null;
}

async function upsertTenantQuickBooksCatalogItem(input: {
  tenantId: string;
  integrationId: string;
  item: unknown;
}) {
  const normalizedItem = normalizeQuickBooksCatalogItem(input.item);
  if (!normalizedItem) {
    throw new Error("QuickBooks returned an incomplete catalog item response.");
  }

  const data = {
    tenantId: input.tenantId,
    quickbooksItemId: normalizedItem.quickbooksItemId,
    name: normalizedItem.name,
    sku: normalizedItem.sku,
    itemType: normalizedItem.itemType,
    active: normalizedItem.active,
    taxable: normalizedItem.taxable,
    unitPrice: normalizedItem.unitPrice,
    incomeAccountId: normalizedItem.incomeAccountId,
    incomeAccountName: normalizedItem.incomeAccountName,
    rawJson: normalizedItem.rawJson,
    importedAt: new Date()
  };

  await prisma.quickBooksItemCache.upsert({
    where: {
      tenantId_integrationId_qbItemId: {
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        qbItemId: normalizedItem.quickbooksItemId
      }
    },
    update: {
      qbItemName: normalizedItem.name,
      normalizedName: normalizeQbName(normalizedItem.name),
      qbItemType: normalizedItem.itemType,
      qbActive: normalizedItem.active,
      qbSyncToken: normalizedItem.syncToken ?? null,
      rawJson: normalizedItem.rawJson,
      lastSyncedAt: new Date()
    },
    create: {
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      qbItemId: normalizedItem.quickbooksItemId,
      qbItemName: normalizedItem.name,
      normalizedName: normalizeQbName(normalizedItem.name),
      qbItemType: normalizedItem.itemType,
      qbActive: normalizedItem.active,
      qbSyncToken: normalizedItem.syncToken ?? null,
      rawJson: normalizedItem.rawJson,
      lastSyncedAt: new Date()
    }
  });

  const existing = await prisma.quickBooksCatalogItem.findFirst({
    where: {
      tenantId: input.tenantId,
      quickbooksItemId: normalizedItem.quickbooksItemId
    },
    select: { id: true }
  });

  if (existing) {
    return prisma.quickBooksCatalogItem.update({
      where: { id: existing.id },
      data
    });
  }

  return prisma.quickBooksCatalogItem.create({
    data
  });
}

async function findQuickBooksItemSuggestions(input: {
  tenantId: string;
  integrationId: string;
  term: string;
  limit?: number;
}) {
  const candidates = await prisma.quickBooksItemCache.findMany({
    where: {
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      qbActive: true
    },
    select: {
      qbItemId: true,
      qbItemName: true
    },
    take: 500
  });

  return candidates
    .map((candidate) => ({
      qbItemId: candidate.qbItemId,
      qbItemName: candidate.qbItemName,
      score: scoreQbItemMatch(input.term, candidate.qbItemName)
    }))
    .filter((candidate) => candidate.score >= 60)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.qbItemName.localeCompare(right.qbItemName);
    })
    .slice(0, input.limit ?? 10);
}

async function saveQuickBooksItemMapping(input: {
  tenantId: string;
  integrationId: string;
  internalCode: string;
  internalName: string;
  qbItemId: string;
  matchSource?: "manual" | "auto" | "rule";
}) {
  const cached = await prisma.quickBooksItemCache.findUnique({
    where: {
      tenantId_integrationId_qbItemId: {
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        qbItemId: input.qbItemId
      }
    }
  });

  if (!cached) {
    throw new Error("QuickBooks item not found in cache.");
  }

  return prisma.quickBooksItemMap.upsert({
    where: {
      tenantId_integrationId_internalCode: {
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        internalCode: input.internalCode
      }
    },
    update: {
      internalName: input.internalName,
      qbItemId: cached.qbItemId,
      qbItemName: cached.qbItemName,
      qbItemType: cached.qbItemType,
      qbSyncToken: cached.qbSyncToken,
      qbActive: cached.qbActive,
      matchSource: input.matchSource ?? "manual"
    },
    create: {
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      internalCode: input.internalCode,
      internalName: input.internalName,
      qbItemId: cached.qbItemId,
      qbItemName: cached.qbItemName,
      qbItemType: cached.qbItemType,
      qbSyncToken: cached.qbSyncToken,
      qbActive: cached.qbActive,
      matchSource: input.matchSource ?? "manual"
    }
  });
}

async function clearQuickBooksItemMapping(input: {
  tenantId: string;
  integrationId: string;
  internalCode: string;
}) {
  await prisma.quickBooksItemMap.deleteMany({
    where: {
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      internalCode: input.internalCode
    }
  });
}

export async function validateMappedQbItem(input: {
  tenantId: string;
  integrationId: string;
  internalCode: string;
}) {
  const mapping = await prisma.quickBooksItemMap.findUnique({
    where: {
      tenantId_integrationId_internalCode: {
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        internalCode: input.internalCode
      }
    }
  });

  if (!mapping) {
    return { ok: false, reason: "missing_mapping" as const };
  }

  const cached = await prisma.quickBooksItemCache.findUnique({
    where: {
      tenantId_integrationId_qbItemId: {
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        qbItemId: mapping.qbItemId
      }
    }
  });

  if (!cached) {
    return { ok: false, reason: "missing_item" as const };
  }

  if (!cached.qbActive) {
    return { ok: false, reason: "inactive_item" as const };
  }

  return { ok: true as const, item: cached };
}

async function tryResolveRuleBasedQuickBooksMapping(input: {
  tenantId: string;
  integrationId: string;
  billingCode: string;
  displayName: string;
}) {
  const ruleLabel = getQuickBooksRuleLabelForBillingCode(input.billingCode);
  if (!ruleLabel) {
    return null;
  }

  const exactMatch = await prisma.quickBooksItemCache.findFirst({
    where: {
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      qbActive: true,
      normalizedName: normalizeQbName(ruleLabel)
    }
  });

  if (!exactMatch) {
    return null;
  }

  await saveQuickBooksItemMapping({
    tenantId: input.tenantId,
    integrationId: input.integrationId,
    internalCode: input.billingCode,
    internalName: input.displayName,
    qbItemId: exactMatch.qbItemId,
    matchSource: "rule"
  });

  return {
    status: "mapped" as const,
    qbItemId: exactMatch.qbItemId,
    qbItemName: exactMatch.qbItemName
  };
}

export async function resolveQuickBooksItemForBilling(input: {
  tenantId: string;
  integrationId: string;
  billingCode: string;
  displayName: string;
}): Promise<ResolvedQbItem> {
  const existingMap = await prisma.quickBooksItemMap.findUnique({
    where: {
      tenantId_integrationId_internalCode: {
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        internalCode: input.billingCode
      }
    }
  });

  if (existingMap) {
    const validation = await validateMappedQbItem({
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      internalCode: input.billingCode
    });

    if (validation.ok && "item" in validation) {
      const validatedItem = validation.item!;
      return {
        status: "mapped",
        qbItemId: validatedItem.qbItemId,
        qbItemName: validatedItem.qbItemName
      };
    }

    return {
      status: "needs_mapping",
      reason: validation.reason,
      suggestions: await findQuickBooksItemSuggestions({
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        term: input.displayName
      })
    };
  }

  const ruleResolved = await tryResolveRuleBasedQuickBooksMapping(input);
  if (ruleResolved) {
    return ruleResolved;
  }

  return {
    status: "needs_mapping",
    reason: "missing_mapping",
    suggestions: await findQuickBooksItemSuggestions({
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      term: input.displayName
    })
  };
}

async function fetchQuickBooksCompanyName(connection: QuickBooksTenantConnection) {
  const response = await quickBooksApiRequest<{ CompanyInfo?: { CompanyName?: string } }>(connection, {
    path: `/companyinfo/${connection.quickbooksRealmId}`
  });
  return response.CompanyInfo?.CompanyName ?? null;
}

async function fetchQuickBooksCustomerById(connection: QuickBooksTenantConnection, quickbooksCustomerId: string) {
  const response = await quickBooksApiRequest<{ Customer?: unknown }>(connection, {
    path: `/customer/${quickbooksCustomerId}`
  });

  return normalizeQuickBooksCustomer(connection, response.Customer);
}

async function fetchQuickBooksCustomerByDisplayName(connection: QuickBooksTenantConnection, displayName: string) {
  const response = await quickBooksApiRequest<{ QueryResponse?: { Customer?: unknown[] } }>(connection, {
    path: "/query",
    searchParams: new URLSearchParams({
      query: `select * from Customer where DisplayName = '${qboQueryEscape(displayName)}' maxresults 1`
    })
  });

  return normalizeQuickBooksCustomer(connection, response.QueryResponse?.Customer?.[0]);
}

function normalizeCustomerMatchValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

type ExistingCustomerCompanySyncRecord = {
  id: string;
  name: string;
  contactName: string | null;
  billingEmail: string | null;
  phone: string | null;
};

async function findExistingTradeWorxCustomerForQuickBooksImport(
  tenantId: string,
  customer: QuickBooksCustomerRecord
): Promise<{ customer: ExistingCustomerCompanySyncRecord | null; matchStrategy: QuickBooksCustomerImportMatchStrategy }> {
  const select = {
    id: true,
    name: true,
    contactName: true,
    billingEmail: true,
    phone: true
  } satisfies Prisma.CustomerCompanySelect;

  const existingCustomerByQuickBooksId = await prisma.customerCompany.findFirst({
    where: {
      tenantId,
      quickbooksCustomerId: customer.quickbooksCustomerId
    },
    select
  });

  if (existingCustomerByQuickBooksId) {
    return { customer: existingCustomerByQuickBooksId, matchStrategy: "quickbooks_id" };
  }

  const normalizedBillingEmail = normalizeCustomerMatchValue(customer.billingEmail);
  if (normalizedBillingEmail) {
    const existingCustomerByBillingEmail = await prisma.customerCompany.findFirst({
      where: {
        tenantId,
        billingEmail: {
          equals: customer.billingEmail as string,
          mode: "insensitive"
        }
      },
      select
    });

    if (existingCustomerByBillingEmail) {
      return { customer: existingCustomerByBillingEmail, matchStrategy: "billing_email" };
    }
  }

  const existingCustomerByDisplayName = await prisma.customerCompany.findFirst({
    where: {
      tenantId,
      name: customer.displayName
    },
    select
  });

  return {
    customer: existingCustomerByDisplayName,
    matchStrategy: existingCustomerByDisplayName ? "display_name" : "new"
  };
}

function buildQuickBooksCustomerPayload(input: {
  customerName: string;
  billingEmail: string | null;
  phone: string | null;
  siteName?: string | null;
  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingPostalCode?: string | null;
  billingCountry?: string | null;
  serviceAddressLine1?: string | null;
  serviceAddressLine2?: string | null;
  serviceCity?: string | null;
  serviceState?: string | null;
  servicePostalCode?: string | null;
  serviceCountry?: string | null;
  notes?: string | null;
}) {
  return {
    DisplayName: input.customerName,
    CompanyName: input.customerName,
    ...(input.billingEmail ? { PrimaryEmailAddr: { Address: input.billingEmail } } : {}),
    ...(input.phone ? { PrimaryPhone: { FreeFormNumber: input.phone } } : {}),
    ...(input.billingAddressLine1
      ? {
          BillAddr: {
            Line1: input.billingAddressLine1,
            ...(input.billingAddressLine2 ? { Line2: input.billingAddressLine2 } : {}),
            ...(input.billingCity ? { City: input.billingCity } : {}),
            ...(input.billingState ? { CountrySubDivisionCode: input.billingState } : {}),
            ...(input.billingPostalCode ? { PostalCode: input.billingPostalCode } : {}),
            ...(input.billingCountry ? { Country: input.billingCountry } : {})
          }
        }
      : {}),
    ...(input.serviceAddressLine1
      ? {
          ShipAddr: {
            Line1: input.serviceAddressLine1,
            ...(input.serviceAddressLine2 ? { Line2: input.serviceAddressLine2 } : {}),
            ...(input.serviceCity ? { City: input.serviceCity } : {}),
            ...(input.serviceState ? { CountrySubDivisionCode: input.serviceState } : {}),
            ...(input.servicePostalCode ? { PostalCode: input.servicePostalCode } : {}),
            ...(input.serviceCountry ? { Country: input.serviceCountry } : {})
          }
        }
      : {}),
    ...((input.notes || input.siteName) ? { Notes: input.notes ?? `Created by TradeWorx for ${input.siteName}` } : {})
  };
}

async function resolveQuickBooksCustomer(connection: QuickBooksTenantConnection, summary: {
  customerCompanyId: string;
  customerName: string;
  billingEmail: string | null;
  phone: string | null;
  siteName: string;
  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingPostalCode?: string | null;
  billingCountry?: string | null;
  notes?: string | null;
}) {
  const customerRecord = await prisma.customerCompany.findUnique({
    where: { id: summary.customerCompanyId },
    select: { quickbooksCustomerId: true }
  });

  if (customerRecord?.quickbooksCustomerId) {
    const existingCustomer = await fetchQuickBooksCustomerById(connection, customerRecord.quickbooksCustomerId).catch(() => null);
    if (existingCustomer?.quickbooksCustomerId) {
      const updated = await quickBooksApiRequest<{ Customer?: unknown }>(connection, {
        path: "/customer",
        method: "POST",
        searchParams: new URLSearchParams({ operation: "update" }),
        body: {
          Id: existingCustomer.quickbooksCustomerId,
          SyncToken: existingCustomer.syncToken,
          sparse: true,
          ...buildQuickBooksCustomerPayload(summary)
        }
      });

      const updatedCustomer = (await normalizeQuickBooksCustomer(connection, updated.Customer)) ?? existingCustomer;
      await prisma.customerCompany.update({
        where: { id: summary.customerCompanyId },
        data: { quickbooksCustomerId: updatedCustomer.quickbooksCustomerId }
      });
      return updatedCustomer.quickbooksCustomerId;
    }
  }

  const existingCustomer = await fetchQuickBooksCustomerByDisplayName(connection, summary.customerName);
  if (existingCustomer?.quickbooksCustomerId) {
    const updated = await quickBooksApiRequest<{ Customer?: unknown }>(connection, {
      path: "/customer",
      method: "POST",
      searchParams: new URLSearchParams({ operation: "update" }),
      body: {
        Id: existingCustomer.quickbooksCustomerId,
        SyncToken: existingCustomer.syncToken,
        sparse: true,
        ...buildQuickBooksCustomerPayload(summary)
      }
    });

    const updatedCustomer = (await normalizeQuickBooksCustomer(connection, updated.Customer)) ?? existingCustomer;
    await prisma.customerCompany.update({
      where: { id: summary.customerCompanyId },
      data: { quickbooksCustomerId: updatedCustomer.quickbooksCustomerId }
    });
    return updatedCustomer.quickbooksCustomerId;
  }

  const created = await quickBooksApiRequest<{ Customer?: { Id: string } }>(connection, {
    path: "/customer",
    method: "POST",
    body: buildQuickBooksCustomerPayload(summary)
  });

  const createdCustomerId = created.Customer?.Id;
  if (!createdCustomerId) {
    throw new Error("QuickBooks did not return a customer id.");
  }

  await prisma.customerCompany.update({
    where: { id: summary.customerCompanyId },
    data: { quickbooksCustomerId: createdCustomerId }
  });

  return createdCustomerId;
}

async function resolveQuickBooksPayerAccount(connection: QuickBooksTenantConnection, payer: {
  payerAccountId: string;
  payerName: string;
  billingEmail: string | null;
  phone: string | null;
  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingPostalCode?: string | null;
  billingCountry?: string | null;
  notes?: string | null;
}) {
  const payerRecord = await prisma.billingPayerAccount.findUnique({
    where: { id: payer.payerAccountId },
    select: { quickbooksCustomerId: true }
  });

  if (payerRecord?.quickbooksCustomerId) {
    const existingCustomer = await fetchQuickBooksCustomerById(connection, payerRecord.quickbooksCustomerId).catch(() => null);
    if (existingCustomer?.quickbooksCustomerId) {
      const updated = await quickBooksApiRequest<{ Customer?: unknown }>(connection, {
        path: "/customer",
        method: "POST",
        searchParams: new URLSearchParams({ operation: "update" }),
        body: {
          Id: existingCustomer.quickbooksCustomerId,
          SyncToken: existingCustomer.syncToken,
          sparse: true,
          ...buildQuickBooksCustomerPayload({
            customerName: payer.payerName,
            billingEmail: payer.billingEmail,
            phone: payer.phone,
            siteName: payer.payerName,
            billingAddressLine1: payer.billingAddressLine1,
            billingAddressLine2: payer.billingAddressLine2,
            billingCity: payer.billingCity,
            billingState: payer.billingState,
            billingPostalCode: payer.billingPostalCode,
            billingCountry: payer.billingCountry,
            notes: payer.notes
          })
        }
      });

      const updatedCustomer = (await normalizeQuickBooksCustomer(connection, updated.Customer)) ?? existingCustomer;
      await prisma.billingPayerAccount.update({
        where: { id: payer.payerAccountId },
        data: { quickbooksCustomerId: updatedCustomer.quickbooksCustomerId }
      });
      return updatedCustomer.quickbooksCustomerId;
    }
  }

  const existingCustomer = await fetchQuickBooksCustomerByDisplayName(connection, payer.payerName);
  if (existingCustomer?.quickbooksCustomerId) {
    const updated = await quickBooksApiRequest<{ Customer?: unknown }>(connection, {
      path: "/customer",
      method: "POST",
      searchParams: new URLSearchParams({ operation: "update" }),
      body: {
        Id: existingCustomer.quickbooksCustomerId,
        SyncToken: existingCustomer.syncToken,
        sparse: true,
        ...buildQuickBooksCustomerPayload({
          customerName: payer.payerName,
          billingEmail: payer.billingEmail,
          phone: payer.phone,
          siteName: payer.payerName,
          billingAddressLine1: payer.billingAddressLine1,
          billingAddressLine2: payer.billingAddressLine2,
          billingCity: payer.billingCity,
          billingState: payer.billingState,
          billingPostalCode: payer.billingPostalCode,
          billingCountry: payer.billingCountry,
          notes: payer.notes
        })
      }
    });

    const updatedCustomer = (await normalizeQuickBooksCustomer(connection, updated.Customer)) ?? existingCustomer;
    await prisma.billingPayerAccount.update({
      where: { id: payer.payerAccountId },
      data: { quickbooksCustomerId: updatedCustomer.quickbooksCustomerId }
    });
    return updatedCustomer.quickbooksCustomerId;
  }

  const created = await quickBooksApiRequest<{ Customer?: { Id: string } }>(connection, {
    path: "/customer",
    method: "POST",
    body: buildQuickBooksCustomerPayload({
      customerName: payer.payerName,
      billingEmail: payer.billingEmail,
      phone: payer.phone,
      siteName: payer.payerName,
      billingAddressLine1: payer.billingAddressLine1,
      billingAddressLine2: payer.billingAddressLine2,
      billingCity: payer.billingCity,
      billingState: payer.billingState,
      billingPostalCode: payer.billingPostalCode,
      billingCountry: payer.billingCountry,
      notes: payer.notes
    })
  });

  const createdCustomerId = created.Customer?.Id;
  if (!createdCustomerId) {
    throw new Error("QuickBooks did not return a payer customer id.");
  }

  await prisma.billingPayerAccount.update({
    where: { id: payer.payerAccountId },
    data: { quickbooksCustomerId: createdCustomerId }
  });

  return createdCustomerId;
}

async function resolveQuickBooksInvoiceCustomer(connection: QuickBooksTenantConnection, summary: {
  customerCompanyId?: string | null;
  customerName: string;
  billingEmail: string | null;
  phone: string | null;
  siteName: string;
  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingPostalCode?: string | null;
  billingCountry?: string | null;
  notes?: string | null;
}) {
  const customerCompanyId = summary.customerCompanyId?.trim();
  if (customerCompanyId) {
    return resolveQuickBooksCustomer(connection, {
      customerCompanyId,
      customerName: summary.customerName,
      billingEmail: summary.billingEmail,
      phone: summary.phone,
      siteName: summary.siteName,
      billingAddressLine1: summary.billingAddressLine1,
      billingAddressLine2: summary.billingAddressLine2,
      billingCity: summary.billingCity,
      billingState: summary.billingState,
      billingPostalCode: summary.billingPostalCode,
      billingCountry: summary.billingCountry,
      notes: summary.notes
    });
  }

  const existingCustomer = await fetchQuickBooksCustomerByDisplayName(connection, summary.customerName);
  if (existingCustomer?.quickbooksCustomerId) {
    const updated = await quickBooksApiRequest<{ Customer?: unknown }>(connection, {
      path: "/customer",
      method: "POST",
      searchParams: new URLSearchParams({ operation: "update" }),
      body: {
        Id: existingCustomer.quickbooksCustomerId,
        SyncToken: existingCustomer.syncToken,
        sparse: true,
        ...buildQuickBooksCustomerPayload({
          customerName: summary.customerName,
          billingEmail: summary.billingEmail,
          phone: summary.phone,
          siteName: summary.siteName,
          billingAddressLine1: summary.billingAddressLine1,
          billingAddressLine2: summary.billingAddressLine2,
          billingCity: summary.billingCity,
          billingState: summary.billingState,
          billingPostalCode: summary.billingPostalCode,
          billingCountry: summary.billingCountry,
          notes: summary.notes
        })
      }
    });

    const updatedCustomer = (await normalizeQuickBooksCustomer(connection, updated.Customer)) ?? existingCustomer;
    return updatedCustomer.quickbooksCustomerId;
  }

  const created = await quickBooksApiRequest<{ Customer?: { Id: string } }>(connection, {
    path: "/customer",
    method: "POST",
    body: buildQuickBooksCustomerPayload({
      customerName: summary.customerName,
      billingEmail: summary.billingEmail,
      phone: summary.phone,
      siteName: summary.siteName,
      billingAddressLine1: summary.billingAddressLine1,
      billingAddressLine2: summary.billingAddressLine2,
      billingCity: summary.billingCity,
      billingState: summary.billingState,
      billingPostalCode: summary.billingPostalCode,
      billingCountry: summary.billingCountry,
      notes: summary.notes
    })
  });

  const createdCustomerId = created.Customer?.Id;
  if (!createdCustomerId) {
    throw new Error("QuickBooks did not return a customer id.");
  }

  return createdCustomerId;
}

function mapDirectInvoiceProposalTypeToComplianceDivision(
  proposalType: DirectInvoiceProposalType | null | undefined
): ComplianceReportingDivision | null {
  switch (proposalType) {
    case "fire_alarm":
      return ComplianceReportingDivision.fire_alarm;
    case "fire_sprinkler":
      return ComplianceReportingDivision.fire_sprinkler;
    case "kitchen_suppression":
      return ComplianceReportingDivision.kitchen_suppression;
    default:
      return null;
  }
}

async function resolveMappedCatalogTaxable(input: {
  tenantId: string;
  quickbooksItemId: string;
}) {
  const mappedCatalogItem = await prisma.quickBooksCatalogItem.findFirst({
    where: {
      tenantId: input.tenantId,
      quickbooksItemId: input.quickbooksItemId
    },
    select: {
      taxable: true
    }
  });

  return mappedCatalogItem?.taxable ?? false;
}

async function buildDirectInvoiceAutomaticFeeLines(input: {
  tenantId: string;
  integrationId: string;
  customerCompanyId: string;
  proposalType: DirectInvoiceProposalType | null | undefined;
  location: {
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
  };
}) {
  const lines: Array<ReturnType<typeof toQuickBooksInvoiceLine>> = [];

  const serviceFee = await resolveServiceFeeForLocationTx(prisma, {
    tenantId: input.tenantId,
    customerCompanyId: input.customerCompanyId,
    location: input.location
  });

  if ((serviceFee.unitPrice ?? 0) > 0) {
    const resolvedServiceItem = await resolveQuickBooksItemForBilling({
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      billingCode: serviceFee.code,
      displayName: "Service Fee"
    });

    if (resolvedServiceItem.status !== "mapped") {
      throw new Error(buildQuickBooksBillingCodeMappingError({
        billingCode: serviceFee.code,
        description: "Service Fee",
        resolvedReason: resolvedServiceItem.reason,
        suggestions: resolvedServiceItem.suggestions
      }));
    }

    lines.push(toQuickBooksInvoiceLine({
      amount: Number(serviceFee.unitPrice!.toFixed(2)),
      description: "Service Fee",
      quantity: 1,
      unitPrice: serviceFee.unitPrice!,
      qbItemId: resolvedServiceItem.qbItemId,
      qbItemName: resolvedServiceItem.qbItemName,
      taxable: await resolveMappedCatalogTaxable({
        tenantId: input.tenantId,
        quickbooksItemId: resolvedServiceItem.qbItemId
      })
    }));
  }

  const complianceDivision = mapDirectInvoiceProposalTypeToComplianceDivision(input.proposalType);
  if (!complianceDivision) {
    return lines;
  }

  const complianceFee = await resolveComplianceReportingFeeTx(prisma, {
    tenantId: input.tenantId,
    division: complianceDivision,
    location: {
      city: input.location.city,
      state: input.location.state
    }
  });

  if (!complianceFee.matched || complianceFee.feeAmount <= 0) {
    return lines;
  }

  const complianceCode = `COMPLIANCE_REPORTING_FEE_${complianceDivision.toUpperCase()}`;
  const resolvedComplianceItem = await resolveQuickBooksItemForBilling({
    tenantId: input.tenantId,
    integrationId: input.integrationId,
    billingCode: complianceCode,
    displayName: "Compliance Reporting Fee"
  });

  if (resolvedComplianceItem.status !== "mapped") {
    throw new Error(buildQuickBooksBillingCodeMappingError({
      billingCode: complianceCode,
      description: "Compliance Reporting Fee",
      resolvedReason: resolvedComplianceItem.reason,
      suggestions: resolvedComplianceItem.suggestions
    }));
  }

  lines.push(toQuickBooksInvoiceLine({
    amount: Number(complianceFee.feeAmount.toFixed(2)),
    description: "Compliance Reporting Fee",
    quantity: 1,
    unitPrice: complianceFee.feeAmount,
    qbItemId: resolvedComplianceItem.qbItemId,
    qbItemName: resolvedComplianceItem.qbItemName,
    taxable: await resolveMappedCatalogTaxable({
      tenantId: input.tenantId,
      quickbooksItemId: resolvedComplianceItem.qbItemId
    })
  }));

  return lines;
}

export async function importQuickBooksCustomers(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can import QuickBooks customers.");
  }

  const tenant = await getTenantQuickBooksConnection(parsedActor.tenantId as string);
  assertQuickBooksConnectionUsable(tenant, "importing customers");

  const importedCustomers: QuickBooksCustomerRecord[] = [];
  let startPosition = 1;
  const pageSize = 500;

  try {
    while (true) {
      const response = await quickBooksApiRequest<{ QueryResponse?: { Customer?: unknown[] } }>(tenant, {
        path: "/query",
        searchParams: new URLSearchParams({
          query: `select * from Customer startposition ${startPosition} maxresults ${pageSize}`
        })
      });

      const pageCustomers = (
        await Promise.all((response.QueryResponse?.Customer ?? []).map((customer) => normalizeQuickBooksCustomer(tenant, customer)))
      ).filter((customer): customer is QuickBooksCustomerRecord => Boolean(customer));

      importedCustomers.push(...pageCustomers);

      if (pageCustomers.length < pageSize) {
        break;
      }

      startPosition += pageSize;
    }

    let customersCreated = 0;
    let customersUpdated = 0;

    for (const customer of importedCustomers) {
      const { customer: existingCustomer, matchStrategy } = await findExistingTradeWorxCustomerForQuickBooksImport(
        parsedActor.tenantId as string,
        customer
      );

      if (existingCustomer) {
      await prisma.customerCompany.update({
        where: { id: existingCustomer.id },
        data: {
          name: customer.displayName,
          quickbooksCustomerId: customer.quickbooksCustomerId,
          contactName: customer.contactName ?? existingCustomer.contactName,
          billingEmail: customer.billingEmail ?? existingCustomer.billingEmail,
          phone: customer.phone ?? existingCustomer.phone,
          serviceAddressLine1: customer.serviceAddressLine1,
          serviceAddressLine2: customer.serviceAddressLine2,
          serviceCity: customer.serviceCity,
          serviceState: customer.serviceState,
          servicePostalCode: customer.servicePostalCode,
          serviceCountry: customer.serviceCountry,
          billingAddressSameAsService: customer.billingAddressSameAsService,
          billingAddressLine1: customer.billingAddressLine1,
          billingAddressLine2: customer.billingAddressLine2,
          billingCity: customer.billingCity,
          billingState: customer.billingState,
          billingPostalCode: customer.billingPostalCode,
          billingCountry: customer.billingCountry,
          paymentTermsCode: customer.paymentTermsCode,
          customPaymentTermsLabel: customer.customPaymentTermsLabel,
          customPaymentTermsDays: customer.customPaymentTermsDays
        }
      });
        customersUpdated += 1;
        await prisma.auditLog.create({
          data: {
            tenantId: parsedActor.tenantId as string,
            actorUserId: parsedActor.userId,
            action: "customer.quickbooks_imported",
            entityType: "CustomerCompany",
            entityId: existingCustomer.id,
            metadata: {
              importAction: "updated",
              matchStrategy,
              quickbooksCustomerId: customer.quickbooksCustomerId,
              billingEmail: customer.billingEmail,
              displayName: customer.displayName,
              paymentTermsCode: customer.paymentTermsCode,
              quickbooksPaymentTermName: customer.quickbooksPaymentTermName,
              billingAddressLine1: customer.billingAddressLine1,
              serviceAddressLine1: customer.serviceAddressLine1
            }
          }
        });
      } else {
        const createdCustomer = await prisma.customerCompany.create({
          data: {
            tenantId: parsedActor.tenantId as string,
            name: customer.displayName,
            contactName: customer.contactName,
            billingEmail: customer.billingEmail,
            phone: customer.phone,
            serviceAddressLine1: customer.serviceAddressLine1,
            serviceAddressLine2: customer.serviceAddressLine2,
            serviceCity: customer.serviceCity,
            serviceState: customer.serviceState,
            servicePostalCode: customer.servicePostalCode,
            serviceCountry: customer.serviceCountry,
            billingAddressSameAsService: customer.billingAddressSameAsService,
            billingAddressLine1: customer.billingAddressLine1,
            billingAddressLine2: customer.billingAddressLine2,
            billingCity: customer.billingCity,
            billingState: customer.billingState,
            billingPostalCode: customer.billingPostalCode,
            billingCountry: customer.billingCountry,
            paymentTermsCode: customer.paymentTermsCode,
            customPaymentTermsLabel: customer.customPaymentTermsLabel,
            customPaymentTermsDays: customer.customPaymentTermsDays,
            isActive: true,
            quickbooksCustomerId: customer.quickbooksCustomerId
          }
        });
        customersCreated += 1;
        await prisma.auditLog.create({
          data: {
            tenantId: parsedActor.tenantId as string,
            actorUserId: parsedActor.userId,
            action: "customer.quickbooks_imported",
            entityType: "CustomerCompany",
            entityId: createdCustomer.id,
            metadata: {
              importAction: "created",
              matchStrategy,
              quickbooksCustomerId: customer.quickbooksCustomerId,
              billingEmail: customer.billingEmail,
              displayName: customer.displayName,
              paymentTermsCode: customer.paymentTermsCode,
              quickbooksPaymentTermName: customer.quickbooksPaymentTermName,
              billingAddressLine1: customer.billingAddressLine1,
              serviceAddressLine1: customer.serviceAddressLine1
            }
          }
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        tenantId: parsedActor.tenantId as string,
        actorUserId: parsedActor.userId,
        action: "tenant.quickbooks_customers_imported",
        entityType: "Tenant",
        entityId: parsedActor.tenantId as string,
        metadata: {
          importedCustomerCount: importedCustomers.length,
          customersCreated,
          customersUpdated
        }
      }
    });

    return {
      importedCustomerCount: importedCustomers.length,
      customersCreated,
      customersUpdated
    };
  } catch (error) {
    const normalizedError = normalizeQuickBooksError({
      error,
      fallbackOperation: "customer.import",
      connectionMode: tenant.quickbooksConnectionMode
    });
    await createQuickBooksFailureAuditLog({
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "quickbooks.customer_import_failed",
      operation: normalizedError.operation,
      message: normalizedError.message,
      httpStatus: normalizedError.httpStatus,
      intuitTid: normalizedError.intuitTid,
      rawBody: normalizedError.rawBody,
      connectionMode: tenant.quickbooksConnectionMode
    });
    throw normalizedError;
  }
}

export async function syncTradeWorxCustomerCompanyToQuickBooks(actor: ActorContext, customerCompanyId: string) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can sync QuickBooks customers.");
  }

  const tenant = await getTenantQuickBooksConnection(parsedActor.tenantId as string);
  assertQuickBooksConnectionUsable(tenant, "syncing customers");

  const customer = await prisma.customerCompany.findFirst({
    where: {
      id: customerCompanyId,
      tenantId: parsedActor.tenantId as string
    },
    select: {
      id: true,
      name: true,
      contactName: true,
      billingEmail: true,
      phone: true,
      billingAddressLine1: true,
      billingAddressLine2: true,
      billingCity: true,
      billingState: true,
      billingPostalCode: true,
      billingCountry: true,
      serviceAddressLine1: true,
      serviceAddressLine2: true,
      serviceCity: true,
      serviceState: true,
      servicePostalCode: true,
      serviceCountry: true,
      notes: true,
      quickbooksCustomerId: true
    }
  });

  if (!customer) {
    throw new Error("Customer not found.");
  }

  const primarySite = await prisma.site.findFirst({
    where: {
      tenantId: parsedActor.tenantId as string,
      customerCompanyId: customer.id
    },
    orderBy: { createdAt: "asc" },
    select: {
      name: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true
    }
  });

  try {
    const customerPayload = buildQuickBooksCustomerPayload({
      customerName: customer.name,
      billingEmail: customer.billingEmail,
      phone: customer.phone,
      siteName: primarySite?.name ?? null,
      billingAddressLine1: customer.billingAddressLine1 ?? customer.serviceAddressLine1 ?? primarySite?.addressLine1 ?? null,
      billingAddressLine2: customer.billingAddressLine2 ?? customer.serviceAddressLine2 ?? primarySite?.addressLine2 ?? null,
      billingCity: customer.billingCity ?? customer.serviceCity ?? primarySite?.city ?? null,
      billingState: customer.billingState ?? customer.serviceState ?? primarySite?.state ?? null,
      billingPostalCode: customer.billingPostalCode ?? customer.servicePostalCode ?? primarySite?.postalCode ?? null,
      billingCountry: customer.billingCountry ?? customer.serviceCountry ?? null,
      serviceAddressLine1: customer.serviceAddressLine1 ?? primarySite?.addressLine1 ?? null,
      serviceAddressLine2: customer.serviceAddressLine2 ?? primarySite?.addressLine2 ?? null,
      serviceCity: customer.serviceCity ?? primarySite?.city ?? null,
      serviceState: customer.serviceState ?? primarySite?.state ?? null,
      servicePostalCode: customer.servicePostalCode ?? primarySite?.postalCode ?? null,
      serviceCountry: customer.serviceCountry ?? null,
      notes: customer.notes ?? null
    });
    const existingCustomer = customer.quickbooksCustomerId
      ? await fetchQuickBooksCustomerById(tenant, customer.quickbooksCustomerId).catch(() => null)
      : await fetchQuickBooksCustomerByDisplayName(tenant, customer.name);

    let quickbooksCustomerId: string | null = existingCustomer?.quickbooksCustomerId ?? null;
    let syncStrategy: QuickBooksCustomerOutboundSyncStrategy = customer.quickbooksCustomerId ? "quickbooks_id" : "display_name";

    if (existingCustomer?.quickbooksCustomerId) {
      const updated = await quickBooksApiRequest<{ Customer?: unknown }>(tenant, {
        path: "/customer",
        method: "POST",
        searchParams: new URLSearchParams({ operation: "update" }),
        body: {
          Id: existingCustomer.quickbooksCustomerId,
          SyncToken: existingCustomer.syncToken,
          sparse: true,
          ...customerPayload
        }
      });

      quickbooksCustomerId = (await normalizeQuickBooksCustomer(tenant, updated.Customer))?.quickbooksCustomerId ?? existingCustomer.quickbooksCustomerId;
    } else {
      syncStrategy = "created";
      try {
        const created = await quickBooksApiRequest<{ Customer?: unknown }>(tenant, {
          path: "/customer",
          method: "POST",
          body: customerPayload
        });

        quickbooksCustomerId = (await normalizeQuickBooksCustomer(tenant, created.Customer))?.quickbooksCustomerId ?? null;
      } catch (error) {
        const normalizedError = normalizeQuickBooksError({
          error,
          fallbackOperation: "customer.sync",
          connectionMode: tenant.quickbooksConnectionMode
        });

        if (!isQuickBooksDuplicateCustomerNameError(normalizedError)) {
          throw normalizedError;
        }

        const duplicateCustomer = await fetchQuickBooksCustomerByDisplayName(tenant, customer.name);
        if (!duplicateCustomer?.quickbooksCustomerId) {
          throw new Error(`QuickBooks already has a customer named ${customer.name}. Link or rename that QuickBooks customer and try again.`);
        }

        syncStrategy = "display_name";
        const updated = await quickBooksApiRequest<{ Customer?: unknown }>(tenant, {
          path: "/customer",
          method: "POST",
          searchParams: new URLSearchParams({ operation: "update" }),
          body: {
            Id: duplicateCustomer.quickbooksCustomerId,
            SyncToken: duplicateCustomer.syncToken,
            sparse: true,
            ...customerPayload
          }
        });

        quickbooksCustomerId = (await normalizeQuickBooksCustomer(tenant, updated.Customer))?.quickbooksCustomerId ?? duplicateCustomer.quickbooksCustomerId;
      }
    }

    if (!quickbooksCustomerId) {
      throw new Error("QuickBooks did not return a customer id.");
    }

    await prisma.customerCompany.update({
      where: { id: customer.id },
      data: { quickbooksCustomerId }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: parsedActor.tenantId as string,
        actorUserId: parsedActor.userId,
        action: "customer.quickbooks_synced",
        entityType: "CustomerCompany",
        entityId: customer.id,
        metadata: {
          customerCompanyId: customer.id,
          quickbooksCustomerId,
          syncStrategy,
          billingEmail: customer.billingEmail,
          customerName: customer.name
        }
      }
    });

    return {
      customerCompanyId: customer.id,
      quickbooksCustomerId
    };
  } catch (error) {
    const normalizedError = normalizeQuickBooksError({
      error,
      fallbackOperation: "customer.sync",
      connectionMode: tenant.quickbooksConnectionMode
    });
    await createQuickBooksFailureAuditLog({
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "quickbooks.customer_sync_failed",
      operation: normalizedError.operation,
      message: normalizedError.message,
      httpStatus: normalizedError.httpStatus,
      intuitTid: normalizedError.intuitTid,
      rawBody: normalizedError.rawBody,
      connectionMode: tenant.quickbooksConnectionMode,
      entityType: "CustomerCompany",
      entityId: customer.id
    });
    throw normalizedError;
  }
}

export async function syncQuickBooksCustomers(actor: ActorContext): Promise<QuickBooksCustomerSyncResult> {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can sync QuickBooks customers.");
  }

  const importResult = await importQuickBooksCustomers(actor);
  const tenantCustomers = await prisma.customerCompany.findMany({
    where: {
      tenantId: parsedActor.tenantId as string
    },
    select: {
      id: true
    }
  });

  let customersSynced = 0;

  for (const customer of tenantCustomers) {
    await syncTradeWorxCustomerCompanyToQuickBooks(actor, customer.id);
    customersSynced += 1;
  }

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "tenant.quickbooks_customers_reconciled",
      entityType: "Tenant",
      entityId: parsedActor.tenantId as string,
      metadata: {
        importedCustomerCount: importResult.importedCustomerCount,
        customersCreated: importResult.customersCreated,
        customersUpdated: importResult.customersUpdated,
        customersSynced
      }
    }
  });

  return {
    ...importResult,
    customersSynced
  };
}

async function resolveImportedQuickBooksItem(tenantId: string, item: {
  code?: string;
  description: string;
  linkedCatalogItemId?: string | null;
  linkedQuickBooksItemId?: string | null;
  linkedCatalogItemName?: string | null;
}) {
  if (item.linkedCatalogItemId || item.linkedQuickBooksItemId) {
    const linkedItem = await prisma.quickBooksCatalogItem.findFirst({
      where: {
        tenantId,
        OR: [
          ...(item.linkedCatalogItemId ? [{ id: item.linkedCatalogItemId }] : []),
          ...(item.linkedQuickBooksItemId ? [{ quickbooksItemId: item.linkedQuickBooksItemId }] : [])
        ]
      },
      select: {
        quickbooksItemId: true,
        name: true
      }
    });

    if (linkedItem) {
      return { itemId: linkedItem.quickbooksItemId, itemName: linkedItem.name };
    }
  }

  const sanitizedCode = sanitizeCatalogMatchValue(item.code);
  const sanitizedName = sanitizeItemName(item.code || item.description);
  const rawCode = item.code?.trim() || null;
  const rawDescription = item.description.trim();

  const importedItems = await prisma.quickBooksCatalogItem.findMany({
    where: {
      tenantId,
      active: true,
      OR: [
        ...(sanitizedCode ? [{ sku: sanitizedCode }] : []),
        ...(rawCode ? [{ sku: rawCode }, { name: rawCode }] : []),
        { name: sanitizedName },
        { name: rawDescription },
        { name: sanitizeItemName(item.description) }
      ]
    },
    orderBy: [
      { sku: "asc" },
      { importedAt: "desc" }
    ],
    select: {
      quickbooksItemId: true,
      name: true
    },
    take: 1
  });

  const importedItem = importedItems[0];
  return importedItem
    ? { itemId: importedItem.quickbooksItemId, itemName: importedItem.name }
    : null;
}

async function resolveIncomeAccountId(connection: QuickBooksTenantConnection) {
  const accountQuery = await quickBooksApiRequest<{ QueryResponse?: { Account?: Array<{ Id: string }> } }>(connection, {
    path: "/query",
    searchParams: new URLSearchParams({
      query: "select * from Account where AccountType = 'Income' and Active = true maxresults 1"
    })
  });

  const accountId = accountQuery.QueryResponse?.Account?.[0]?.Id;
  if (!accountId) {
    throw new Error("QuickBooks income account not found. Create an active income account first.");
  }

  return accountId;
}

async function resolveQuickBooksItem(connection: QuickBooksTenantConnection, incomeAccountId: string, item: {
  code?: string;
  description: string;
  linkedCatalogItemId?: string | null;
  linkedQuickBooksItemId?: string | null;
  linkedCatalogItemName?: string | null;
}) {
  const importedItem = await resolveImportedQuickBooksItem(connection.id, item);
  if (importedItem) {
    return importedItem;
  }

  const itemName = sanitizeItemName(item.linkedCatalogItemName || item.code || item.description);
  const itemQuery = await quickBooksApiRequest<{ QueryResponse?: { Item?: Array<{ Id: string }> } }>(connection, {
    path: "/query",
    searchParams: new URLSearchParams({
      query: `select * from Item where Name = '${qboQueryEscape(itemName)}' maxresults 1`
    })
  });

  const existingItemId = itemQuery.QueryResponse?.Item?.[0]?.Id;
  if (existingItemId) {
    return { itemId: existingItemId, itemName };
  }

  const created = await quickBooksApiRequest<{ Item?: { Id: string } }>(connection, {
    path: "/item",
    method: "POST",
    body: {
      Name: itemName,
      Type: "Service",
      IncomeAccountRef: { value: incomeAccountId },
      Description: item.description
    }
  });

  const createdItemId = created.Item?.Id;
  if (!createdItemId) {
    throw new Error(`QuickBooks did not return an item id for ${itemName}.`);
  }

  return { itemId: createdItemId, itemName };
}

function requirePrice(item: QuickBooksBillingSummary["items"][number]) {
  if (typeof item.unitPrice !== "number") {
    throw new Error(`Billing item "${item.description}" is missing a unit price. Set pricing before syncing to QuickBooks.`);
  }

  return item.unitPrice;
}

function toQuickBooksInvoiceLine(input: {
  amount: number;
  description: string;
  quantity?: number;
  unitPrice: number;
  qbItemId: string;
  qbItemName?: string;
  taxable?: boolean;
}) {
  return {
    Amount: input.amount,
    Description: input.description,
    DetailType: "SalesItemLineDetail",
    SalesItemLineDetail: {
      Qty: input.quantity ?? 1,
      UnitPrice: input.unitPrice,
      ItemRef: {
        value: input.qbItemId,
        ...(input.qbItemName ? { name: input.qbItemName } : {})
      },
      TaxCodeRef: {
        value: input.taxable ? "TAX" : "NON"
      }
    }
  };
}

export async function getTenantQuickBooksSettings(actor: ActorContext, filters?: QuickBooksCatalogFilterInput) {
  const [connection, catalog] = await Promise.all([
    getTenantQuickBooksConnectionSettings(actor),
    getPaginatedTenantQuickBooksCatalogSettings(actor, filters)
  ]);

  return {
    config: connection.config,
    tenant: connection.tenant,
    supportReference: connection.supportReference,
    catalog
  };
}

export async function getTenantQuickBooksConnectionSettings(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can access QuickBooks settings.");
  }

  const config = getQuickBooksConfiguration();
  const tenant = await getTenantQuickBooksConnection(parsedActor.tenantId as string);
  const validatedConnection = await validateQuickBooksConnectionStatus(tenant);
  const connectionStatus = validatedConnection.status;
  const supportReference = await getLatestQuickBooksSupportReference(parsedActor.tenantId as string);
  return {
    config,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      quickbooksRealmId: tenant.quickbooksRealmId,
      quickbooksCompanyName: validatedConnection.companyName,
      quickbooksConnectionMode: tenant.quickbooksConnectionMode,
      quickbooksConnectedAt: tenant.quickbooksConnectedAt,
      connected: connectionStatus.connected,
      hasStoredConnection: connectionStatus.hasStoredConnection,
      appConnectionMode: connectionStatus.appMode,
      appConnectionModeLabel: connectionStatus.appModeLabel,
      storedConnectionMode: connectionStatus.storedMode,
      storedConnectionModeLabel: connectionStatus.storedModeLabel,
      modeMismatch: connectionStatus.modeMismatch,
      reconnectRequired: connectionStatus.reconnectRequired,
      statusLabel: connectionStatus.statusLabel,
      guidance: connectionStatus.guidance
    },
    supportReference
  };
}

export async function getPaginatedTenantQuickBooksCatalogSettings(actor: ActorContext, filters?: QuickBooksCatalogFilterInput) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can access QuickBooks catalog settings.");
  }

  const tenant = await getTenantQuickBooksConnection(parsedActor.tenantId as string);
  const validatedConnection = await validateQuickBooksConnectionStatus(tenant);
  const connectionStatus = validatedConnection.status;
  const search = filters?.search?.trim() ?? "";
  const itemType = filters?.itemType?.trim() ?? "";
  const status = filters?.status ?? "all";
  const limit = Math.min(Math.max(filters?.limit ?? 25, 1), 100);
  const page = Math.max(filters?.page ?? 1, 1);

  const catalogWhere: Prisma.QuickBooksCatalogItemWhereInput = {
    tenantId: parsedActor.tenantId as string,
    ...(status === "active" ? { active: true } : status === "inactive" ? { active: false } : {}),
    ...(itemType ? { itemType } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { quickbooksItemId: { contains: search, mode: "insensitive" } }
          ]
        }
      : {})
  };

  const catalogVisible = connectionStatus.connected;
  const [importedItems, filteredItemCount, totalItemCount, activeCount, inactiveCount, itemTypeRows, latestImportedItem] = catalogVisible
    ? await Promise.all([
        prisma.quickBooksCatalogItem.findMany({
          where: catalogWhere,
          orderBy: [
            { active: "desc" },
            { name: "asc" },
            { importedAt: "desc" }
          ],
          skip: (page - 1) * limit,
          take: limit,
          select: {
          id: true,
          quickbooksItemId: true,
          name: true,
          sku: true,
          itemType: true,
          active: true,
          taxable: true,
          unitPrice: true,
          importedAt: true
        }
      }),
        prisma.quickBooksCatalogItem.count({
          where: catalogWhere
        }),
        prisma.quickBooksCatalogItem.count({
          where: { tenantId: parsedActor.tenantId as string }
        }),
        prisma.quickBooksCatalogItem.count({
          where: { tenantId: parsedActor.tenantId as string, active: true }
        }),
        prisma.quickBooksCatalogItem.count({
          where: { tenantId: parsedActor.tenantId as string, active: false }
        }),
        prisma.quickBooksCatalogItem.groupBy({
          by: ["itemType"],
          where: { tenantId: parsedActor.tenantId as string },
          _count: { _all: true },
          orderBy: { itemType: "asc" }
        }),
        prisma.quickBooksCatalogItem.findFirst({
          where: { tenantId: parsedActor.tenantId as string },
          orderBy: { importedAt: "desc" },
          select: { importedAt: true }
        })
      ])
    : [
        [] as QuickBooksCatalogListItem[],
        0,
        0,
        0,
        0,
        [] as Array<{ itemType: string; _count: { _all: number } }>,
        null as { importedAt: Date } | null
      ];

  const totalPages = Math.max(Math.ceil(filteredItemCount / limit), 1);
  const safePage = Math.min(page, totalPages);
  const pagedItems = safePage === page
    ? importedItems
    : await prisma.quickBooksCatalogItem.findMany({
        where: catalogWhere,
        orderBy: [
          { active: "desc" },
          { name: "asc" },
          { importedAt: "desc" }
        ],
        skip: (safePage - 1) * limit,
        take: limit,
        select: {
          id: true,
          quickbooksItemId: true,
          name: true,
          sku: true,
          itemType: true,
          active: true,
          taxable: true,
          unitPrice: true,
          importedAt: true
        }
      });

  return {
    itemCount: totalItemCount,
    filteredItemCount,
    items: pagedItems satisfies QuickBooksCatalogListItem[],
    lastImportedAt: latestImportedItem?.importedAt ?? null,
    activeCount,
    inactiveCount,
    itemTypes: itemTypeRows.map((row) => ({
      itemType: row.itemType,
      count: row._count._all
    })),
    filters: {
      search,
      itemType,
      status,
      page: safePage,
      limit,
      totalPages
    },
    visible: catalogVisible
  };
}

export async function getQuickBooksItemMappingSettings(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can access QuickBooks item mappings.");
  }

  const tenant = await getTenantQuickBooksConnection(parsedActor.tenantId as string);
  const validatedConnection = await validateQuickBooksConnectionStatus(tenant);
  const integrationId = tenant.quickbooksRealmId;

  const [summaries, quoteLines] = await Promise.all([
    prisma.inspectionBillingSummary.findMany({
      where: { tenantId: parsedActor.tenantId as string },
      select: { items: true }
    }),
    prisma.quoteLineItem.findMany({
      where: { tenantId: parsedActor.tenantId as string },
      select: {
        internalCode: true,
        title: true
      }
    })
  ]);

  const latestByCode = new Map<string, { internalCode: string; internalName: string }>();
  for (const summary of summaries) {
    const items = Array.isArray(summary.items) ? summary.items as QuickBooksBillingSummary["items"] : [];
    for (const item of items) {
      const code = item.code?.trim();
      if (!code || latestByCode.has(code)) {
        continue;
      }

      latestByCode.set(code, {
        internalCode: code,
        internalName: item.description.trim()
      });
    }
  }

  for (const line of quoteLines) {
    const code = line.internalCode.trim();
    if (!code || latestByCode.has(code)) {
      continue;
    }

    latestByCode.set(code, {
      internalCode: code,
      internalName: line.title.trim()
    });
  }

  const [mappings, cacheRows] = integrationId
    ? await Promise.all([
        prisma.quickBooksItemMap.findMany({
          where: {
            tenantId: parsedActor.tenantId as string,
            integrationId
          }
        }),
        prisma.quickBooksItemCache.findMany({
          where: {
            tenantId: parsedActor.tenantId as string,
            integrationId
          },
          select: {
            qbItemId: true,
            qbItemName: true,
            normalizedName: true,
            qbItemType: true,
            qbActive: true,
            qbSyncToken: true
          }
        })
      ])
    : [[], []];

  const mappingByCode = new Map(mappings.map((mapping) => [mapping.internalCode, mapping] as const));
  const cacheByItemId = new Map(cacheRows.map((row) => [row.qbItemId, row] as const));

  const rows = await Promise.all(
    [...latestByCode.values()]
      .sort((left, right) => left.internalName.localeCompare(right.internalName))
      .map(async (entry) => {
        const mapping = mappingByCode.get(entry.internalCode) ?? null;
        const cached = mapping ? cacheByItemId.get(mapping.qbItemId) ?? null : null;
        const status: QuickBooksItemMappingStatus = !mapping
          ? "unmapped"
          : cached && !cached.qbActive
            ? "inactive_in_quickbooks"
            : "mapped";

        const suggestions = integrationId
          ? await findQuickBooksItemSuggestions({
              tenantId: parsedActor.tenantId as string,
              integrationId,
              term: entry.internalName,
              limit: 5
            })
          : [];

        return {
          internalCode: entry.internalCode,
          internalName: entry.internalName,
          currentMapping: mapping
            ? {
                qbItemId: mapping.qbItemId,
                qbItemName: mapping.qbItemName,
                qbItemType: mapping.qbItemType,
                matchSource: mapping.matchSource,
                qbActive: cached?.qbActive ?? mapping.qbActive
              }
            : null,
          status,
          suggestions
        } satisfies QuickBooksItemMappingRow;
      })
  );

  return {
    configured: getQuickBooksConfiguration().enabled,
    connected: validatedConnection.status.connected,
    reconnectRequired: validatedConnection.status.reconnectRequired,
    modeMismatch: validatedConnection.status.modeMismatch,
    integrationId,
    availableItems: cacheRows
      .filter((row) => row.qbActive)
      .sort((left, right) => left.qbItemName.localeCompare(right.qbItemName))
      .map((row) => ({
        qbItemId: row.qbItemId,
        qbItemName: row.qbItemName,
        qbItemType: row.qbItemType,
        qbActive: row.qbActive
      } satisfies QuickBooksItemMappingManualOption)),
    rows
  };
}

export async function saveQuickBooksItemMappingForCode(actor: ActorContext, input: {
  internalCode: string;
  internalName: string;
  qbItemId: string;
}) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can manage QuickBooks item mappings.");
  }

  const tenant = await getTenantQuickBooksConnection(parsedActor.tenantId as string);
  assertQuickBooksConnectionUsable(tenant, "saving QuickBooks item mappings");
  const integrationId = getQuickBooksIntegrationId(tenant);

  const mapping = await saveQuickBooksItemMapping({
    tenantId: parsedActor.tenantId as string,
    integrationId,
    internalCode: input.internalCode.trim(),
    internalName: input.internalName.trim(),
    qbItemId: input.qbItemId.trim(),
    matchSource: "manual"
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "quickbooks.item_mapping_saved",
      entityType: "QuickBooksItemMap",
      entityId: mapping.id,
      metadata: {
        internalCode: mapping.internalCode,
        qbItemId: mapping.qbItemId,
        qbItemName: mapping.qbItemName
      }
    }
  });

  return mapping;
}

export async function clearQuickBooksItemMappingForCode(actor: ActorContext, internalCode: string) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can manage QuickBooks item mappings.");
  }

  const tenant = await getTenantQuickBooksConnection(parsedActor.tenantId as string);
  assertQuickBooksConnectionUsable(tenant, "clearing QuickBooks item mappings");
  const integrationId = getQuickBooksIntegrationId(tenant);

  await clearQuickBooksItemMapping({
    tenantId: parsedActor.tenantId as string,
    integrationId,
    internalCode: internalCode.trim()
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "quickbooks.item_mapping_cleared",
      entityType: "Tenant",
      entityId: parsedActor.tenantId as string,
      metadata: {
        internalCode: internalCode.trim()
      }
    }
  });
}

export function buildQuickBooksConnectUrl(state: string) {
  const env = assertEnvForFeature("quickbooks") as {
    QUICKBOOKS_CLIENT_ID: string;
    QUICKBOOKS_CLIENT_SECRET: string;
    QUICKBOOKS_SANDBOX: boolean;
  };
  const callbackUrl = `${getServerEnv().APP_URL}/api/quickbooks/callback`;
  const params = new URLSearchParams({
    client_id: env.QUICKBOOKS_CLIENT_ID,
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: callbackUrl,
    state
  });

  return `${getQuickBooksAuthBaseUrl()}?${params.toString()}`;
}

export async function getTenantQuickBooksConnectionStatus(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can access QuickBooks settings.");
  }

  const tenant = await getTenantQuickBooksConnection(parsedActor.tenantId as string);
  const validatedConnection = await validateQuickBooksConnectionStatus(tenant);
  const status = validatedConnection.status;

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      quickbooksRealmId: tenant.quickbooksRealmId,
      quickbooksCompanyName: validatedConnection.companyName,
      quickbooksConnectionMode: tenant.quickbooksConnectionMode,
      quickbooksConnectedAt: tenant.quickbooksConnectedAt
    },
    connection: status
  };
}

export async function getQuickBooksCustomerInvoiceHistory(actor: ActorContext, customerCompanyId: string) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can view QuickBooks customer invoice history.");
  }

  const [tenant, customer] = await Promise.all([
    getTenantQuickBooksConnection(parsedActor.tenantId as string),
    prisma.customerCompany.findFirst({
      where: {
        id: customerCompanyId,
        tenantId: parsedActor.tenantId as string
      },
      select: {
        id: true,
        name: true,
        quickbooksCustomerId: true
      }
    })
  ]);

  if (!customer) {
    throw new Error("Customer not found.");
  }

  const validatedStatus = await validateQuickBooksConnectionStatus(tenant);
  if (!validatedStatus.status.connected) {
    return {
      connection: validatedStatus.status,
      customerLinked: Boolean(customer.quickbooksCustomerId),
      customerQuickBooksId: customer.quickbooksCustomerId,
      invoices: [],
      lastSyncedAt: null,
      syncError: validatedStatus.status.guidance ?? validatedStatus.status.validationError
    };
  }

  if (!customer.quickbooksCustomerId) {
    return {
      connection: validatedStatus.status,
      customerLinked: false,
      customerQuickBooksId: null,
      invoices: [],
      lastSyncedAt: null,
      syncError: "This client is not linked to a QuickBooks customer yet."
    };
  }

  try {
    const queryResponse = await quickBooksApiRequest<{ QueryResponse?: { Invoice?: unknown[] } }>(tenant, {
      path: "/query",
      searchParams: new URLSearchParams({
        query: `select * from Invoice where CustomerRef = '${qboQueryEscape(customer.quickbooksCustomerId)}' orderby TxnDate desc startposition 1 maxresults 50`
      })
    });
    const invoices = (queryResponse.QueryResponse?.Invoice ?? [])
      .map((invoice) => normalizeQuickBooksInvoiceHistoryEntry(invoice, validatedStatus.status.appMode))
      .filter((invoice): invoice is QuickBooksCustomerInvoiceHistoryEntry => Boolean(invoice))
      .sort((left, right) => (right.invoiceDate?.getTime() ?? 0) - (left.invoiceDate?.getTime() ?? 0));

    return {
      connection: validatedStatus.status,
      customerLinked: true,
      customerQuickBooksId: customer.quickbooksCustomerId,
      invoices,
      lastSyncedAt: new Date(),
      syncError: null
    };
  } catch (error) {
    const normalizedError = normalizeQuickBooksError({
      error,
      fallbackOperation: "customer.invoice_history",
      connectionMode: tenant.quickbooksConnectionMode
    });
    await createQuickBooksFailureAuditLog({
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "quickbooks.customer_invoice_history_failed",
      operation: normalizedError.operation,
      message: normalizedError.message,
      httpStatus: normalizedError.httpStatus,
      intuitTid: normalizedError.intuitTid,
      rawBody: normalizedError.rawBody,
      connectionMode: tenant.quickbooksConnectionMode,
      entityType: "CustomerCompany",
      entityId: customerCompanyId
    });

    return {
      connection: validatedStatus.status,
      customerLinked: true,
      customerQuickBooksId: customer.quickbooksCustomerId,
      invoices: [],
      lastSyncedAt: null,
      syncError: normalizedError.message
    };
  }
}

export async function getQuickBooksDirectInvoiceFormOptions(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can create direct invoices.");
  }

  const [connection, customers, catalogItems] = await Promise.all([
    getTenantQuickBooksConnectionStatus(actor),
    prisma.customerCompany.findMany({
      where: {
        tenantId: parsedActor.tenantId as string,
        isActive: true
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        contactName: true,
        billingEmail: true,
        phone: true
      }
    }),
    prisma.quickBooksCatalogItem.findMany({
      where: {
        tenantId: parsedActor.tenantId as string,
        active: true
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        quickbooksItemId: true,
        name: true,
        sku: true,
        itemType: true,
        taxable: true,
        unitPrice: true
      }
    })
  ]);

  return {
    connection,
    customers,
    catalogItems
  };
}

export async function completeQuickBooksConnection(actor: ActorContext, input: { code: string; realmId: string }) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksConnection(parsedActor.role)) {
    throw new Error("Only tenant administrators can connect QuickBooks.");
  }

  let token: QuickBooksTokenExchangeResult;
  try {
    token = await exchangeQuickBooksToken({
      grant_type: "authorization_code",
      code: input.code
    });
  } catch (error) {
    const normalizedError = normalizeQuickBooksError({
      error,
      fallbackOperation: "token.exchange",
      connectionMode: resolveQuickBooksAppMode()
    });
    await createQuickBooksFailureAuditLog({
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "quickbooks.auth_failed",
      operation: normalizedError.operation,
      message: normalizedError.message,
      httpStatus: normalizedError.httpStatus,
      intuitTid: normalizedError.intuitTid,
      rawBody: normalizedError.rawBody,
      connectionMode: resolveQuickBooksAppMode(),
      metadata: {
        realmId: input.realmId
      }
    });
    throw normalizedError;
  }

  const updated = await prisma.tenant.update({
    where: { id: parsedActor.tenantId as string },
    data: {
      quickbooksRealmId: input.realmId,
      quickbooksCompanyName: null,
      quickbooksAccessToken: token.token.access_token,
      quickbooksRefreshToken: token.token.refresh_token,
      quickbooksConnectionMode: resolveQuickBooksAppMode(),
      quickbooksTokenExpiresAt: new Date(Date.now() + token.token.expires_in * 1000),
      quickbooksConnectedAt: new Date()
    },
    select: {
      id: true,
      name: true,
      quickbooksRealmId: true,
      quickbooksCompanyName: true,
      quickbooksConnectionMode: true,
      quickbooksAccessToken: true,
      quickbooksRefreshToken: true,
      quickbooksTokenExpiresAt: true,
      quickbooksConnectedAt: true
    }
  });

  const companyName = await fetchQuickBooksCompanyName(updated);
  if (companyName) {
    await prisma.tenant.update({
      where: { id: updated.id },
      data: { quickbooksCompanyName: companyName }
    });
  }

  await prisma.quickBooksCatalogItem.deleteMany({
    where: { tenantId: parsedActor.tenantId as string }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "tenant.quickbooks_connected",
      entityType: "Tenant",
      entityId: parsedActor.tenantId as string,
      metadata: { realmId: input.realmId, companyName: companyName ?? null, connectionMode: resolveQuickBooksAppMode(), intuitTid: token.intuitTid }
    }
  });
}

export async function disconnectQuickBooks(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksConnection(parsedActor.role)) {
    throw new Error("Only tenant administrators can disconnect QuickBooks.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: parsedActor.tenantId as string },
      data: {
        quickbooksRealmId: null,
        quickbooksCompanyName: null,
        quickbooksConnectionMode: null,
        quickbooksAccessToken: null,
        quickbooksRefreshToken: null,
        quickbooksTokenExpiresAt: null,
        quickbooksConnectedAt: null
      }
    });

    await tx.customerCompany.updateMany({
      where: { tenantId: parsedActor.tenantId as string },
      data: { quickbooksCustomerId: null }
    });

    await tx.quickBooksCatalogItem.deleteMany({
      where: { tenantId: parsedActor.tenantId as string }
    });

    await tx.quickBooksItemCache.deleteMany({
      where: { tenantId: parsedActor.tenantId as string }
    });

    await tx.quickBooksItemMap.deleteMany({
      where: { tenantId: parsedActor.tenantId as string }
    });

    await tx.inspectionBillingSummary.updateMany({
      where: { tenantId: parsedActor.tenantId as string },
      data: {
        quickbooksSyncStatus: "not_synced",
        quickbooksInvoiceId: null,
        quickbooksInvoiceNumber: null,
        quickbooksConnectionMode: null,
        quickbooksCustomerId: null,
        quickbooksSyncedAt: null,
        quickbooksSyncError: null
      }
    });
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "tenant.quickbooks_disconnected",
      entityType: "Tenant",
      entityId: parsedActor.tenantId as string
    }
  });
}

export async function importQuickBooksCatalogItems(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can import QuickBooks products and services.");
  }

  const tenant = await getTenantQuickBooksConnection(parsedActor.tenantId as string);
  assertQuickBooksConnectionUsable(tenant, "importing products and services");
  const integrationId = getQuickBooksIntegrationId(tenant);

  const importedItems: Array<{
    quickbooksItemId: string;
    name: string;
    sku: string | null;
    itemType: string;
    active: boolean;
    taxable: boolean;
    unitPrice: number | null;
    incomeAccountId: string | null;
    incomeAccountName: string | null;
    rawJson: JsonObject;
  }> = [];

  let startPosition = 1;
  const pageSize = 500;

  try {
    while (true) {
      const response = await quickBooksApiRequest<{ QueryResponse?: { Item?: unknown[] } }>(tenant, {
        path: "/query",
        searchParams: new URLSearchParams({
          query: `select * from Item startposition ${startPosition} maxresults ${pageSize}`
        })
      });

      const pageItems = (response.QueryResponse?.Item ?? [])
        .map((item) => normalizeQuickBooksCatalogItem(item))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      importedItems.push(...pageItems);

      if (pageItems.length < pageSize) {
        break;
      }

      startPosition += pageSize;
    }

    await prisma.$transaction(async (tx) => {
      await tx.quickBooksCatalogItem.deleteMany({
        where: { tenantId: parsedActor.tenantId as string }
      });

      await tx.quickBooksItemCache.deleteMany({
        where: {
          tenantId: parsedActor.tenantId as string,
          integrationId
        }
      });

      if (importedItems.length > 0) {
        await tx.quickBooksCatalogItem.createMany({
          data: importedItems.map((item) => ({
            tenantId: parsedActor.tenantId as string,
            quickbooksItemId: item.quickbooksItemId,
            name: item.name,
            sku: item.sku,
            itemType: item.itemType,
            active: item.active,
            taxable: item.taxable,
            unitPrice: item.unitPrice,
            incomeAccountId: item.incomeAccountId,
            incomeAccountName: item.incomeAccountName,
            rawJson: item.rawJson,
            importedAt: new Date()
          }))
        });

        await tx.quickBooksItemCache.createMany({
          data: importedItems.map((item) => ({
            tenantId: parsedActor.tenantId as string,
            integrationId,
            qbItemId: item.quickbooksItemId,
            qbItemName: item.name,
            normalizedName: normalizeQbName(item.name),
            qbItemType: item.itemType,
            qbActive: item.active,
            qbSyncToken: typeof item.rawJson.SyncToken === "string" ? item.rawJson.SyncToken : null,
            rawJson: item.rawJson,
            lastSyncedAt: new Date()
          }))
        });
      }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: parsedActor.tenantId as string,
        actorUserId: parsedActor.userId,
        action: "tenant.quickbooks_catalog_imported",
        entityType: "Tenant",
        entityId: parsedActor.tenantId as string,
        metadata: {
          importedItemCount: importedItems.length
        }
      }
    });

    return {
      importedItemCount: importedItems.length
    };
  } catch (error) {
    const normalizedError = normalizeQuickBooksError({
      error,
      fallbackOperation: "catalog.import",
      connectionMode: tenant.quickbooksConnectionMode
    });
    await createQuickBooksFailureAuditLog({
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "quickbooks.catalog_import_failed",
      operation: normalizedError.operation,
      message: normalizedError.message,
      httpStatus: normalizedError.httpStatus,
      intuitTid: normalizedError.intuitTid,
      rawBody: normalizedError.rawBody,
      connectionMode: tenant.quickbooksConnectionMode
    });
    throw normalizedError;
  }
}

function assertTradeWorxEditableQuickBooksItemType(itemType: string) {
  if (itemType !== "Service" && itemType !== "NonInventory") {
    throw new Error("TradeWorx can only create or edit QuickBooks Service and NonInventory items from Settings right now.");
  }
}

export async function createQuickBooksCatalogItem(actor: ActorContext, input: z.infer<typeof quickBooksCatalogItemInputSchema>) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can create QuickBooks products and services.");
  }

  const parsedInput = quickBooksCatalogItemInputSchema.parse(input);
  assertTradeWorxEditableQuickBooksItemType(parsedInput.itemType);

  const tenant = await getTenantQuickBooksConnection(parsedActor.tenantId as string);
  assertQuickBooksConnectionUsable(tenant, "creating products and services");
  const integrationId = getQuickBooksIntegrationId(tenant);

  try {
    const incomeAccountId = await resolveIncomeAccountId(tenant);
    const created = await quickBooksApiRequest<{ Item?: unknown }>(tenant, {
      path: "/item",
      method: "POST",
      body: {
        Name: sanitizeItemName(parsedInput.name),
        Type: parsedInput.itemType,
        Active: parsedInput.active,
        IncomeAccountRef: { value: incomeAccountId },
        SalesTaxCodeRef: { value: parsedInput.taxable ? "TAX" : "NON" },
        ...(parsedInput.sku ? { Sku: parsedInput.sku } : {}),
        ...(parsedInput.unitPrice !== null ? { UnitPrice: parsedInput.unitPrice } : {})
      }
    });

    const localItem = await upsertTenantQuickBooksCatalogItem({
      tenantId: parsedActor.tenantId as string,
      integrationId,
      item: created.Item
    });

    await prisma.auditLog.create({
      data: {
        tenantId: parsedActor.tenantId as string,
        actorUserId: parsedActor.userId,
        action: "quickbooks.catalog_item_created",
        entityType: "QuickBooksCatalogItem",
        entityId: localItem.id,
        metadata: {
          quickbooksItemId: localItem.quickbooksItemId,
          itemType: localItem.itemType,
          name: localItem.name,
          sku: localItem.sku,
          unitPrice: localItem.unitPrice,
          taxable: localItem.taxable,
          active: localItem.active
        }
      }
    });

    return localItem;
  } catch (error) {
    const normalizedError = normalizeQuickBooksError({
      error,
      fallbackOperation: "catalog.create",
      connectionMode: tenant.quickbooksConnectionMode
    });
    await createQuickBooksFailureAuditLog({
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "quickbooks.catalog_create_failed",
      operation: normalizedError.operation,
      message: normalizedError.message,
      httpStatus: normalizedError.httpStatus,
      intuitTid: normalizedError.intuitTid,
      rawBody: normalizedError.rawBody,
      connectionMode: tenant.quickbooksConnectionMode,
      entityType: "Tenant",
      entityId: parsedActor.tenantId as string
    });
    throw normalizedError;
  }
}

export async function updateQuickBooksCatalogItem(actor: ActorContext, input: z.infer<typeof quickBooksCatalogItemInputSchema>) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can update QuickBooks products and services.");
  }

  const parsedInput = quickBooksCatalogItemInputSchema.parse(input);
  if (!parsedInput.catalogItemId) {
    throw new Error("A catalog item id is required to update a product or service.");
  }

  const localItem = await prisma.quickBooksCatalogItem.findFirst({
    where: {
      id: parsedInput.catalogItemId,
      tenantId: parsedActor.tenantId as string
    },
    select: {
      id: true,
      quickbooksItemId: true,
      itemType: true
    }
  });

  if (!localItem) {
    throw new Error("QuickBooks product or service not found.");
  }

  assertTradeWorxEditableQuickBooksItemType(localItem.itemType);

  const tenant = await getTenantQuickBooksConnection(parsedActor.tenantId as string);
  assertQuickBooksConnectionUsable(tenant, "updating products and services");
  const integrationId = getQuickBooksIntegrationId(tenant);

  try {
    const currentItem = await fetchQuickBooksCatalogItemById(tenant, localItem.quickbooksItemId);
    const normalizedCurrentItem = normalizeQuickBooksCatalogItem(currentItem);
    const syncToken = readQuickBooksStringField(currentItem, "SyncToken");

    if (!normalizedCurrentItem || !syncToken) {
      throw new Error("QuickBooks did not return enough item data to update this product or service.");
    }

    assertTradeWorxEditableQuickBooksItemType(normalizedCurrentItem.itemType);
    const incomeAccountId = normalizedCurrentItem.incomeAccountId ?? await resolveIncomeAccountId(tenant);
    const updated = await quickBooksApiRequest<{ Item?: unknown }>(tenant, {
      path: "/item",
      method: "POST",
      searchParams: new URLSearchParams({ operation: "update" }),
      body: {
        Id: normalizedCurrentItem.quickbooksItemId,
        SyncToken: syncToken,
        sparse: true,
        Name: sanitizeItemName(parsedInput.name),
        Type: normalizedCurrentItem.itemType,
        Active: parsedInput.active,
        IncomeAccountRef: { value: incomeAccountId },
        SalesTaxCodeRef: { value: parsedInput.taxable ? "TAX" : "NON" },
        Sku: parsedInput.sku ?? "",
        ...(parsedInput.unitPrice !== null ? { UnitPrice: parsedInput.unitPrice } : {})
      }
    });

    const updatedLocalItem = await upsertTenantQuickBooksCatalogItem({
      tenantId: parsedActor.tenantId as string,
      integrationId,
      item: updated.Item
    });

    await prisma.auditLog.create({
      data: {
        tenantId: parsedActor.tenantId as string,
        actorUserId: parsedActor.userId,
        action: "quickbooks.catalog_item_updated",
        entityType: "QuickBooksCatalogItem",
        entityId: updatedLocalItem.id,
        metadata: {
          quickbooksItemId: updatedLocalItem.quickbooksItemId,
          itemType: updatedLocalItem.itemType,
          name: updatedLocalItem.name,
          sku: updatedLocalItem.sku,
          unitPrice: updatedLocalItem.unitPrice,
          taxable: updatedLocalItem.taxable,
          active: updatedLocalItem.active
        }
      }
    });

    return updatedLocalItem;
  } catch (error) {
    const normalizedError = normalizeQuickBooksError({
      error,
      fallbackOperation: "catalog.update",
      connectionMode: tenant.quickbooksConnectionMode
    });
    await createQuickBooksFailureAuditLog({
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "quickbooks.catalog_update_failed",
      operation: normalizedError.operation,
      message: normalizedError.message,
      httpStatus: normalizedError.httpStatus,
      intuitTid: normalizedError.intuitTid,
      rawBody: normalizedError.rawBody,
      connectionMode: tenant.quickbooksConnectionMode,
      entityType: "QuickBooksCatalogItem",
      entityId: parsedInput.catalogItemId
    });
    throw normalizedError;
  }
}

export async function syncBillingSummaryToQuickBooks(actor: ActorContext, inspectionId: string) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can sync invoices to QuickBooks.");
  }

  const tenant = await getTenantQuickBooksConnection(parsedActor.tenantId as string);
  const connectionStatus = assertQuickBooksConnectionUsable(tenant, "syncing invoices");
  const integrationId = getQuickBooksIntegrationId(tenant);

  const summary = await prisma.inspectionBillingSummary.findUnique({
    where: { inspectionId },
    include: {
      customerCompany: true,
      site: true
    }
  });

  if (!summary || summary.tenantId !== parsedActor.tenantId) {
    throw new Error("Billing summary not found.");
  }

  const deliverySnapshot = (summary.deliverySnapshot ?? {}) as Record<string, unknown>;
  const blockingIssueCode = typeof deliverySnapshot.blockingIssueCode === "string"
    ? deliverySnapshot.blockingIssueCode
    : null;
  if (blockingIssueCode === "provider_contract_expired") {
    throw new Error("This billing summary is tied to an expired provider contract. Update the contract or override billing before syncing.");
  }

  if (summary.quickbooksInvoiceId && isVerifiedQuickBooksSyncStatus(summary.quickbooksSyncStatus)) {
    throw new Error("This billing summary has already been synced to QuickBooks.");
  }

  const normalizedSummary = {
    id: summary.id,
    tenantId: summary.tenantId,
    inspectionId: summary.inspectionId,
    customerCompanyId: summary.customerCompanyId,
    status: summary.status,
    subtotal: summary.subtotal,
    notes: summary.notes,
    items: Array.isArray(summary.items) ? summary.items as QuickBooksBillingSummary["items"] : [],
    quickbooksSyncStatus: summary.quickbooksSyncStatus,
    quickbooksSendStatus: summary.quickbooksSendStatus ?? (summary.quickbooksSyncStatus === "sent" ? "sent" : "not_sent"),
    quickbooksInvoiceId: summary.quickbooksInvoiceId,
    quickbooksInvoiceNumber: summary.quickbooksInvoiceNumber
  } satisfies QuickBooksBillingSummary;

  if (normalizedSummary.items.length === 0) {
    throw new Error("There are no billing items to sync.");
  }

  try {
    const payerAccount = summary.billingType === "third_party" && summary.billToAccountId
      ? summary.payerType === "provider"
        ? await prisma.contractProviderAccount.findFirst({
            where: {
              id: summary.billToAccountId,
              organizationId: parsedActor.tenantId as string
            },
            select: {
              id: true,
              name: true,
              billingEmail: true,
              billingPhone: true,
              remittanceAddressLine1: true,
              remittanceAddressLine2: true,
              remittanceCity: true,
              remittanceState: true,
              remittancePostalCode: true,
              notes: true
            }
          })
        : await prisma.billingPayerAccount.findFirst({
            where: {
              id: summary.billToAccountId,
              tenantId: parsedActor.tenantId as string
            }
          })
      : null;

    const customerId = payerAccount
      ? await resolveQuickBooksPayerAccount(tenant, {
          payerAccountId: payerAccount.id,
          payerName: payerAccount.name,
          billingEmail: payerAccount.billingEmail ?? null,
          phone: "billingPhone" in payerAccount ? payerAccount.billingPhone ?? null : payerAccount.phone,
          billingAddressLine1: "remittanceAddressLine1" in payerAccount ? payerAccount.remittanceAddressLine1 ?? null : payerAccount.billingAddressLine1,
          billingAddressLine2: "remittanceAddressLine2" in payerAccount ? payerAccount.remittanceAddressLine2 ?? null : payerAccount.billingAddressLine2,
          billingCity: "remittanceCity" in payerAccount ? payerAccount.remittanceCity ?? null : payerAccount.billingCity,
          billingState: "remittanceState" in payerAccount ? payerAccount.remittanceState ?? null : payerAccount.billingState,
          billingPostalCode: "remittancePostalCode" in payerAccount ? payerAccount.remittancePostalCode ?? null : payerAccount.billingPostalCode,
          billingCountry: "billingCountry" in payerAccount ? payerAccount.billingCountry : null,
          notes: "externalReference" in payerAccount ? payerAccount.externalReference : payerAccount.notes
        })
      : await resolveQuickBooksCustomer(tenant, {
          customerCompanyId: summary.customerCompanyId,
          customerName: summary.customerCompany.name,
          billingEmail: summary.customerCompany.billingEmail,
          phone: summary.customerCompany.phone,
          siteName: summary.site.name,
          billingAddressLine1: summary.customerCompany.billingAddressLine1 ?? summary.customerCompany.serviceAddressLine1 ?? summary.site.addressLine1,
          billingAddressLine2: summary.customerCompany.billingAddressLine2 ?? summary.customerCompany.serviceAddressLine2 ?? summary.site.addressLine2,
          billingCity: summary.customerCompany.billingCity ?? summary.customerCompany.serviceCity ?? summary.site.city,
          billingState: summary.customerCompany.billingState ?? summary.customerCompany.serviceState ?? summary.site.state,
          billingPostalCode: summary.customerCompany.billingPostalCode ?? summary.customerCompany.servicePostalCode ?? summary.site.postalCode,
          billingCountry: summary.customerCompany.billingCountry ?? summary.customerCompany.serviceCountry ?? null,
          notes: summary.customerCompany.notes ?? null
        });

    const sendToEmail = typeof deliverySnapshot.recipientEmail === "string" && deliverySnapshot.recipientEmail.trim().length > 0
      ? deliverySnapshot.recipientEmail.trim()
      : payerAccount?.billingEmail ?? summary.customerCompany.billingEmail;

    const itemRefCache = new Map<string, { qbItemId: string; qbItemName: string }>();
    const invoiceLines = [] as Array<Record<string, unknown>>;

    for (const item of normalizedSummary.items) {
      const unitPrice = requirePrice(item);
      const billingCode = item.code?.trim();
      if (!billingCode) {
        throw new Error(`Billing item "${item.description}" is missing a stable billing code. Add a billing code before syncing to QuickBooks.`);
      }

      const cacheKey = billingCode;
      let resolvedItem = itemRefCache.get(cacheKey);
      if (!resolvedItem) {
        const resolved = await resolveQuickBooksItemForBilling({
          tenantId: parsedActor.tenantId as string,
          integrationId,
          billingCode,
          displayName: item.description
        });

        if (resolved.status !== "mapped") {
          throw new Error(buildQuickBooksBillingCodeMappingError({
            billingCode,
            description: item.description,
            resolvedReason: resolved.reason,
            suggestions: resolved.suggestions
          }));
        }

        resolvedItem = {
          qbItemId: resolved.qbItemId,
          qbItemName: resolved.qbItemName
        };
        itemRefCache.set(cacheKey, resolvedItem);
      }

      invoiceLines.push(toQuickBooksInvoiceLine({
        amount: Number(((item.quantity ?? 0) * unitPrice).toFixed(2)),
        description: item.description,
        quantity: item.quantity,
        unitPrice,
        qbItemId: resolvedItem.qbItemId,
        qbItemName: resolvedItem.qbItemName
      }));
    }

    const docNumber = `TW-${summary.inspectionId.slice(-8).toUpperCase()}`;
    const invoiceResponse = await quickBooksApiRequest<{ Invoice?: unknown }>(tenant, {
      path: "/invoice",
      method: "POST",
      body: {
        DocNumber: docNumber,
        CustomerRef: { value: customerId },
        ...(sendToEmail ? { BillEmail: { Address: sendToEmail } } : {}),
        PrivateNote: summary.notes ?? `Synced from TradeWorx inspection ${summary.inspectionId}`,
        Line: invoiceLines
      }
    });

    const createdInvoice = normalizeQuickBooksInvoiceRecord(invoiceResponse.Invoice);
    const responseDocNumber = readQuickBooksDocNumber(invoiceResponse.Invoice);
    if (!createdInvoice && !responseDocNumber) {
      throw new Error("QuickBooks returned an incomplete invoice response.");
    }

    const createdDocNumber = createdInvoice?.docNumber
      ?? responseDocNumber
      ?? docNumber;
    const verifiedInvoice = await fetchQuickBooksInvoice(tenant, {
      invoiceId: createdInvoice?.id ?? null,
      docNumber: createdDocNumber
    });

    if (!verifiedInvoice) {
      throw new Error(`QuickBooks did not verify invoice ${createdDocNumber ?? docNumber} after creation.`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.inspectionBillingSummary.update({
        where: { id: summary.id },
        data: {
          status: "invoiced",
          quickbooksSyncStatus: "synced",
          quickbooksSendStatus: "not_sent",
          quickbooksInvoiceId: verifiedInvoice.id,
          quickbooksInvoiceNumber: verifiedInvoice.docNumber ?? createdDocNumber ?? docNumber,
          quickbooksConnectionMode: connectionStatus.appMode,
          quickbooksCustomerId: customerId,
          quickbooksSyncedAt: new Date(),
          quickbooksSyncError: null,
          quickbooksSentAt: null,
          quickbooksSendError: null
        }
      });
      await tx.inspection.update({
        where: { id: summary.inspectionId },
        data: { status: InspectionStatus.invoiced }
      });
      await syncInspectionArchiveStateTx(tx, {
        tenantId: parsedActor.tenantId as string,
        inspectionId: summary.inspectionId
      });
    });

    await prisma.auditLog.create({
      data: {
        tenantId: parsedActor.tenantId as string,
        actorUserId: parsedActor.userId,
        action: "billing.quickbooks_synced",
        entityType: "InspectionBillingSummary",
        entityId: summary.id,
        metadata: {
          inspectionId: summary.inspectionId,
          invoiceId: verifiedInvoice.id,
          invoiceNumber: verifiedInvoice.docNumber ?? createdDocNumber ?? docNumber,
          customerId
        }
      }
    });

    const syncResult = {
      summaryId: summary.id,
      inspectionId: summary.inspectionId,
      invoiceId: verifiedInvoice.id,
      invoiceNumber: verifiedInvoice.docNumber ?? createdDocNumber ?? docNumber
    };

    const sendResult = await sendQuickBooksInvoiceForSummary({
      parsedActor,
      tenant,
      summary: {
        id: summary.id,
        inspectionId: summary.inspectionId,
        quickbooksInvoiceId: verifiedInvoice.id,
        billingEmail: sendToEmail ?? null
      },
      suppressThrowOnSendFailure: true
    });

    return {
      ...syncResult,
      quickbooksSendStatus: sendResult.sendStatus,
      quickbooksSendError: sendResult.error,
      quickbooksSentTo: sendResult.sentTo
    };
  } catch (error) {
    const normalizedError = normalizeQuickBooksError({
      error,
      fallbackOperation: "billing.sync",
      connectionMode: tenant.quickbooksConnectionMode
    });
    await prisma.inspectionBillingSummary.update({
      where: { id: summary.id },
      data: {
        quickbooksInvoiceId: null,
        quickbooksInvoiceNumber: null,
        quickbooksConnectionMode: null,
        quickbooksCustomerId: null,
        quickbooksSyncedAt: null,
        quickbooksSyncStatus: "failed",
        quickbooksSyncError: normalizedError.message,
        quickbooksSendStatus: "not_sent",
        quickbooksSentAt: null,
        quickbooksSendError: null
      }
    });

    await createQuickBooksFailureAuditLog({
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "quickbooks.sync_failed",
      operation: normalizedError.operation,
      message: normalizedError.message,
      httpStatus: normalizedError.httpStatus,
      intuitTid: normalizedError.intuitTid,
      rawBody: normalizedError.rawBody,
      connectionMode: tenant.quickbooksConnectionMode,
      entityType: "InspectionBillingSummary",
      entityId: summary.id,
      metadata: {
        inspectionId: summary.inspectionId
      }
    });

    throw normalizedError;
  }
}

export async function syncQuoteToQuickBooksEstimate(actor: ActorContext, quoteId: string) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can sync quotes to QuickBooks.");
  }

  const tenant = await getTenantQuickBooksConnection(parsedActor.tenantId as string);
  const connectionStatus = assertQuickBooksConnectionUsable(tenant, "syncing quotes");
  const integrationId = getQuickBooksIntegrationId(tenant);

  const quote = await prisma.quote.findFirst({
    where: {
      id: quoteId,
      tenantId: parsedActor.tenantId as string
    },
    include: {
      customerCompany: true,
      site: true,
      lineItems: { orderBy: { sortOrder: "asc" } }
    }
  });

  if (!quote) {
    throw new Error("Quote not found.");
  }

  if (quote.lineItems.length === 0) {
    throw new Error("There are no quote line items to sync.");
  }

  try {
    await prisma.quote.update({
      where: { id: quote.id },
      data: {
        syncStatus: "sync_pending",
        quickbooksSyncError: null
      }
    });

    const customerId = await resolveQuickBooksCustomer(tenant, {
      customerCompanyId: quote.customerCompanyId,
      customerName: quote.customerCompany.name,
      billingEmail: quote.recipientEmail ?? quote.customerCompany.billingEmail,
      phone: quote.customerCompany.phone,
      siteName: quote.site?.name ?? quote.customerCompany.name,
      billingAddressLine1: quote.customerCompany.billingAddressLine1 ?? quote.customerCompany.serviceAddressLine1 ?? quote.site?.addressLine1 ?? null,
      billingAddressLine2: quote.customerCompany.billingAddressLine2 ?? quote.customerCompany.serviceAddressLine2 ?? quote.site?.addressLine2 ?? null,
      billingCity: quote.customerCompany.billingCity ?? quote.customerCompany.serviceCity ?? quote.site?.city ?? null,
      billingState: quote.customerCompany.billingState ?? quote.customerCompany.serviceState ?? quote.site?.state ?? null,
      billingPostalCode: quote.customerCompany.billingPostalCode ?? quote.customerCompany.servicePostalCode ?? quote.site?.postalCode ?? null,
      billingCountry: quote.customerCompany.billingCountry ?? quote.customerCompany.serviceCountry ?? null,
      notes: quote.customerCompany.notes ?? null
    });

    const resolvedLines: Array<Record<string, unknown>> = [];
    const lineQbIds = new Map<string, string>();

    for (const line of quote.lineItems) {
      if (!line.internalCode?.trim()) {
        throw new Error(`Quote line "${line.title}" is missing a stable internal service code.`);
      }

      let qbItemId = line.qbItemId;
      let qbItemName: string | undefined;

      if (qbItemId) {
        const cached = await prisma.quickBooksItemCache.findUnique({
          where: {
            tenantId_integrationId_qbItemId: {
              tenantId: parsedActor.tenantId as string,
              integrationId,
              qbItemId
            }
          },
          select: {
            qbItemId: true,
            qbItemName: true,
            qbActive: true
          }
        });

        if (!cached) {
          throw new Error(`QuickBooks item ${qbItemId} for quote line "${line.title}" is missing from the local cache. Re-map the service and retry.`);
        }

        if (!cached.qbActive) {
          throw new Error(`QuickBooks item "${cached.qbItemName}" for quote line "${line.title}" is inactive. Re-map the service and retry.`);
        }

        qbItemId = cached.qbItemId;
        qbItemName = cached.qbItemName;
      } else {
        const resolved = await resolveQuickBooksItemForBilling({
          tenantId: parsedActor.tenantId as string,
          integrationId,
          billingCode: line.internalCode,
          displayName: line.title
        });

        if (resolved.status !== "mapped") {
          const suggestionText = resolved.suggestions.length > 0
            ? ` Suggested items: ${resolved.suggestions.map((suggestion) => suggestion.qbItemName).join(", ")}.`
            : "";
          const reasonText = resolved.reason === "inactive_item"
            ? " The mapped QuickBooks item is inactive."
            : resolved.reason === "missing_item"
              ? " The mapped QuickBooks item is missing from the local cache."
              : " No QuickBooks item is mapped yet.";
          throw new Error(`QuickBooks item not mapped for quote line code "${line.internalCode}".${reasonText}${suggestionText}`);
        }

        qbItemId = resolved.qbItemId;
        qbItemName = resolved.qbItemName;
      }

      lineQbIds.set(line.id, qbItemId);
      resolvedLines.push(toQuickBooksInvoiceLine({
        amount: Number(line.total.toFixed(2)),
        description: line.description ?? line.title,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        qbItemId,
        qbItemName,
        taxable: line.taxable
      }));
    }

    const docNumber = quote.quoteNumber;
    let estimateResponse: { Estimate?: unknown };

    if (quote.quickbooksEstimateId) {
      const currentEstimate = await quickBooksApiRequest<{ Estimate?: unknown }>(tenant, {
        path: `/estimate/${quote.quickbooksEstimateId}`
      });
      const syncToken = readQuickBooksStringField(currentEstimate.Estimate, "SyncToken");
      if (!syncToken) {
        throw new Error("QuickBooks did not return enough estimate data to update this quote.");
      }

      estimateResponse = await quickBooksApiRequest<{ Estimate?: unknown }>(tenant, {
        path: "/estimate",
        method: "POST",
        searchParams: new URLSearchParams({ operation: "update" }),
        body: {
          Id: quote.quickbooksEstimateId,
          SyncToken: syncToken,
          sparse: true,
          DocNumber: docNumber,
          CustomerRef: { value: customerId },
          TxnDate: quote.issuedAt.toISOString().slice(0, 10),
          ...(quote.expiresAt ? { ExpirationDate: quote.expiresAt.toISOString().slice(0, 10) } : {}),
          ...(quote.customerNotes ? { CustomerMemo: { value: quote.customerNotes } } : {}),
          Line: resolvedLines
        }
      });
    } else {
      estimateResponse = await quickBooksApiRequest<{ Estimate?: unknown }>(tenant, {
        path: "/estimate",
        method: "POST",
        body: {
          DocNumber: docNumber,
          CustomerRef: { value: customerId },
          TxnDate: quote.issuedAt.toISOString().slice(0, 10),
          ...(quote.expiresAt ? { ExpirationDate: quote.expiresAt.toISOString().slice(0, 10) } : {}),
          ...(quote.customerNotes ? { CustomerMemo: { value: quote.customerNotes } } : {}),
          Line: resolvedLines
        }
      });
    }

    const createdEstimate = normalizeQuickBooksInvoiceRecord(estimateResponse.Estimate);
    const responseDocNumber = readQuickBooksDocNumber(estimateResponse.Estimate);
    if (!createdEstimate && !responseDocNumber) {
      throw new Error("QuickBooks returned an incomplete estimate response.");
    }

    const verifiedEstimate = await fetchQuickBooksEstimate(tenant, {
      estimateId: createdEstimate?.id ?? quote.quickbooksEstimateId ?? null,
      docNumber: responseDocNumber ?? docNumber
    });
    if (!verifiedEstimate) {
      throw new Error(`QuickBooks did not verify estimate ${responseDocNumber ?? docNumber} after sync.`);
    }

    await prisma.$transaction([
      prisma.quote.update({
        where: { id: quote.id },
        data: {
          syncStatus: "synced",
          quickbooksEstimateId: verifiedEstimate.id,
          quickbooksEstimateNumber: verifiedEstimate.docNumber ?? responseDocNumber ?? docNumber,
          quickbooksConnectionMode: connectionStatus.appMode,
          quickbooksCustomerId: customerId,
          quickbooksSyncedAt: new Date(),
          quickbooksSyncError: null
        }
      }),
      ...quote.lineItems
        .filter((line) => lineQbIds.has(line.id))
        .map((line) =>
          prisma.quoteLineItem.update({
            where: { id: line.id },
            data: {
              qbItemId: lineQbIds.get(line.id) ?? line.qbItemId
            }
          })
        )
    ]);

    await prisma.auditLog.create({
      data: {
        tenantId: parsedActor.tenantId as string,
        actorUserId: parsedActor.userId,
        action: "quote.quickbooks_synced",
        entityType: "Quote",
        entityId: quote.id,
        metadata: {
          estimateId: verifiedEstimate.id,
          estimateNumber: verifiedEstimate.docNumber ?? responseDocNumber ?? docNumber,
          customerId
        }
      }
    });

    return {
      quoteId: quote.id,
      estimateId: verifiedEstimate.id,
      estimateNumber: verifiedEstimate.docNumber ?? responseDocNumber ?? docNumber
    };
  } catch (error) {
    const normalizedError = normalizeQuickBooksError({
      error,
      fallbackOperation: "quote.sync",
      connectionMode: tenant.quickbooksConnectionMode
    });

    await prisma.quote.update({
      where: { id: quote.id },
      data: {
        syncStatus: "sync_error",
        quickbooksSyncError: normalizedError.message
      }
    });

    await createQuickBooksFailureAuditLog({
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "quote.quickbooks_sync_failed",
      operation: normalizedError.operation,
      message: normalizedError.message,
      httpStatus: normalizedError.httpStatus,
      intuitTid: normalizedError.intuitTid,
      rawBody: normalizedError.rawBody,
      connectionMode: tenant.quickbooksConnectionMode,
      entityType: "Quote",
      entityId: quote.id
    });

    throw normalizedError;
  }
}

export async function createDirectQuickBooksInvoice(
  actor: ActorContext,
  input: z.infer<typeof directQuickBooksInvoiceInputSchema>
) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can create direct invoices.");
  }

  const parsedInput = directQuickBooksInvoiceInputSchema.parse(input);
  const tenant = await getTenantQuickBooksConnection(parsedActor.tenantId as string);
  const connectionStatus = assertQuickBooksConnectionUsable(tenant, "creating invoices");
  const issueDate = new Date(parsedInput.issueDate);
  if (Number.isNaN(issueDate.getTime())) {
    throw new Error("Issue date is invalid.");
  }
  const dueDate = parsedInput.dueDate ? new Date(parsedInput.dueDate) : null;
  if (parsedInput.dueDate && (!dueDate || Number.isNaN(dueDate.getTime()))) {
    throw new Error("Due date is invalid.");
  }

  const selectedCustomer = parsedInput.customerCompanyId
    ? await prisma.customerCompany.findFirst({
        where: {
          id: parsedInput.customerCompanyId,
          tenantId: parsedActor.tenantId as string
        },
        select: {
          id: true,
          name: true,
          contactName: true,
          billingEmail: true,
          phone: true,
          billingAddressLine1: true,
          billingAddressLine2: true,
          billingCity: true,
          billingState: true,
          billingPostalCode: true,
          billingCountry: true,
          serviceAddressLine1: true,
          serviceAddressLine2: true,
          serviceCity: true,
          serviceState: true,
          servicePostalCode: true,
          serviceCountry: true,
          notes: true
        }
      })
      : null;

  if (parsedInput.customerCompanyId && !selectedCustomer) {
    throw new Error("Customer not found.");
  }

  const shouldSkipAutomaticFees = parsedInput.walkInMode || !selectedCustomer;
  const integrationId = getQuickBooksIntegrationId(tenant);

  const catalogItems = await prisma.quickBooksCatalogItem.findMany({
    where: {
      tenantId: parsedActor.tenantId as string,
      id: { in: parsedInput.lineItems.map((line) => line.catalogItemId) },
      active: true
    },
    select: {
      id: true,
      quickbooksItemId: true,
      name: true,
      taxable: true
    }
  });

  const catalogById = new Map(catalogItems.map((item) => [item.id, item] as const));
  if (!parsedInput.lineItems.every((line) => catalogById.has(line.catalogItemId))) {
    throw new Error("One or more selected products or services are missing or inactive.");
  }

  try {
    const customerName = selectedCustomer?.name ?? parsedInput.walkInCustomerName?.trim() ?? "";
    const customerId = await resolveQuickBooksInvoiceCustomer(tenant, {
      customerCompanyId: selectedCustomer?.id ?? null,
      customerName,
      billingEmail: selectedCustomer?.billingEmail ?? (parsedInput.walkInCustomerEmail?.trim() || null),
      phone: selectedCustomer?.phone ?? (parsedInput.walkInCustomerPhone?.trim() || null),
      siteName: parsedInput.siteLabel?.trim() || selectedCustomer?.name || customerName,
      billingAddressLine1: selectedCustomer?.billingAddressLine1 ?? selectedCustomer?.serviceAddressLine1 ?? null,
      billingAddressLine2: selectedCustomer?.billingAddressLine2 ?? selectedCustomer?.serviceAddressLine2 ?? null,
      billingCity: selectedCustomer?.billingCity ?? selectedCustomer?.serviceCity ?? null,
      billingState: selectedCustomer?.billingState ?? selectedCustomer?.serviceState ?? null,
      billingPostalCode: selectedCustomer?.billingPostalCode ?? selectedCustomer?.servicePostalCode ?? null,
      billingCountry: selectedCustomer?.billingCountry ?? selectedCustomer?.serviceCountry ?? null,
      notes: selectedCustomer?.notes ?? null
    });

      const invoiceLines = parsedInput.lineItems.map((line) => {
        const catalogItem = catalogById.get(line.catalogItemId);
        if (!catalogItem) {
          throw new Error("Selected product or service is no longer available.");
        }

      return toQuickBooksInvoiceLine({
        amount: Number((line.quantity * line.unitPrice).toFixed(2)),
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        qbItemId: catalogItem.quickbooksItemId,
        qbItemName: catalogItem.name,
          taxable: line.taxable
        });
      });

      if (selectedCustomer && !shouldSkipAutomaticFees) {
        const automaticFeeLines = await buildDirectInvoiceAutomaticFeeLines({
          tenantId: parsedActor.tenantId as string,
          integrationId,
          customerCompanyId: selectedCustomer.id,
          proposalType: parsedInput.proposalType ?? null,
          location: {
            city: selectedCustomer.serviceCity ?? selectedCustomer.billingCity ?? null,
            state: selectedCustomer.serviceState ?? selectedCustomer.billingState ?? null,
            postalCode: selectedCustomer.servicePostalCode ?? selectedCustomer.billingPostalCode ?? null
          }
        });
        invoiceLines.push(...automaticFeeLines);
      }

      const invoiceResponse = await quickBooksApiRequest<{ Invoice?: unknown }>(tenant, {
      path: "/invoice",
      method: "POST",
      body: {
        CustomerRef: { value: customerId },
        TxnDate: issueDate.toISOString().slice(0, 10),
        ...(dueDate ? { DueDate: dueDate.toISOString().slice(0, 10) } : {}),
        ...(parsedInput.memo?.trim() ? { CustomerMemo: { value: parsedInput.memo.trim() } } : {}),
        Line: invoiceLines
      }
    });

    const createdInvoice = normalizeQuickBooksInvoiceRecord(invoiceResponse.Invoice);
    const responseDocNumber = readQuickBooksDocNumber(invoiceResponse.Invoice);
    if (!createdInvoice && !responseDocNumber) {
      throw new Error("QuickBooks returned an incomplete invoice response.");
    }

    const verifiedInvoice = await fetchQuickBooksInvoice(tenant, {
      invoiceId: createdInvoice?.id ?? null,
      docNumber: responseDocNumber ?? null
    });
    if (!verifiedInvoice) {
      throw new Error("QuickBooks did not verify the created invoice.");
    }

    let sendResult: QuickBooksInvoiceSendResult | null = null;
    const sendToEmail = selectedCustomer?.billingEmail ?? (parsedInput.walkInCustomerEmail?.trim() || null);
    if (parsedInput.sendEmail && sendToEmail) {
      try {
        const sendParams = new URLSearchParams();
        sendParams.set("sendTo", sendToEmail);
        await quickBooksApiRequest<Record<string, unknown>>(tenant, {
          path: `/invoice/${verifiedInvoice.id}/send`,
          method: "POST",
          searchParams: sendParams
        });

        sendResult = {
          summaryId: "direct_invoice",
          inspectionId: "direct_invoice",
          invoiceId: verifiedInvoice.id,
          sendStatus: "sent",
          sentTo: sendToEmail,
          error: null
        };
      } catch (error) {
        const normalizedError = normalizeQuickBooksError({
          error,
          fallbackOperation: "billing.direct_send",
          connectionMode: tenant.quickbooksConnectionMode
        });
        sendResult = {
          summaryId: "direct_invoice",
          inspectionId: "direct_invoice",
          invoiceId: verifiedInvoice.id,
          sendStatus: "send_failed",
          sentTo: sendToEmail,
          error: normalizedError.message
        };
      }
    }

    await prisma.auditLog.create({
      data: {
        tenantId: parsedActor.tenantId as string,
        actorUserId: parsedActor.userId,
        action: "billing.quickbooks_direct_invoice_created",
        entityType: "Tenant",
        entityId: parsedActor.tenantId as string,
        metadata: {
            invoiceId: verifiedInvoice.id,
            invoiceNumber: verifiedInvoice.docNumber ?? responseDocNumber ?? null,
            customerId,
            customerName,
            source: shouldSkipAutomaticFees ? "walk_in" : "existing_customer",
            automaticFeesApplied: selectedCustomer && !shouldSkipAutomaticFees,
            proposalType: parsedInput.proposalType ?? null,
            issueDate: issueDate.toISOString().slice(0, 10),
            dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
            sendEmail: parsedInput.sendEmail,
          sendStatus: sendResult?.sendStatus ?? "not_sent",
          connectionMode: connectionStatus.appMode
        } satisfies JsonObject
      }
    });

    return {
      invoiceId: verifiedInvoice.id,
      invoiceNumber: verifiedInvoice.docNumber ?? responseDocNumber ?? null,
      invoiceUrl: buildQuickBooksInvoiceAppUrl(verifiedInvoice.id, connectionStatus.appMode),
      customerName,
      sendStatus: sendResult?.sendStatus ?? "not_sent",
      sendError: sendResult?.error ?? null,
      sentTo: sendResult?.sentTo ?? null
    };
  } catch (error) {
    const normalizedError = normalizeQuickBooksError({
      error,
      fallbackOperation: "billing.direct_create",
      connectionMode: tenant.quickbooksConnectionMode
    });
    await createQuickBooksFailureAuditLog({
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "quickbooks.direct_invoice_failed",
      operation: normalizedError.operation,
      message: normalizedError.message,
      httpStatus: normalizedError.httpStatus,
      intuitTid: normalizedError.intuitTid,
      rawBody: normalizedError.rawBody,
      connectionMode: tenant.quickbooksConnectionMode,
      entityType: "Tenant",
      entityId: parsedActor.tenantId as string
    });
    throw normalizedError;
  }
}

async function sendQuickBooksInvoiceForSummary(input: {
  parsedActor: ReturnType<typeof parseActor>;
  tenant: QuickBooksTenantConnection;
  summary: {
    id: string;
    inspectionId: string;
    quickbooksInvoiceId: string;
    billingEmail: string | null;
  };
  suppressThrowOnSendFailure?: boolean;
}) {
  const { parsedActor, tenant, summary, suppressThrowOnSendFailure } = input;

  if (!summary.billingEmail) {
    const message = "QuickBooks invoice send skipped because the bill-to account does not have a delivery email.";

    await prisma.inspectionBillingSummary.update({
      where: { id: summary.id },
      data: {
        quickbooksSendStatus: "send_skipped",
        quickbooksSentAt: null,
        quickbooksSendError: message
      }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: parsedActor.tenantId as string,
        actorUserId: parsedActor.userId,
        action: "billing.quickbooks_send_skipped",
        entityType: "InspectionBillingSummary",
        entityId: summary.id,
        metadata: {
          inspectionId: summary.inspectionId,
          invoiceId: summary.quickbooksInvoiceId,
          reason: "missing_billing_email"
        }
      }
    });

    return {
      summaryId: summary.id,
      inspectionId: summary.inspectionId,
      invoiceId: summary.quickbooksInvoiceId,
      sendStatus: "send_skipped",
      sentTo: null,
      error: message
    } satisfies QuickBooksInvoiceSendResult;
  }

  const sendParams = new URLSearchParams();
  sendParams.set("sendTo", summary.billingEmail);

  try {
    await quickBooksApiRequest<Record<string, unknown>>(tenant, {
      path: `/invoice/${summary.quickbooksInvoiceId}/send`,
      method: "POST",
      searchParams: sendParams
    });

    await prisma.inspectionBillingSummary.update({
      where: { id: summary.id },
      data: {
        quickbooksSendStatus: "sent",
        quickbooksSentAt: new Date(),
        quickbooksSendError: null
      }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: parsedActor.tenantId as string,
        actorUserId: parsedActor.userId,
        action: "billing.quickbooks_sent",
        entityType: "InspectionBillingSummary",
        entityId: summary.id,
        metadata: {
          inspectionId: summary.inspectionId,
          invoiceId: summary.quickbooksInvoiceId,
          sentTo: summary.billingEmail ?? null
        }
      }
    });

    return {
      summaryId: summary.id,
      inspectionId: summary.inspectionId,
      invoiceId: summary.quickbooksInvoiceId,
      sendStatus: "sent",
      sentTo: summary.billingEmail,
      error: null
    } satisfies QuickBooksInvoiceSendResult;
  } catch (error) {
    const normalizedError = normalizeQuickBooksError({
      error,
      fallbackOperation: "billing.send",
      connectionMode: tenant.quickbooksConnectionMode
    });
    await prisma.inspectionBillingSummary.update({
      where: { id: summary.id },
      data: {
        quickbooksSendStatus: "send_failed",
        quickbooksSentAt: null,
        quickbooksSendError: normalizedError.message
      }
    });

    await createQuickBooksFailureAuditLog({
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "quickbooks.send_failed",
      operation: normalizedError.operation,
      message: normalizedError.message,
      httpStatus: normalizedError.httpStatus,
      intuitTid: normalizedError.intuitTid,
      rawBody: normalizedError.rawBody,
      connectionMode: tenant.quickbooksConnectionMode,
      entityType: "InspectionBillingSummary",
      entityId: summary.id,
      metadata: {
        inspectionId: summary.inspectionId,
        invoiceId: summary.quickbooksInvoiceId
      }
    });

    if (!suppressThrowOnSendFailure) {
      throw normalizedError;
    }

    return {
      summaryId: summary.id,
      inspectionId: summary.inspectionId,
      invoiceId: summary.quickbooksInvoiceId,
      sendStatus: "send_failed",
      sentTo: summary.billingEmail,
      error: normalizedError.message
    } satisfies QuickBooksInvoiceSendResult;
  }
}

export async function sendQuickBooksInvoice(
  actor: ActorContext,
  inspectionId: string,
  options?: { suppressThrowOnSendFailure?: boolean }
) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can send QuickBooks invoices.");
  }

  const tenant = await getTenantQuickBooksConnection(parsedActor.tenantId as string);
  const connectionStatus = assertQuickBooksConnectionUsable(tenant, "sending invoices");

  const summary = await prisma.inspectionBillingSummary.findUnique({
    where: { inspectionId },
    select: {
      id: true,
      tenantId: true,
      inspectionId: true,
      payerType: true,
      quickbooksInvoiceId: true,
      quickbooksSyncStatus: true,
      quickbooksConnectionMode: true,
      deliverySnapshot: true,
      billToAccountId: true,
      customerCompany: {
        select: {
          billingEmail: true
        }
      }
    }
  });

  if (!summary || summary.tenantId !== parsedActor.tenantId) {
    throw new Error("Billing summary not found.");
  }

  const deliverySnapshot = (summary.deliverySnapshot ?? {}) as Record<string, unknown>;
  const blockingIssueCode = typeof deliverySnapshot.blockingIssueCode === "string"
    ? deliverySnapshot.blockingIssueCode
    : null;
  if (blockingIssueCode === "provider_contract_expired") {
    throw new Error("This billing summary is tied to an expired provider contract. Update the contract or override billing before sending.");
  }

  if (!summary.quickbooksInvoiceId || !isVerifiedQuickBooksSyncStatus(summary.quickbooksSyncStatus)) {
    throw new Error("Sync and verify this billing summary in QuickBooks before sending it.");
  }
  if (!summary.quickbooksConnectionMode || summary.quickbooksConnectionMode !== connectionStatus.appMode) {
    throw new Error(`This billing summary was synced in QuickBooks ${summary.quickbooksConnectionMode ? formatQuickBooksConnectionModeLabel(summary.quickbooksConnectionMode as QuickBooksConnectionMode) : "Unknown"}. Re-sync it in ${connectionStatus.appModeLabel} mode before sending.`);
  }

  const payerAccount = summary.billToAccountId
    ? summary.payerType === "provider"
      ? await prisma.contractProviderAccount.findFirst({
          where: {
            id: summary.billToAccountId,
            organizationId: parsedActor.tenantId as string
          },
          select: { billingEmail: true }
        })
      : await prisma.billingPayerAccount.findFirst({
          where: {
            id: summary.billToAccountId,
            tenantId: parsedActor.tenantId as string
          },
          select: { billingEmail: true }
        })
    : null;
  const billingEmail = typeof deliverySnapshot.recipientEmail === "string" && deliverySnapshot.recipientEmail.trim().length > 0
    ? deliverySnapshot.recipientEmail.trim()
    : payerAccount?.billingEmail ?? summary.customerCompany.billingEmail;

  return sendQuickBooksInvoiceForSummary({
    parsedActor,
    tenant,
    summary: {
      id: summary.id,
      inspectionId: summary.inspectionId,
      quickbooksInvoiceId: summary.quickbooksInvoiceId,
      billingEmail
    },
    suppressThrowOnSendFailure: options?.suppressThrowOnSendFailure
  });
}
