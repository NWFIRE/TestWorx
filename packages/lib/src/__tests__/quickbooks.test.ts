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
    createMany: vi.fn()
  },
  inspectionBillingSummary: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn()
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
  quickbooksInvoiceId: string | null;
  quickbooksConnectionMode: string | null;
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
    quickbooksInvoiceId: overrides?.quickbooksInvoiceId ?? null,
    quickbooksConnectionMode: overrides?.quickbooksConnectionMode ?? null,
    quickbooksInvoiceNumber: null,
    customerCompany: {
      id: "customer_1",
      name: "Pinecrest Property Management",
      billingEmail: "billing@pinecrest.example",
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
    resetServerEnvForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetServerEnvForTests();
  });

  it("marks billing summaries synced only after the created invoice is verified", async () => {
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
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: { Account: [{ Id: "income_1" }] } }))
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: {} }))
      .mockResolvedValueOnce(jsonResponse({ Item: { Id: "item_1" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW-TION_1" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW-TION_1" } }));

    const { syncBillingSummaryToQuickBooks } = await import("../quickbooks");

    const result = await syncBillingSummaryToQuickBooks(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1"
    );

    expect(result).toEqual({
      summaryId: "summary_1",
      inspectionId: "inspection_1",
      invoiceId: "invoice_1",
      invoiceNumber: "TW-TION_1"
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
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: { Account: [{ Id: "income_1" }] } }))
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: {} }))
      .mockResolvedValueOnce(jsonResponse({ Item: { Id: "item_1" } }))
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
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: { Account: [{ Id: "income_1" }] } }))
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: {} }))
      .mockResolvedValueOnce(jsonResponse({ Item: { Id: "item_1" } }))
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
    expect(fetchMock).toHaveBeenCalledTimes(7);
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

  it("prefers imported QuickBooks catalog items before creating new service items", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.customerCompany.findUnique.mockResolvedValue({ quickbooksCustomerId: "qbo_customer_1" });
    prismaMock.customerCompany.update.mockResolvedValue(undefined);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([
      { quickbooksItemId: "imported_item_1", name: "FE-ANNUAL" }
    ]);
    prismaMock.inspectionBillingSummary.findUnique.mockResolvedValue(buildBillingSummary());
    prismaMock.inspectionBillingSummary.update.mockResolvedValue(undefined);
    prismaMock.auditLog.create.mockResolvedValue(undefined);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "qbo_customer_1", DisplayName: "Pinecrest Property Management", SyncToken: "0" } }))
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "qbo_customer_1", DisplayName: "Pinecrest Property Management" } }))
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: { Account: [{ Id: "income_1" }] } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW-TION_1" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW-TION_1" } }));

    const { syncBillingSummaryToQuickBooks } = await import("../quickbooks");

    await syncBillingSummaryToQuickBooks(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1"
    );

    expect(fetchMock).toHaveBeenCalledTimes(5);
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
            PrimaryPhone: { FreeFormNumber: "312-555-0101" }
          },
          {
            Id: "qbo_customer_2",
            DisplayName: "Pinecrest Property Management",
            CompanyName: "Pinecrest Property Management"
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
        quickbooksCustomerId: "qbo_customer_1"
      })
    });
    expect(prismaMock.customerCompany.update).toHaveBeenCalledWith({
      where: { id: "customer_existing" },
      data: expect.objectContaining({
        name: "Pinecrest Property Management",
        quickbooksCustomerId: "qbo_customer_2"
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
  });

  it("reconciles QuickBooks customers in both directions for the tenant", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.customerCompany.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "customer_existing", contactName: null, billingEmail: null, phone: null })
      .mockResolvedValueOnce({
        id: "customer_existing",
        name: "Pinecrest Property Management",
        contactName: "Alyssa Reed",
        billingEmail: "billing@pinecrest.example",
        phone: "312-555-0110",
        quickbooksCustomerId: "qbo_customer_2"
      })
      .mockResolvedValueOnce({
        id: "customer_new",
        name: "Acme Tower",
        contactName: null,
        billingEmail: "billing@acme.test",
        phone: "312-555-0101",
        quickbooksCustomerId: "qbo_customer_1"
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
});
