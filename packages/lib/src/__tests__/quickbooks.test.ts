import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetServerEnvForTests } from "../env";

const prismaMock = {
  tenant: {
    findUnique: vi.fn(),
    update: vi.fn()
  },
  customerCompany: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn()
  },
  site: {
    findFirst: vi.fn()
  },
  quickBooksCatalogItem: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    groupBy: vi.fn(),
    count: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },
  quickBooksItemMap: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn()
  },
  quickBooksItemCache: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    createMany: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn()
  },
  quoteLineItem: {
    findMany: vi.fn()
  },
  inspectionBillingSummary: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn()
  },
  inspection: {
    update: vi.fn()
  },
  auditLog: {
    create: vi.fn(),
    findFirst: vi.fn()
  },
  $transaction: vi.fn()
};

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init
  });
}

function jsonResponseWithTid(body: unknown, intuitTid: string, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set("intuit_tid", intuitTid);

  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers
  });
}

function buildTenantConnection() {
  return {
    id: "tenant_1",
    name: "Evergreen Fire",
    quickbooksRealmId: "realm_1",
    quickbooksCompanyName: "Evergreen Fire QBO",
    quickbooksConnectionMode: "live",
    quickbooksAccessToken: "access_token",
    quickbooksRefreshToken: "refresh_token",
    quickbooksTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    quickbooksConnectedAt: new Date("2026-03-23T12:00:00.000Z")
  };
}

function buildBillingSummary(overrides?: Partial<{
  status: string;
  quickbooksSyncStatus: string | null;
  quickbooksSendStatus: string | null;
  quickbooksInvoiceId: string | null;
  quickbooksConnectionMode: string | null;
  quickbooksSentAt: Date | null;
  quickbooksSendError: string | null;
  billingEmail: string | null;
}>) {
  return {
    id: "summary_1",
    tenantId: "tenant_1",
    inspectionId: "inspection_1",
    customerCompanyId: "customer_1",
    status: overrides?.status ?? "reviewed",
    subtotal: 125,
    notes: "Inspection billing",
    items: [
      {
        id: "item_1",
        description: "Annual Inspection",
        quantity: 1,
        unitPrice: 125,
        amount: 125,
        unit: "ea",
        category: "service",
        code: "FE-ANNUAL"
      }
    ],
    quickbooksSyncStatus: overrides?.quickbooksSyncStatus ?? "not_synced",
    quickbooksSendStatus: overrides?.quickbooksSendStatus ?? "not_sent",
    quickbooksInvoiceId: overrides?.quickbooksInvoiceId ?? null,
    quickbooksConnectionMode: overrides?.quickbooksConnectionMode ?? null,
    quickbooksSentAt: overrides?.quickbooksSentAt ?? null,
    quickbooksSendError: overrides?.quickbooksSendError ?? null,
    quickbooksInvoiceNumber: null,
    customerCompany: {
      id: "customer_1",
      name: "Pinecrest Property Management",
      billingEmail: overrides?.billingEmail === undefined ? "billing@pinecrest.example" : overrides.billingEmail,
      phone: "312-555-0110"
    },
    site: {
      id: "site_1",
      name: "Pinecrest Tower",
      addressLine1: "100 State St",
      addressLine2: null,
      city: "Chicago",
      state: "IL",
      postalCode: "60601"
    }
  };
}

describe("quickbooks billing sync hardening", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/testworx?schema=public");
    vi.stubEnv("AUTH_SECRET", "replace-with-a-long-random-secret");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("STORAGE_DRIVER", "inline");
    vi.stubEnv("QUICKBOOKS_CLIENT_ID", "client_id");
    vi.stubEnv("QUICKBOOKS_CLIENT_SECRET", "client_secret");
    vi.stubEnv("QUICKBOOKS_SANDBOX", "false");
    prismaMock.auditLog.create.mockResolvedValue(undefined);
    prismaMock.auditLog.findFirst.mockResolvedValue(null);
    prismaMock.quickBooksItemMap.findUnique.mockResolvedValue({
      id: "mapping_1",
      tenantId: "tenant_1",
      integrationId: "realm_1",
      internalCode: "FE-ANNUAL",
      internalName: "Annual Inspection",
      qbItemId: "mapped_item_1",
      qbItemName: "Annual Inspection",
      qbItemType: "Service",
      qbSyncToken: "1",
      qbActive: true,
      matchSource: "manual"
    });
    prismaMock.quickBooksItemCache.findUnique.mockResolvedValue({
      id: "cache_1",
      tenantId: "tenant_1",
      integrationId: "realm_1",
      qbItemId: "mapped_item_1",
      qbItemName: "Annual Inspection",
      normalizedName: "annual",
      qbItemType: "Service",
      qbActive: true,
      qbSyncToken: "1",
      rawJson: {}
    });
    prismaMock.quickBooksItemCache.findMany.mockResolvedValue([]);
    prismaMock.quickBooksItemCache.upsert.mockResolvedValue(undefined);
    prismaMock.quickBooksItemCache.createMany.mockResolvedValue({ count: 0 });
    prismaMock.quickBooksItemCache.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.quoteLineItem.findMany.mockResolvedValue([]);
    prismaMock.inspectionBillingSummary.findMany.mockResolvedValue([]);
    prismaMock.quickBooksItemMap.upsert.mockResolvedValue(undefined);
    prismaMock.quickBooksItemMap.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.inspection.update.mockResolvedValue(undefined);
    prismaMock.$transaction.mockImplementation(async (input: unknown) => {
      if (Array.isArray(input)) {
        return Promise.all(input as Promise<unknown>[]);
      }
      if (typeof input === "function") {
        return (input as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock as never);
      }
      return input;
    });
    resetServerEnvForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetServerEnvForTests();
  });

  it("marks billing summaries synced and auto-sent after the created invoice is verified", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.customerCompany.findUnique.mockResolvedValue({ quickbooksCustomerId: null });
    prismaMock.customerCompany.update.mockResolvedValue(undefined);
    prismaMock.customerCompany.update.mockResolvedValue(undefined);
    prismaMock.site.findFirst.mockResolvedValue(null);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([]);
    prismaMock.inspectionBillingSummary.findUnique.mockResolvedValue(buildBillingSummary());
    prismaMock.inspectionBillingSummary.update.mockResolvedValue(undefined);
    prismaMock.auditLog.create.mockResolvedValue(undefined);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: {} }))
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "qbo_customer_1" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW-TION_1" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW-TION_1" } }))
      .mockResolvedValueOnce(jsonResponse({}));

    const { syncBillingSummaryToQuickBooks } = await import("../quickbooks");

    const result = await syncBillingSummaryToQuickBooks(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1"
    );

    expect(result).toEqual({
      summaryId: "summary_1",
      inspectionId: "inspection_1",
      invoiceId: "invoice_1",
      invoiceNumber: "TW-TION_1",
      quickbooksSendStatus: "sent",
      quickbooksSendError: null,
      quickbooksSentTo: "billing@pinecrest.example"
    });
    expect(prismaMock.inspectionBillingSummary.update).toHaveBeenCalledWith({
      where: { id: "summary_1" },
      data: expect.objectContaining({
        status: "invoiced",
        quickbooksSyncStatus: "synced",
        quickbooksInvoiceId: "invoice_1",
        quickbooksConnectionMode: "live",
        quickbooksInvoiceNumber: "TW-TION_1",
        quickbooksCustomerId: "qbo_customer_1",
        quickbooksSyncError: null
      })
    });
    expect(prismaMock.inspectionBillingSummary.update).toHaveBeenCalledWith({
      where: { id: "summary_1" },
      data: expect.objectContaining({
        quickbooksSendStatus: "sent",
        quickbooksSendError: null
      })
    });
  });

  it("keeps invoice synced and marks send skipped when billing email is missing", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.customerCompany.findUnique.mockResolvedValue({ quickbooksCustomerId: null });
    prismaMock.customerCompany.update.mockResolvedValue(undefined);
    prismaMock.site.findFirst.mockResolvedValue(null);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([]);
    prismaMock.inspectionBillingSummary.findUnique.mockResolvedValue(buildBillingSummary({ billingEmail: null }));
    prismaMock.inspectionBillingSummary.update.mockResolvedValue(undefined);
    prismaMock.auditLog.create.mockResolvedValue(undefined);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: {} }))
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "qbo_customer_1" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW-TION_1" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW-TION_1" } }));

    const { syncBillingSummaryToQuickBooks } = await import("../quickbooks");

    const result = await syncBillingSummaryToQuickBooks(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1"
    );

    expect(result.quickbooksSendStatus).toBe("send_skipped");
    expect(result.quickbooksSendError).toMatch(/does not have a billing email/i);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(prismaMock.inspectionBillingSummary.update).toHaveBeenCalledWith({
      where: { id: "summary_1" },
      data: expect.objectContaining({
        quickbooksSyncStatus: "synced",
        quickbooksInvoiceId: "invoice_1"
      })
    });
    expect(prismaMock.inspectionBillingSummary.update).toHaveBeenCalledWith({
      where: { id: "summary_1" },
      data: expect.objectContaining({
        quickbooksSendStatus: "send_skipped"
      })
    });
  });

  it("keeps invoice synced when auto-send fails after sync", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.customerCompany.findUnique.mockResolvedValue({ quickbooksCustomerId: null });
    prismaMock.customerCompany.update.mockResolvedValue(undefined);
    prismaMock.site.findFirst.mockResolvedValue(null);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([]);
    prismaMock.inspectionBillingSummary.findUnique.mockResolvedValue(buildBillingSummary());
    prismaMock.inspectionBillingSummary.update.mockResolvedValue(undefined);
    prismaMock.auditLog.create.mockResolvedValue(undefined);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: {} }))
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "qbo_customer_1" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW-TION_1" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW-TION_1" } }))
      .mockResolvedValueOnce(new Response("Send failed", { status: 500 }));

    const { syncBillingSummaryToQuickBooks } = await import("../quickbooks");

    const result = await syncBillingSummaryToQuickBooks(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1"
    );

    expect(result.quickbooksSendStatus).toBe("send_failed");
    expect(result.quickbooksSendError).toMatch(/send failed/i);
    expect(prismaMock.inspectionBillingSummary.update).toHaveBeenCalledWith({
      where: { id: "summary_1" },
      data: expect.objectContaining({
        quickbooksSendStatus: "send_failed"
      })
    });
    expect(prismaMock.inspectionBillingSummary.update).not.toHaveBeenCalledWith({
      where: { id: "summary_1" },
      data: expect.objectContaining({
        quickbooksSyncStatus: "failed"
      })
    });
  });

  it("fails closed when QuickBooks returns an incomplete invoice creation response", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.customerCompany.findUnique.mockResolvedValue({ quickbooksCustomerId: "qbo_customer_1" });
    prismaMock.customerCompany.findFirst.mockResolvedValue(null);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([]);
    prismaMock.inspectionBillingSummary.findUnique.mockResolvedValue(buildBillingSummary());
    prismaMock.inspectionBillingSummary.update.mockResolvedValue(undefined);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "qbo_customer_1", DisplayName: "Pinecrest Property Management", SyncToken: "0" } }))
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "qbo_customer_1", DisplayName: "Pinecrest Property Management" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: {} }));

    const { syncBillingSummaryToQuickBooks } = await import("../quickbooks");

    await expect(
      syncBillingSummaryToQuickBooks(
        { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
        "inspection_1"
      )
    ).rejects.toThrow(/incomplete invoice response/i);

    expect(prismaMock.inspectionBillingSummary.update).toHaveBeenCalledWith({
      where: { id: "summary_1" },
      data: expect.objectContaining({
        quickbooksInvoiceId: null,
        quickbooksInvoiceNumber: null,
        quickbooksCustomerId: null,
        quickbooksSyncedAt: null,
        quickbooksSyncStatus: "failed"
      })
    });
  });

  it("fails when invoice creation appears successful but the returned invoice id cannot be verified", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.customerCompany.findUnique.mockResolvedValue({ quickbooksCustomerId: "qbo_customer_1" });
    prismaMock.customerCompany.update.mockResolvedValue(undefined);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([]);
    prismaMock.inspectionBillingSummary.findUnique.mockResolvedValue(buildBillingSummary());
    prismaMock.inspectionBillingSummary.update.mockResolvedValue(undefined);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "qbo_customer_1", DisplayName: "Pinecrest Property Management", SyncToken: "0" } }))
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "qbo_customer_1", DisplayName: "Pinecrest Property Management" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_missing", DocNumber: "TW-TION_1" } }))
      .mockResolvedValueOnce(new Response("Not found", { status: 404 }));

    const { syncBillingSummaryToQuickBooks } = await import("../quickbooks");

    await expect(
      syncBillingSummaryToQuickBooks(
        { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
        "inspection_1"
      )
    ).rejects.toThrow(/did not verify invoice/i);

    expect(prismaMock.inspectionBillingSummary.update).toHaveBeenCalledWith({
      where: { id: "summary_1" },
      data: expect.objectContaining({
        quickbooksSyncStatus: "failed",
        quickbooksInvoiceId: null,
        quickbooksInvoiceNumber: null
      })
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("requires a verified synced invoice before sending to QuickBooks", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.inspectionBillingSummary.findUnique.mockResolvedValue(
      buildBillingSummary({
        status: "reviewed",
        quickbooksSyncStatus: "failed",
        quickbooksInvoiceId: "invoice_1"
      })
    );

    const { sendQuickBooksInvoice } = await import("../quickbooks");

    await expect(
      sendQuickBooksInvoice(
        { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
        "inspection_1"
      )
    ).rejects.toThrow(/sync and verify this billing summary/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("imports QuickBooks products and services into the tenant catalog", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.quickBooksCatalogItem.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.quickBooksCatalogItem.createMany.mockResolvedValue({ count: 2 });
    prismaMock.auditLog.create.mockResolvedValue(undefined);
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => Promise<unknown>) => callback(prismaMock as never));

    fetchMock.mockResolvedValueOnce(jsonResponse({
      QueryResponse: {
        Item: [
          { Id: "qbo_item_1", Name: "FE-ANNUAL", Sku: "FE-ANNUAL", Type: "Service", Active: true, UnitPrice: 25 },
          { Id: "qbo_item_2", Name: "Battery replacement", Sku: "EL-BATTERY", Type: "Service", Active: true, UnitPrice: 18 }
        ]
      }
    }));

    const { importQuickBooksCatalogItems } = await import("../quickbooks");

    const result = await importQuickBooksCatalogItems(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" }
    );

    expect(result).toEqual({ importedItemCount: 2 });
    expect(prismaMock.quickBooksCatalogItem.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          tenantId: "tenant_1",
          quickbooksItemId: "qbo_item_1",
          name: "FE-ANNUAL",
          sku: "FE-ANNUAL",
          itemType: "Service",
          active: true,
          unitPrice: 25
        })
      ])
    });
  });

  it("creates a QuickBooks service item and caches it locally", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.quickBooksCatalogItem.findFirst.mockResolvedValue(null);
    prismaMock.quickBooksCatalogItem.create.mockResolvedValue({
      id: "catalog_1",
      quickbooksItemId: "qbo_item_9",
      name: "Annual inspection",
      sku: "FE-ANNUAL",
      itemType: "Service",
      active: true,
      unitPrice: 95,
      incomeAccountId: "income_1",
      incomeAccountName: null,
      rawJson: {},
      importedAt: new Date()
    });
    prismaMock.auditLog.create.mockResolvedValue(undefined);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: { Account: [{ Id: "income_1" }] } }))
      .mockResolvedValueOnce(jsonResponse({
        Item: {
          Id: "qbo_item_9",
          Name: "Annual inspection",
          Sku: "FE-ANNUAL",
          Type: "Service",
          Active: true,
          UnitPrice: 95,
          IncomeAccountRef: { value: "income_1" }
        }
      }));

    const { createQuickBooksCatalogItem } = await import("../quickbooks");

    const result = await createQuickBooksCatalogItem(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        name: "Annual inspection",
        sku: "FE-ANNUAL",
        itemType: "Service",
        unitPrice: 95,
        active: true
      }
    );

    expect(prismaMock.quickBooksCatalogItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        quickbooksItemId: "qbo_item_9",
        name: "Annual inspection",
        sku: "FE-ANNUAL",
        itemType: "Service",
        unitPrice: 95
      })
    });
    expect(result).toEqual(expect.objectContaining({
      id: "catalog_1",
      quickbooksItemId: "qbo_item_9"
    }));
  });

  it("updates an existing QuickBooks service item and refreshes the local cache", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.quickBooksCatalogItem.findFirst
      .mockResolvedValueOnce({
        id: "catalog_1",
        quickbooksItemId: "qbo_item_9",
        itemType: "Service"
      })
      .mockResolvedValueOnce({
        id: "catalog_1"
      });
    prismaMock.quickBooksCatalogItem.update.mockResolvedValue({
      id: "catalog_1",
      quickbooksItemId: "qbo_item_9",
      name: "Annual inspection updated",
      sku: "FE-ANNUAL",
      itemType: "Service",
      active: false,
      unitPrice: 110,
      incomeAccountId: "income_1",
      incomeAccountName: null,
      rawJson: {},
      importedAt: new Date()
    });
    prismaMock.auditLog.create.mockResolvedValue(undefined);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        Item: {
          Id: "qbo_item_9",
          Name: "Annual inspection",
          Sku: "FE-ANNUAL",
          Type: "Service",
          Active: true,
          UnitPrice: 95,
          SyncToken: "2",
          IncomeAccountRef: { value: "income_1" }
        }
      }))
      .mockResolvedValueOnce(jsonResponse({
        Item: {
          Id: "qbo_item_9",
          Name: "Annual inspection updated",
          Sku: "FE-ANNUAL",
          Type: "Service",
          Active: false,
          UnitPrice: 110,
          IncomeAccountRef: { value: "income_1" }
        }
      }));

    const { updateQuickBooksCatalogItem } = await import("../quickbooks");

    const result = await updateQuickBooksCatalogItem(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        catalogItemId: "catalog_1",
        name: "Annual inspection updated",
        sku: "FE-ANNUAL",
        itemType: "Service",
        unitPrice: 110,
        active: false
      }
    );

    expect(prismaMock.quickBooksCatalogItem.update).toHaveBeenCalledWith({
      where: { id: "catalog_1" },
      data: expect.objectContaining({
        tenantId: "tenant_1",
        quickbooksItemId: "qbo_item_9",
        name: "Annual inspection updated",
        active: false,
        unitPrice: 110
      })
    });
    expect(result).toEqual(expect.objectContaining({
      id: "catalog_1",
      quickbooksItemId: "qbo_item_9",
      active: false
    }));
  });

  it("blocks catalog access when the stored QuickBooks connection mode does not match the app mode", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      ...buildTenantConnection(),
      quickbooksConnectionMode: "sandbox"
    });

    const { getTenantQuickBooksSettings } = await import("../quickbooks");

    const settings = await getTenantQuickBooksSettings(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" }
    );

    expect(settings.tenant.connected).toBe(false);
    expect(settings.tenant.modeMismatch).toBe(true);
    expect(settings.catalog.itemCount).toBe(0);
    expect(settings.catalog.items).toEqual([]);
  });

  it("marks the connection as reconnect-required when company validation fails", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());

    fetchMock.mockResolvedValueOnce(
      jsonResponseWithTid({
        fault: {
          error: [
            {
              message: "message=ApplicationAuthorizationFailed; errorCode=003100; statusCode=403",
              code: "3100"
            }
          ],
          type: "SERVICE"
        }
      }, "tid_validation_1", {
        status: 403,
      })
    );

    const { getTenantQuickBooksSettings } = await import("../quickbooks");

    const settings = await getTenantQuickBooksSettings(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" }
    );

    expect(settings.tenant.connected).toBe(false);
    expect(settings.tenant.reconnectRequired).toBe(true);
    expect(settings.tenant.quickbooksCompanyName).toBeNull();
    expect(settings.tenant.guidance).toMatch(/authorization is no longer valid/i);
    expect(settings.catalog.itemCount).toBe(0);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        action: "quickbooks.auth_failed",
        metadata: expect.objectContaining({
          operation: "GET /companyinfo/realm_1",
          httpStatus: 403,
          intuitTid: "tid_validation_1"
        })
      })
    });
  });

  it("blocks invoice sync when the stored QuickBooks connection mode does not match the app mode", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      ...buildTenantConnection(),
      quickbooksConnectionMode: "sandbox"
    });

    const { syncBillingSummaryToQuickBooks } = await import("../quickbooks");

    await expect(
      syncBillingSummaryToQuickBooks(
        { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
        "inspection_1"
      )
    ).rejects.toThrow(/connected to QuickBooks Sandbox/i);
  });

  it("requires reconnect for legacy connections with no stored environment", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      ...buildTenantConnection(),
      quickbooksConnectionMode: null
    });

    const { importQuickBooksCatalogItems } = await import("../quickbooks");

    await expect(
      importQuickBooksCatalogItems(
        { userId: "office_1", role: "office_admin", tenantId: "tenant_1" }
      )
    ).rejects.toThrow(/saved before environment tracking was added/i);
  });

  it("uses stored QuickBooks item mappings instead of live name matching during invoice sync", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.customerCompany.findUnique.mockResolvedValue({ quickbooksCustomerId: "qbo_customer_1" });
    prismaMock.customerCompany.update.mockResolvedValue(undefined);
    prismaMock.inspectionBillingSummary.findUnique.mockResolvedValue(buildBillingSummary());
    prismaMock.inspectionBillingSummary.update.mockResolvedValue(undefined);
    prismaMock.auditLog.create.mockResolvedValue(undefined);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "qbo_customer_1", DisplayName: "Pinecrest Property Management", SyncToken: "0" } }))
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "qbo_customer_1", DisplayName: "Pinecrest Property Management" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW-TION_1" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW-TION_1" } }));

    const { syncBillingSummaryToQuickBooks } = await import("../quickbooks");

    await syncBillingSummaryToQuickBooks(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1"
    );

    expect(fetchMock).toHaveBeenCalledTimes(5);
    const invoiceBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body ?? "{}"));
    expect(invoiceBody.Line?.[0]?.SalesItemLineDetail?.ItemRef).toEqual({
      value: "mapped_item_1",
      name: "Annual Inspection"
    });
  });

  it("explains how to fix unmapped location-based service fee codes during invoice sync", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.customerCompany.findUnique.mockResolvedValue({ quickbooksCustomerId: "qbo_customer_1" });
    prismaMock.customerCompany.update.mockResolvedValue(undefined);
    prismaMock.inspectionBillingSummary.findUnique.mockResolvedValue({
      ...buildBillingSummary(),
      items: [
        {
          id: "item_service_fee",
          description: "Service Fee",
          quantity: 1,
          unitPrice: 95,
          amount: 95,
          unit: "ea",
          category: "fee",
          code: "SERVICE_FEE"
        }
      ]
    });
    prismaMock.inspectionBillingSummary.update.mockResolvedValue(undefined);
    prismaMock.quickBooksItemMap.findUnique.mockResolvedValue(null);
    prismaMock.quickBooksItemCache.findUnique.mockResolvedValue(null);
    prismaMock.quickBooksItemCache.findMany.mockResolvedValue([
      {
        id: "cache_service_fee",
        tenantId: "tenant_1",
        integrationId: "realm_1",
        qbItemId: "mapped_item_service_fee",
        qbItemName: "Service Fee",
        normalizedName: "service fee",
        qbItemType: "Service",
        qbActive: true,
        qbSyncToken: "1",
        rawJson: {}
      }
    ]);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([]);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "qbo_customer_1", DisplayName: "Pinecrest Property Management", SyncToken: "0" } }))
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "qbo_customer_1", DisplayName: "Pinecrest Property Management" } }));

    const { syncBillingSummaryToQuickBooks } = await import("../quickbooks");

    const failure = syncBillingSummaryToQuickBooks(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1"
    );

    await expect(failure).rejects.toThrow(/Map billing code "SERVICE_FEE" to the QuickBooks item you want to use for all service fees/i);
    await expect(failure).rejects.toThrow(/Suggested items: Service Fee/i);
    await expect(failure).rejects.toThrow(/location-based fee rules/i);
  });

  it("returns the latest QuickBooks support reference in tenant settings", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      ...buildTenantConnection(),
      quickbooksConnectionMode: "sandbox"
    });
    prismaMock.auditLog.findFirst.mockResolvedValue({
      action: "quickbooks.sync_failed",
      createdAt: new Date("2026-03-24T14:22:00.000Z"),
      metadata: {
        intuitTid: "tid_support_1",
        message: "QuickBooks request failed: Duplicate Document Number Error"
      }
    });

    const { getTenantQuickBooksSettings } = await import("../quickbooks");

    const settings = await getTenantQuickBooksSettings(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" }
    );

    expect(settings.supportReference).toEqual({
      action: "quickbooks.sync_failed",
      createdAt: new Date("2026-03-24T14:22:00.000Z"),
      intuitTid: "tid_support_1",
      message: "QuickBooks request failed: Duplicate Document Number Error"
    });
  });

  it("imports QuickBooks customers into tenant customer companies", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.customerCompany.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "customer_existing", contactName: null, billingEmail: null, phone: null });
    prismaMock.customerCompany.create.mockResolvedValue({ id: "customer_new" });
    prismaMock.customerCompany.update.mockResolvedValue({ id: "customer_existing" });
    prismaMock.auditLog.create.mockResolvedValue(undefined);

    fetchMock.mockResolvedValueOnce(jsonResponse({
      QueryResponse: {
        Customer: [
          {
            Id: "qbo_customer_1",
            DisplayName: "Acme Tower",
            CompanyName: "Acme Tower",
            PrimaryEmailAddr: { Address: "billing@acme.test" },
            PrimaryPhone: { FreeFormNumber: "312-555-0101" },
            SalesTermRef: { value: "3", name: "Net 30" },
            BillAddr: {
              Line1: "200 Billing Ave",
              City: "Chicago",
              CountrySubDivisionCode: "IL",
              PostalCode: "60602",
              Country: "US"
            },
            ShipAddr: {
              Line1: "100 Service St",
              Line2: "Suite 400",
              City: "Chicago",
              CountrySubDivisionCode: "IL",
              PostalCode: "60601",
              Country: "US"
            }
          },
          {
            Id: "qbo_customer_2",
            DisplayName: "Pinecrest Property Management",
            CompanyName: "Pinecrest Property Management",
            SalesTermRef: { value: "1", name: "Due on Receipt" }
          }
        ]
      }
    }));

    const { importQuickBooksCustomers } = await import("../quickbooks");

    const result = await importQuickBooksCustomers(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" }
    );

    expect(result).toEqual({
      importedCustomerCount: 2,
      customersCreated: 1,
      customersUpdated: 1
    });
    expect(prismaMock.customerCompany.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        name: "Acme Tower",
        billingEmail: "billing@acme.test",
        phone: "312-555-0101",
        paymentTermsCode: "net_30",
        billingAddressLine1: "200 Billing Ave",
        serviceAddressLine1: "100 Service St",
        serviceAddressLine2: "Suite 400",
        billingAddressSameAsService: false,
        quickbooksCustomerId: "qbo_customer_1"
      })
    });
    expect(prismaMock.customerCompany.update).toHaveBeenCalledWith({
      where: { id: "customer_existing" },
      data: expect.objectContaining({
        name: "Pinecrest Property Management",
        paymentTermsCode: "due_on_receipt",
        quickbooksCustomerId: "qbo_customer_2"
      })
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "customer.quickbooks_imported",
        entityType: "CustomerCompany",
        entityId: "customer_new",
        metadata: expect.objectContaining({
          importAction: "created",
          matchStrategy: "new"
        })
      })
    });
  });

  it("matches imported QuickBooks customers by billing email before display name", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.customerCompany.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "customer_email_match",
        name: "Legacy Customer Name",
        contactName: null,
        billingEmail: "billing@acme.test",
        phone: null
      });
    prismaMock.customerCompany.update.mockResolvedValue({ id: "customer_email_match" });
    prismaMock.auditLog.create.mockResolvedValue(undefined);

    fetchMock.mockResolvedValueOnce(jsonResponse({
      QueryResponse: {
        Customer: [
          {
            Id: "qbo_customer_email",
            DisplayName: "Acme Tower",
            CompanyName: "Acme Tower",
            PrimaryEmailAddr: { Address: "billing@acme.test" },
            PrimaryPhone: { FreeFormNumber: "312-555-0101" },
            SalesTermRef: { value: "9", name: "Net 45" },
            BillAddr: {
              Line1: "500 Billing Ave",
              City: "Tulsa",
              CountrySubDivisionCode: "OK",
              PostalCode: "74103",
              Country: "US"
            },
            ShipAddr: {
              Line1: "500 Billing Ave",
              City: "Tulsa",
              CountrySubDivisionCode: "OK",
              PostalCode: "74103",
              Country: "US"
            }
          }
        ]
      }
    }));

    const { importQuickBooksCustomers } = await import("../quickbooks");

    const result = await importQuickBooksCustomers(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" }
    );

    expect(result).toEqual({
      importedCustomerCount: 1,
      customersCreated: 0,
      customersUpdated: 1
    });
    expect(prismaMock.customerCompany.update).toHaveBeenCalledWith({
      where: { id: "customer_email_match" },
      data: expect.objectContaining({
        name: "Acme Tower",
        billingEmail: "billing@acme.test",
        paymentTermsCode: "custom",
        customPaymentTermsLabel: "Net 45",
        customPaymentTermsDays: 45,
        billingAddressSameAsService: true,
        billingAddressLine1: "500 Billing Ave",
        serviceAddressLine1: "500 Billing Ave",
        quickbooksCustomerId: "qbo_customer_email"
      })
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "customer.quickbooks_imported",
        entityType: "CustomerCompany",
        entityId: "customer_email_match",
        metadata: expect.objectContaining({
          importAction: "updated",
          matchStrategy: "billing_email"
        })
      })
    });
  });

  it("syncs a TradeWorx customer company to QuickBooks", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.customerCompany.findFirst.mockResolvedValue({
      id: "customer_1",
      name: "Pinecrest Property Management",
      contactName: "Alyssa Reed",
      billingEmail: "billing@pinecrest.example",
      phone: "312-555-0110",
      billingAddressLine1: "200 Billing Ave",
      billingAddressLine2: "Suite 1200",
      billingCity: "Chicago",
      billingState: "IL",
      billingPostalCode: "60602",
      billingCountry: "US",
      serviceAddressLine1: "100 Service St",
      serviceAddressLine2: "Suite 400",
      serviceCity: "Chicago",
      serviceState: "IL",
      servicePostalCode: "60601",
      serviceCountry: "US",
      notes: "Collect certificate copy on site",
      quickbooksCustomerId: null
    });
    prismaMock.site.findFirst.mockResolvedValue({
      name: "Pinecrest Tower",
      addressLine1: "100 State St",
      addressLine2: null,
      city: "Chicago",
      state: "IL",
      postalCode: "60601"
    });
    prismaMock.customerCompany.update.mockResolvedValue(undefined);
    prismaMock.auditLog.create.mockResolvedValue(undefined);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: {} }))
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "qbo_customer_9", DisplayName: "Pinecrest Property Management" } }));

    const { syncTradeWorxCustomerCompanyToQuickBooks } = await import("../quickbooks");

    const result = await syncTradeWorxCustomerCompanyToQuickBooks(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "customer_1"
    );

    expect(result).toEqual({
      customerCompanyId: "customer_1",
      quickbooksCustomerId: "qbo_customer_9"
    });
    expect(prismaMock.customerCompany.update).toHaveBeenCalledWith({
      where: { id: "customer_1" },
      data: { quickbooksCustomerId: "qbo_customer_9" }
    });
    const createBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? "{}"));
    expect(createBody.BillAddr).toEqual(expect.objectContaining({
      Line1: "200 Billing Ave",
      Line2: "Suite 1200",
      City: "Chicago",
      CountrySubDivisionCode: "IL",
      PostalCode: "60602",
      Country: "US"
    }));
    expect(createBody.ShipAddr).toEqual(expect.objectContaining({
      Line1: "100 Service St",
      Line2: "Suite 400",
      City: "Chicago",
      CountrySubDivisionCode: "IL",
      PostalCode: "60601",
      Country: "US"
    }));
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "customer.quickbooks_synced",
        entityType: "CustomerCompany",
        entityId: "customer_1",
        metadata: expect.objectContaining({
          syncStrategy: "created",
          quickbooksCustomerId: "qbo_customer_9"
        })
      })
    });
  });

  it("reconciles QuickBooks customers in both directions for the tenant", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.customerCompany.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.tenantId === "tenant_1" && where.quickbooksCustomerId === "qbo_customer_1") {
        return null;
      }

      if (
        where.tenantId === "tenant_1"
        && typeof where.billingEmail === "object"
        && where.billingEmail !== null
        && "equals" in where.billingEmail
        && (where.billingEmail as { equals: string }).equals === "billing@acme.test"
      ) {
        return null;
      }

      if (where.tenantId === "tenant_1" && where.name === "Acme Tower") {
        return null;
      }

      if (where.tenantId === "tenant_1" && where.quickbooksCustomerId === "qbo_customer_2") {
        return null;
      }

      if (where.tenantId === "tenant_1" && where.name === "Pinecrest Property Management") {
        return {
          id: "customer_existing",
          contactName: null,
          billingEmail: null,
          phone: null
        };
      }

      if (where.tenantId === "tenant_1" && where.id === "customer_existing") {
        return {
          id: "customer_existing",
          name: "Pinecrest Property Management",
          contactName: "Alyssa Reed",
          billingEmail: "billing@pinecrest.example",
          phone: "312-555-0110",
          quickbooksCustomerId: "qbo_customer_2"
        };
      }

      if (where.tenantId === "tenant_1" && where.id === "customer_new") {
        return {
          id: "customer_new",
          name: "Acme Tower",
          contactName: null,
          billingEmail: "billing@acme.test",
          phone: "312-555-0101",
          quickbooksCustomerId: "qbo_customer_1"
        };
      }

      return null;
    });
    prismaMock.customerCompany.findMany.mockResolvedValue([
      { id: "customer_existing" },
      { id: "customer_new" }
    ]);
    prismaMock.customerCompany.create.mockResolvedValue({ id: "customer_new" });
    prismaMock.customerCompany.update.mockResolvedValue(undefined);
    prismaMock.site.findFirst.mockResolvedValue({
      name: "Pinecrest Tower",
      addressLine1: "100 State St",
      addressLine2: null,
      city: "Chicago",
      state: "IL",
      postalCode: "60601"
    });
    prismaMock.auditLog.create.mockResolvedValue(undefined);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        QueryResponse: {
          Customer: [
            {
              Id: "qbo_customer_1",
              DisplayName: "Acme Tower",
              CompanyName: "Acme Tower",
              PrimaryEmailAddr: { Address: "billing@acme.test" },
              PrimaryPhone: { FreeFormNumber: "312-555-0101" }
            },
            {
              Id: "qbo_customer_2",
              DisplayName: "Pinecrest Property Management",
              CompanyName: "Pinecrest Property Management"
            }
          ]
        }
      }))
      .mockResolvedValueOnce(jsonResponse({
        Customer: { Id: "qbo_customer_2", DisplayName: "Pinecrest Property Management", SyncToken: "1" }
      }))
      .mockResolvedValueOnce(jsonResponse({
        Customer: { Id: "qbo_customer_2", DisplayName: "Pinecrest Property Management", SyncToken: "2" }
      }))
      .mockResolvedValueOnce(jsonResponse({
        Customer: { Id: "qbo_customer_1", DisplayName: "Acme Tower", SyncToken: "1" }
      }))
      .mockResolvedValueOnce(jsonResponse({
        Customer: { Id: "qbo_customer_1", DisplayName: "Acme Tower", SyncToken: "2" }
      }));

    const { syncQuickBooksCustomers } = await import("../quickbooks");

    const result = await syncQuickBooksCustomers(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" }
    );

    expect(result).toEqual({
      importedCustomerCount: 2,
      customersCreated: 1,
      customersUpdated: 1,
      customersSynced: 2
    });
    expect(prismaMock.customerCompany.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant_1" },
      select: { id: true }
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        action: "tenant.quickbooks_customers_reconciled",
        metadata: expect.objectContaining({
          importedCustomerCount: 2,
          customersSynced: 2
        })
      })
    });
  });

  it("captures intuit_tid when token refresh fails", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      ...buildTenantConnection(),
      quickbooksTokenExpiresAt: new Date(Date.now() - 60 * 1000)
    });

    fetchMock.mockResolvedValueOnce(
      jsonResponseWithTid(
        {
          error: "invalid_grant",
          error_description: "Refresh token expired"
        },
        "tid_refresh_1",
        { status: 400 }
      )
    );

    const { importQuickBooksCatalogItems } = await import("../quickbooks");

    await expect(
      importQuickBooksCatalogItems(
        { userId: "office_1", role: "office_admin", tenantId: "tenant_1" }
      )
    ).rejects.toThrow(/token exchange failed/i);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        action: "quickbooks.auth_failed",
        metadata: expect.objectContaining({
          operation: "token.refresh",
          httpStatus: 400,
          intuitTid: "tid_refresh_1"
        })
      })
    });
  });

  it("returns active cached QuickBooks items for manual mapping in settings", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.inspectionBillingSummary.findMany.mockResolvedValue([
      {
        items: [
          {
            id: "item_1",
            description: "New (2.5 lb ABC)",
            quantity: 1,
            unitPrice: 25,
            amount: 25,
            unit: "ea",
            category: "service",
            code: "FE-NEW-2_5_LB_ABC"
          }
        ]
      }
    ]);
    prismaMock.quoteLineItem.findMany.mockResolvedValue([]);
    prismaMock.quickBooksItemMap.findMany.mockResolvedValue([]);
    prismaMock.quickBooksItemCache.findMany.mockResolvedValue([
      {
        qbItemId: "qb_active_2",
        qbItemName: "Zeta Service",
        normalizedName: "zeta service",
        qbItemType: "Service",
        qbActive: true,
        qbSyncToken: "2"
      },
      {
        qbItemId: "qb_inactive_1",
        qbItemName: "Inactive Service",
        normalizedName: "inactive service",
        qbItemType: "Service",
        qbActive: false,
        qbSyncToken: "1"
      },
      {
        qbItemId: "qb_active_1",
        qbItemName: "Alpha Service",
        normalizedName: "alpha service",
        qbItemType: "Service",
        qbActive: true,
        qbSyncToken: "3"
      }
    ]);
    fetchMock.mockResolvedValueOnce(jsonResponse({
      CompanyInfo: {
        CompanyName: "Evergreen Fire QBO"
      }
    }));

    const { getQuickBooksItemMappingSettings } = await import("../quickbooks");

    const result = await getQuickBooksItemMappingSettings(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" }
    );

    expect(result.availableItems).toEqual([
      {
        qbItemId: "qb_active_1",
        qbItemName: "Alpha Service",
        qbItemType: "Service",
        qbActive: true
      },
      {
        qbItemId: "qb_active_2",
        qbItemName: "Zeta Service",
        qbItemType: "Service",
        qbActive: true
      }
    ]);
    expect(result.rows).toEqual([
      expect.objectContaining({
        internalCode: "FE-NEW-2_5_LB_ABC",
        status: "unmapped"
      })
    ]);
  });
});
