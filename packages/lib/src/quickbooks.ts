import type { Prisma } from "@prisma/client";
import { prisma } from "@testworx/db";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { assertEnvForFeature, getOptionalQuickBooksEnv, getServerEnv } from "./env";
import type { JsonObject } from "./json-types";
import { assertTenantContext } from "./permissions";

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
  quickbooksInvoiceId: string | null;
  quickbooksInvoiceNumber: string | null;
};

type QuickBooksInvoiceRecord = {
  id: string;
  docNumber: string | null;
};

type QuickBooksCatalogListItem = {
  id: string;
  quickbooksItemId: string;
  name: string;
  sku: string | null;
  itemType: string;
  active: boolean;
  unitPrice: number | null;
  importedAt: Date;
};

type QuickBooksCustomerRecord = {
  quickbooksCustomerId: string;
  displayName: string;
  companyName: string | null;
  syncToken: string | null;
  billingEmail: string | null;
  phone: string | null;
  contactName: string | null;
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

function normalizeQuickBooksCustomer(customer: unknown) {
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

  return {
    quickbooksCustomerId,
    displayName,
    companyName: readQuickBooksStringField(customer, "CompanyName"),
    syncToken: readQuickBooksStringField(customer, "SyncToken"),
    billingEmail: readQuickBooksStringField(primaryEmail, "Address"),
    phone: readQuickBooksStringField(primaryPhone, "FreeFormNumber"),
    contactName: buildQuickBooksContactName(customer)
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

  return {
    quickbooksItemId,
    name,
    sku: readQuickBooksStringField(item, "Sku"),
    itemType,
    active: readQuickBooksBooleanField(item, "Active") ?? true,
    unitPrice: readQuickBooksNumberField(item, "UnitPrice"),
    incomeAccountId: readQuickBooksStringField(incomeAccountRef, "value"),
    incomeAccountName: readQuickBooksStringField(incomeAccountRef, "name"),
    rawJson: item as JsonObject
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

  return normalizeQuickBooksCustomer(response.Customer);
}

async function fetchQuickBooksCustomerByDisplayName(connection: QuickBooksTenantConnection, displayName: string) {
  const response = await quickBooksApiRequest<{ QueryResponse?: { Customer?: unknown[] } }>(connection, {
    path: "/query",
    searchParams: new URLSearchParams({
      query: `select * from Customer where DisplayName = '${qboQueryEscape(displayName)}' maxresults 1`
    })
  });

  return normalizeQuickBooksCustomer(response.QueryResponse?.Customer?.[0]);
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
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}) {
  return {
    DisplayName: input.customerName,
    CompanyName: input.customerName,
    ...(input.billingEmail ? { PrimaryEmailAddr: { Address: input.billingEmail } } : {}),
    ...(input.phone ? { PrimaryPhone: { FreeFormNumber: input.phone } } : {}),
    ...(input.addressLine1
      ? {
          BillAddr: {
            Line1: input.addressLine1,
            ...(input.addressLine2 ? { Line2: input.addressLine2 } : {}),
            ...(input.city ? { City: input.city } : {}),
            ...(input.state ? { CountrySubDivisionCode: input.state } : {}),
            ...(input.postalCode ? { PostalCode: input.postalCode } : {})
          }
        }
      : {}),
    ...(input.siteName ? { Notes: `Created by TradeWorx for ${input.siteName}` } : {})
  };
}

async function resolveQuickBooksCustomer(connection: QuickBooksTenantConnection, summary: {
  customerCompanyId: string;
  customerName: string;
  billingEmail: string | null;
  phone: string | null;
  siteName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
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

      const updatedCustomer = normalizeQuickBooksCustomer(updated.Customer) ?? existingCustomer;
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

    const updatedCustomer = normalizeQuickBooksCustomer(updated.Customer) ?? existingCustomer;
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

      const pageCustomers = (response.QueryResponse?.Customer ?? [])
        .map((customer) => normalizeQuickBooksCustomer(customer))
        .filter((customer): customer is QuickBooksCustomerRecord => Boolean(customer));

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
            phone: customer.phone ?? existingCustomer.phone
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
              displayName: customer.displayName
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
              displayName: customer.displayName
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
          ...buildQuickBooksCustomerPayload({
            customerName: customer.name,
            billingEmail: customer.billingEmail,
            phone: customer.phone,
            siteName: primarySite?.name ?? null,
            addressLine1: primarySite?.addressLine1 ?? null,
            addressLine2: primarySite?.addressLine2 ?? null,
            city: primarySite?.city ?? null,
            state: primarySite?.state ?? null,
            postalCode: primarySite?.postalCode ?? null
          })
        }
      });

      quickbooksCustomerId = normalizeQuickBooksCustomer(updated.Customer)?.quickbooksCustomerId ?? existingCustomer.quickbooksCustomerId;
    } else {
      syncStrategy = "created";
      const created = await quickBooksApiRequest<{ Customer?: unknown }>(tenant, {
        path: "/customer",
        method: "POST",
        body: buildQuickBooksCustomerPayload({
          customerName: customer.name,
          billingEmail: customer.billingEmail,
          phone: customer.phone,
          siteName: primarySite?.name ?? null,
          addressLine1: primarySite?.addressLine1 ?? null,
          addressLine2: primarySite?.addressLine2 ?? null,
          city: primarySite?.city ?? null,
          state: primarySite?.state ?? null,
          postalCode: primarySite?.postalCode ?? null
        })
      });

      quickbooksCustomerId = normalizeQuickBooksCustomer(created.Customer)?.quickbooksCustomerId ?? null;
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
}) {
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
}) {
  const importedItem = await resolveImportedQuickBooksItem(connection.id, item);
  if (importedItem) {
    return importedItem;
  }

  const itemName = sanitizeItemName(item.code || item.description);
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

export async function getTenantQuickBooksSettings(actor: ActorContext, filters?: QuickBooksCatalogFilterInput) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can access QuickBooks settings.");
  }

  const config = getQuickBooksConfiguration();
  const tenant = await getTenantQuickBooksConnection(parsedActor.tenantId as string);
  const validatedConnection = await validateQuickBooksConnectionStatus(tenant);
  const connectionStatus = validatedConnection.status;
  const supportReference = await getLatestQuickBooksSupportReference(parsedActor.tenantId as string);
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
          unitPrice: true,
          importedAt: true
        }
      });
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
    supportReference,
    catalog: {
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
      }
    }
  };
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

  const importedItems: Array<{
    quickbooksItemId: string;
    name: string;
    sku: string | null;
    itemType: string;
    active: boolean;
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

      if (importedItems.length > 0) {
        await tx.quickBooksCatalogItem.createMany({
          data: importedItems.map((item) => ({
            tenantId: parsedActor.tenantId as string,
            quickbooksItemId: item.quickbooksItemId,
            name: item.name,
            sku: item.sku,
            itemType: item.itemType,
            active: item.active,
            unitPrice: item.unitPrice,
            incomeAccountId: item.incomeAccountId,
            incomeAccountName: item.incomeAccountName,
            rawJson: item.rawJson,
            importedAt: new Date()
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

export async function syncBillingSummaryToQuickBooks(actor: ActorContext, inspectionId: string) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can sync invoices to QuickBooks.");
  }

  const tenant = await getTenantQuickBooksConnection(parsedActor.tenantId as string);
  const connectionStatus = assertQuickBooksConnectionUsable(tenant, "syncing invoices");

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
    quickbooksInvoiceId: summary.quickbooksInvoiceId,
    quickbooksInvoiceNumber: summary.quickbooksInvoiceNumber
  } satisfies QuickBooksBillingSummary;

  if (normalizedSummary.items.length === 0) {
    throw new Error("There are no billing items to sync.");
  }

  try {
    const customerId = await resolveQuickBooksCustomer(tenant, {
      customerCompanyId: summary.customerCompanyId,
      customerName: summary.customerCompany.name,
      billingEmail: summary.customerCompany.billingEmail,
      phone: summary.customerCompany.phone,
      siteName: summary.site.name,
      addressLine1: summary.site.addressLine1,
      addressLine2: summary.site.addressLine2,
      city: summary.site.city,
      state: summary.site.state,
      postalCode: summary.site.postalCode
    });

    const incomeAccountId = await resolveIncomeAccountId(tenant);
    const itemRefCache = new Map<string, { itemId: string; itemName: string }>();
    const invoiceLines = [] as Array<Record<string, unknown>>;

    for (const item of normalizedSummary.items) {
      const unitPrice = requirePrice(item);
      const cacheKey = sanitizeItemName(item.code || item.description);
      const resolvedItem = itemRefCache.get(cacheKey) ?? await resolveQuickBooksItem(tenant, incomeAccountId, item);
      itemRefCache.set(cacheKey, resolvedItem);

      invoiceLines.push({
        Amount: Number(((item.quantity ?? 0) * unitPrice).toFixed(2)),
        Description: item.description,
        DetailType: "SalesItemLineDetail",
        SalesItemLineDetail: {
          ItemRef: { value: resolvedItem.itemId, name: resolvedItem.itemName },
          Qty: item.quantity,
          UnitPrice: unitPrice
        }
      });
    }

    const docNumber = `TW-${summary.inspectionId.slice(-8).toUpperCase()}`;
    const invoiceResponse = await quickBooksApiRequest<{ Invoice?: unknown }>(tenant, {
      path: "/invoice",
      method: "POST",
      body: {
        DocNumber: docNumber,
        CustomerRef: { value: customerId },
        ...(summary.customerCompany.billingEmail ? { BillEmail: { Address: summary.customerCompany.billingEmail } } : {}),
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

    await prisma.inspectionBillingSummary.update({
      where: { id: summary.id },
      data: {
        status: "invoiced",
        quickbooksSyncStatus: "synced",
        quickbooksInvoiceId: verifiedInvoice.id,
        quickbooksInvoiceNumber: verifiedInvoice.docNumber ?? createdDocNumber ?? docNumber,
        quickbooksConnectionMode: connectionStatus.appMode,
        quickbooksCustomerId: customerId,
        quickbooksSyncedAt: new Date(),
        quickbooksSyncError: null
      }
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

    return {
      summaryId: summary.id,
      inspectionId: summary.inspectionId,
      invoiceId: verifiedInvoice.id,
      invoiceNumber: verifiedInvoice.docNumber ?? createdDocNumber ?? docNumber
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
        quickbooksSyncError: normalizedError.message
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

export async function sendQuickBooksInvoice(actor: ActorContext, inspectionId: string) {
  const parsedActor = parseActor(actor);
  if (!canManageQuickBooksSync(parsedActor.role)) {
    throw new Error("Only administrators can send QuickBooks invoices.");
  }

  const tenant = await getTenantQuickBooksConnection(parsedActor.tenantId as string);
  const connectionStatus = assertQuickBooksConnectionUsable(tenant, "sending invoices");

  const summary = await prisma.inspectionBillingSummary.findUnique({
    where: { inspectionId },
    include: {
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

  if (!summary.quickbooksInvoiceId || !isVerifiedQuickBooksSyncStatus(summary.quickbooksSyncStatus)) {
    throw new Error("Sync and verify this billing summary in QuickBooks before sending it.");
  }
  if (!summary.quickbooksConnectionMode || summary.quickbooksConnectionMode !== connectionStatus.appMode) {
    throw new Error(`This billing summary was synced in QuickBooks ${summary.quickbooksConnectionMode ? formatQuickBooksConnectionModeLabel(summary.quickbooksConnectionMode as QuickBooksConnectionMode) : "Unknown"}. Re-sync it in ${connectionStatus.appModeLabel} mode before sending.`);
  }

  const sendParams = new URLSearchParams();
  if (summary.customerCompany.billingEmail) {
    sendParams.set("sendTo", summary.customerCompany.billingEmail);
  }

  try {
    await quickBooksApiRequest<Record<string, unknown>>(tenant, {
      path: `/invoice/${summary.quickbooksInvoiceId}/send`,
      method: "POST",
      searchParams: sendParams
    });

    await prisma.inspectionBillingSummary.update({
      where: { id: summary.id },
      data: {
        quickbooksSyncStatus: "sent",
        quickbooksSyncError: null,
        quickbooksSyncedAt: new Date()
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
          sentTo: summary.customerCompany.billingEmail ?? null
        }
      }
    });

    return {
      summaryId: summary.id,
      inspectionId: summary.inspectionId,
      invoiceId: summary.quickbooksInvoiceId,
      sentTo: summary.customerCompany.billingEmail ?? null
    };
  } catch (error) {
    const normalizedError = normalizeQuickBooksError({
      error,
      fallbackOperation: "billing.send",
      connectionMode: tenant.quickbooksConnectionMode
    });
    await prisma.inspectionBillingSummary.update({
      where: { id: summary.id },
      data: {
        quickbooksSyncStatus: "failed",
        quickbooksSyncError: normalizedError.message
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

    throw normalizedError;
  }
}
