import type { Prisma } from "@prisma/client";
import { prisma } from "@testworx/db";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { assertEnvForFeature, getOptionalQuickBooksEnv, getServerEnv } from "./env";
import { assertTenantContext } from "./permissions";

type QuickBooksTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
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

type QuickBooksCatalogFilterInput = {
  search?: string;
  itemType?: string;
  status?: "all" | "active" | "inactive";
  page?: number;
  limit?: number;
};

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
    const validationError = error instanceof Error ? error.message : "QuickBooks connection validation failed.";
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
    throw new Error(`QuickBooks token exchange failed: ${errorText || response.statusText}`);
  }

  return response.json() as Promise<QuickBooksTokenResponse>;
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

  const refreshed = await exchangeQuickBooksToken({
    grant_type: "refresh_token",
    refresh_token: connection.quickbooksRefreshToken
  });

  return prisma.tenant.update({
    where: { id: connection.id },
    data: {
      quickbooksAccessToken: refreshed.access_token,
      quickbooksRefreshToken: refreshed.refresh_token,
      quickbooksTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000)
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
    throw new Error(`QuickBooks request failed: ${errorText || response.statusText}`);
  }

  return response.json() as Promise<T>;
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
    rawJson: item
  };
}

async function fetchQuickBooksCompanyName(connection: QuickBooksTenantConnection) {
  const response = await quickBooksApiRequest<{ CompanyInfo?: { CompanyName?: string } }>(connection, {
    path: `/companyinfo/${connection.quickbooksRealmId}`
  });
  return response.CompanyInfo?.CompanyName ?? null;
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
    return customerRecord.quickbooksCustomerId;
  }

  const customerQuery = await quickBooksApiRequest<{ QueryResponse?: { Customer?: Array<{ Id: string }> } }>(connection, {
    path: "/query",
    searchParams: new URLSearchParams({
      query: `select * from Customer where DisplayName = '${qboQueryEscape(summary.customerName)}' maxresults 1`
    })
  });

  const existingCustomerId = customerQuery.QueryResponse?.Customer?.[0]?.Id;
  if (existingCustomerId) {
    await prisma.customerCompany.update({
      where: { id: summary.customerCompanyId },
      data: { quickbooksCustomerId: existingCustomerId }
    });
    return existingCustomerId;
  }

  const created = await quickBooksApiRequest<{ Customer?: { Id: string } }>(connection, {
    path: "/customer",
    method: "POST",
    body: {
      DisplayName: summary.customerName,
      CompanyName: summary.customerName,
      ...(summary.billingEmail ? { PrimaryEmailAddr: { Address: summary.billingEmail } } : {}),
      ...(summary.phone ? { PrimaryPhone: { FreeFormNumber: summary.phone } } : {}),
      BillAddr: {
        Line1: summary.addressLine1,
        ...(summary.addressLine2 ? { Line2: summary.addressLine2 } : {}),
        City: summary.city,
        CountrySubDivisionCode: summary.state,
        PostalCode: summary.postalCode
      },
      Notes: `Created by TradeWorx for ${summary.siteName}`
    }
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

  const token = await exchangeQuickBooksToken({
    grant_type: "authorization_code",
    code: input.code
  });

  const updated = await prisma.tenant.update({
    where: { id: parsedActor.tenantId as string },
    data: {
      quickbooksRealmId: input.realmId,
      quickbooksCompanyName: null,
      quickbooksAccessToken: token.access_token,
      quickbooksRefreshToken: token.refresh_token,
      quickbooksConnectionMode: resolveQuickBooksAppMode(),
      quickbooksTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
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
      metadata: { realmId: input.realmId, companyName: companyName ?? null, connectionMode: resolveQuickBooksAppMode() }
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
    rawJson: unknown;
  }> = [];

  let startPosition = 1;
  const pageSize = 500;

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
          rawJson: item.rawJson as Prisma.InputJsonValue,
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
    await prisma.inspectionBillingSummary.update({
      where: { id: summary.id },
      data: {
        quickbooksInvoiceId: null,
        quickbooksInvoiceNumber: null,
        quickbooksConnectionMode: null,
        quickbooksCustomerId: null,
        quickbooksSyncedAt: null,
        quickbooksSyncStatus: "failed",
        quickbooksSyncError: error instanceof Error ? error.message : "QuickBooks sync failed."
      }
    });

    throw error;
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
    await prisma.inspectionBillingSummary.update({
      where: { id: summary.id },
      data: {
        quickbooksSyncStatus: "failed",
        quickbooksSyncError: error instanceof Error ? error.message : "QuickBooks send failed."
      }
    });

    throw error;
  }
}
