import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetServerEnvForTests } from "../env";

const prismaMock = {
  tenant: {
    findUnique: vi.fn(),
    update: vi.fn()
  },
  tenantInvoiceSequence: {
    upsert: vi.fn()
  },
  customerCompany: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn()
  },
  billingPayerAccount: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn()
  },
  site: {
    findFirst: vi.fn()
  },
  serviceFeeRule: {
    findMany: vi.fn()
  },
  complianceReportingFeeRule: {
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
    findFirst: vi.fn(),
    update: vi.fn()
  },
  auditLog: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn()
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

function quickBooksDuplicateDocNumberResponse(docNumber: string) {
  return jsonResponse({
    Fault: {
      Error: [
        {
          Message: "Duplicate Document Number Error",
          Detail: `Duplicate Document Number Error : You must specify a different number. This number has already been used. DocNumber=${docNumber} is assigned to TxnType=Invoice with TxnId=17984`,
          code: "6140",
          element: ""
        }
      ],
      type: "ValidationFault"
    },
    time: "2026-04-29T11:55:16.670-07:00"
  }, { status: 400 });
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
  billingType: "standard" | "third_party";
  billToAccountId: string | null;
  billToName: string | null;
  deliverySnapshot: Record<string, unknown> | null;
}>) {
  return {
    id: "summary_1",
    tenantId: "tenant_1",
    inspectionId: "inspection_1",
    customerCompanyId: "customer_1",
    billingType: overrides?.billingType ?? "standard",
    billToAccountId: overrides?.billToAccountId ?? null,
    billToName: overrides?.billToName ?? null,
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
    deliverySnapshot: overrides?.deliverySnapshot ?? null,
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
    prismaMock.tenantInvoiceSequence.upsert.mockResolvedValue({ nextNumber: 1001 });
    prismaMock.auditLog.create.mockResolvedValue(undefined);
    prismaMock.auditLog.findFirst.mockResolvedValue(null);
    prismaMock.auditLog.findMany.mockResolvedValue([]);
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
    prismaMock.serviceFeeRule.findMany.mockResolvedValue([]);
    prismaMock.complianceReportingFeeRule.findFirst.mockResolvedValue(null);
    prismaMock.quoteLineItem.findMany.mockResolvedValue([]);
    prismaMock.billingPayerAccount.findUnique.mockResolvedValue(null);
    prismaMock.billingPayerAccount.findFirst.mockResolvedValue(null);
    prismaMock.billingPayerAccount.update.mockResolvedValue(undefined);
    prismaMock.inspectionBillingSummary.findMany.mockResolvedValue([]);
    prismaMock.quickBooksItemMap.upsert.mockResolvedValue(undefined);
    prismaMock.quickBooksItemMap.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      status: "invoiced",
      completedAt: new Date("2026-04-01T14:00:00.000Z"),
      archivedAt: null,
      customerCompany: { name: "Pinecrest Property Management" },
      site: {
        name: "Pinecrest Tower",
        addressLine1: "100 State St",
        addressLine2: null,
        city: "Chicago",
        state: "IL",
        postalCode: "60601"
      },
      assignedTechnician: null,
      technicianAssignments: [],
      tasks: [{ inspectionType: "fire_extinguisher" }],
      reports: [{ id: "report_1" }],
      deficiencies: []
    });
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
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW2026-1000" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW2026-1000" } }))
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
      invoiceNumber: "TW2026-1000",
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
        quickbooksInvoiceNumber: "TW2026-1000",
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
  }, 10000);

  it("uses linked catalog pricing when a persisted billing item is missing unit price", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.customerCompany.findUnique.mockResolvedValue({ quickbooksCustomerId: null });
    prismaMock.customerCompany.update.mockResolvedValue(undefined);
    prismaMock.site.findFirst.mockResolvedValue(null);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([]);
    prismaMock.quickBooksCatalogItem.findFirst
      .mockResolvedValueOnce({
        unitPrice: 33.5
      })
      .mockResolvedValueOnce(null);
    prismaMock.inspectionBillingSummary.findUnique.mockResolvedValue({
      ...buildBillingSummary(),
      items: [
        {
          id: "item_1",
          description: "Recharge (5 lb ABC)",
          quantity: 1,
          unitPrice: null,
          amount: null,
          unit: "ea",
          category: "material",
          code: "RECHARGE_5LB_ABC",
          linkedCatalogItemId: "catalog_recharge_5lb",
          linkedQuickBooksItemId: "mapped_item_1",
          linkedCatalogItemName: "Recharge - 5# ABC"
        }
      ]
    });
    prismaMock.inspectionBillingSummary.update.mockResolvedValue(undefined);
    prismaMock.auditLog.create.mockResolvedValue(undefined);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: {} }))
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "qbo_customer_1" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW2026-1000" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW2026-1000" } }))
      .mockResolvedValueOnce(jsonResponse({}));

    const { syncBillingSummaryToQuickBooks } = await import("../quickbooks");

    await syncBillingSummaryToQuickBooks(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1"
    );

    const createInvoiceBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body ?? "{}"));
    expect(createInvoiceBody.DocNumber).toBe("TW2026-1000");
    expect(createInvoiceBody.Line?.[0]?.SalesItemLineDetail?.UnitPrice).toBe(33.5);
  });

  it("groups identical inspection billing items into one QuickBooks invoice line with summed quantity", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.customerCompany.findUnique.mockResolvedValue({ quickbooksCustomerId: null });
    prismaMock.customerCompany.update.mockResolvedValue(undefined);
    prismaMock.site.findFirst.mockResolvedValue(null);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([]);
    prismaMock.inspectionBillingSummary.findUnique.mockResolvedValue({
      ...buildBillingSummary(),
      items: [
        {
          id: "item_1",
          description: "Annual Inspection - Fire Extinguisher",
          quantity: 1,
          unitPrice: 7.7,
          amount: 7.7,
          unit: "ea",
          category: "service",
          code: "FE-ANNUAL"
        },
        {
          id: "item_2",
          description: "Annual Inspection - Fire Extinguisher",
          quantity: 1,
          unitPrice: 7.7,
          amount: 7.7,
          unit: "ea",
          category: "service",
          code: "FE-ANNUAL"
        },
        {
          id: "item_3",
          description: "Annual Inspection - Fire Extinguisher",
          quantity: 5,
          unitPrice: 7.7,
          amount: 38.5,
          unit: "ea",
          category: "service",
          code: "FE-ANNUAL"
        },
        {
          id: "item_4",
          description: "New 2.5 ABC Fire Extinguisher",
          quantity: 1,
          unitPrice: 51.95,
          amount: 51.95,
          unit: "ea",
          category: "material",
          code: "FE-NEW-2_5_LB_ABC"
        }
      ]
    });
    prismaMock.inspectionBillingSummary.update.mockResolvedValue(undefined);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: {} }))
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "qbo_customer_1" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW2026-1000" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW2026-1000" } }))
      .mockResolvedValueOnce(jsonResponse({}));

    const { syncBillingSummaryToQuickBooks } = await import("../quickbooks");

    await syncBillingSummaryToQuickBooks(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1"
    );

    const createInvoiceBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body ?? "{}"));
    expect(createInvoiceBody.Line).toHaveLength(2);
    expect(createInvoiceBody.Line[0]).toEqual(expect.objectContaining({
      Amount: 53.9,
      Description: "Annual Inspection - Fire Extinguisher"
    }));
    expect(createInvoiceBody.Line[0].SalesItemLineDetail).toEqual(expect.objectContaining({
      Qty: 7,
      UnitPrice: 7.7
    }));
    expect(createInvoiceBody.Line[1]).toEqual(expect.objectContaining({
      Amount: 51.95,
      Description: "New 2.5 ABC Fire Extinguisher"
    }));
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
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW2026-1000" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW2026-1000" } }));

    const { syncBillingSummaryToQuickBooks } = await import("../quickbooks");

    const result = await syncBillingSummaryToQuickBooks(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1"
    );

    expect(result.quickbooksSendStatus).toBe("send_skipped");
    expect(result.quickbooksSendError).toMatch(/does not have a delivery email/i);
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

  it("routes third-party billing summaries through the payer QuickBooks customer", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.billingPayerAccount.findFirst
      .mockResolvedValueOnce({
        id: "payer_1",
        tenantId: "tenant_1",
        name: "Academy Fire",
        billingEmail: "ap@academy.test",
        quickbooksCustomerId: "qb_payer_1"
      })
      .mockResolvedValueOnce({
        id: "payer_1",
        tenantId: "tenant_1",
        name: "Academy Fire",
        billingEmail: "ap@academy.test",
        quickbooksCustomerId: "qb_payer_1"
      });
    prismaMock.customerCompany.findUnique.mockResolvedValue({ quickbooksCustomerId: "qb_customer_1" });
    prismaMock.site.findFirst.mockResolvedValue(null);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([]);
    prismaMock.inspectionBillingSummary.findUnique.mockResolvedValue(
      buildBillingSummary({
        billingType: "third_party",
        billToAccountId: "payer_1",
        billToName: "Academy Fire",
        deliverySnapshot: { method: "payer_email", recipientEmail: "ap@academy.test" }
      })
    );
    prismaMock.inspectionBillingSummary.update.mockResolvedValue(undefined);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "qb_payer_1", DisplayName: "Academy Fire", SyncToken: "0" } }))
      .mockResolvedValueOnce(jsonResponse({ Customer: { Id: "qb_payer_1", DisplayName: "Academy Fire" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW2026-1000" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW2026-1000" } }))
      .mockResolvedValueOnce(jsonResponse({}));

    const { syncBillingSummaryToQuickBooks } = await import("../quickbooks");

    const result = await syncBillingSummaryToQuickBooks(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1"
    );

    expect(result.quickbooksSentTo).toBe("ap@academy.test");
    expect(prismaMock.billingPayerAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: "payer_1",
        tenantId: "tenant_1"
      }
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
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW2026-1000" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW2026-1000" } }))
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
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_missing", DocNumber: "TW2026-1000" } }))
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
      taxable: true,
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
          SalesTaxCodeRef: { value: "TAX" },
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
        taxable: true,
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
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain("\"SalesTaxCodeRef\":{\"value\":\"TAX\"}");
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
      taxable: false,
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
          SalesTaxCodeRef: { value: "TAX" },
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
          SalesTaxCodeRef: { value: "NON" },
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
        taxable: false,
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
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain("\"SalesTaxCodeRef\":{\"value\":\"NON\"}");
    expect(result).toEqual(expect.objectContaining({
      id: "catalog_1",
      quickbooksItemId: "qbo_item_9",
      active: false
    }));
  });

  it("creates a direct QuickBooks invoice from synced catalog items", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.customerCompany.findFirst.mockResolvedValue({
      id: "customer_1",
      name: "Walk-In Counter Sale",
      contactName: null,
      billingEmail: "billing@example.com",
      phone: "555-1212",
      billingAddressLine1: null,
      billingAddressLine2: null,
      billingCity: null,
      billingState: null,
      billingPostalCode: null,
      billingCountry: null,
      serviceAddressLine1: null,
      serviceAddressLine2: null,
      serviceCity: null,
      serviceState: null,
      servicePostalCode: null,
      serviceCountry: null,
      notes: null
    });
    prismaMock.customerCompany.findUnique.mockResolvedValue({
      quickbooksCustomerId: "qb_customer_1"
    });
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([
      {
        id: "catalog_1",
        quickbooksItemId: "qb_item_1",
        name: "Fire Extinguisher Recharge",
        taxable: true
      }
    ]);
    prismaMock.auditLog.create.mockResolvedValue(undefined);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        Customer: {
          Id: "qb_customer_1",
          SyncToken: "2",
          DisplayName: "Walk-In Counter Sale",
          PrimaryEmailAddr: { Address: "billing@example.com" }
        }
      }))
      .mockResolvedValueOnce(jsonResponse({
        Customer: {
          Id: "qb_customer_1",
          SyncToken: "3",
          DisplayName: "Walk-In Counter Sale",
          PrimaryEmailAddr: { Address: "billing@example.com" }
        }
      }))
      .mockResolvedValueOnce(jsonResponse({
        Invoice: {
          Id: "invoice_direct_1",
          DocNumber: "TW2026-1000"
        }
      }))
      .mockResolvedValueOnce(jsonResponse({
        Invoice: {
          Id: "invoice_direct_1",
          DocNumber: "TW2026-1000"
        }
      }));

    const { createDirectQuickBooksInvoice } = await import("../quickbooks");

    const result = await createDirectQuickBooksInvoice(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        customerCompanyId: "customer_1",
        walkInMode: true,
        issueDate: "2026-04-10",
        dueDate: "2026-05-10",
        memo: "Counter sale",
        sendEmail: false,
        lineItems: [
          {
            catalogItemId: "catalog_1",
            description: "Fire Extinguisher Recharge",
            quantity: 2,
            unitPrice: 85,
            taxable: true
          },
          {
            catalogItemId: "catalog_1",
            description: "Fire Extinguisher Recharge",
            quantity: 3,
            unitPrice: 85,
            taxable: true
          }
        ]
      }
    );

    const createInvoiceBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body ?? "{}"));
    expect(createInvoiceBody).toHaveProperty("DocNumber", "TW2026-1000");
    expect(prismaMock.tenantInvoiceSequence.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId_year: {
          tenantId: "tenant_1",
          year: 2026
        }
      }
    }));
    expect(fetchMock.mock.calls[2]?.[1]?.body).toContain("\"TaxCodeRef\":{\"value\":\"TAX\"}");
    expect(createInvoiceBody.Line).toHaveLength(1);
    expect(createInvoiceBody.Line[0]).toEqual(expect.objectContaining({
      Amount: 425,
      Description: "Fire Extinguisher Recharge"
    }));
    expect(createInvoiceBody.Line[0].SalesItemLineDetail).toEqual(expect.objectContaining({
      Qty: 5,
      UnitPrice: 85
    }));
    expect(result).toEqual(expect.objectContaining({
      invoiceId: "invoice_direct_1",
      invoiceNumber: "TW2026-1000"
    }));
  });

  it("falls back to existing invoice records when the invoice sequence migration is pending", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.tenantInvoiceSequence.upsert.mockRejectedValueOnce(Object.assign(
      new Error("The table `public.TenantInvoiceSequence` does not exist in the current database."),
      {
        code: "P2021",
        meta: { table: "public.TenantInvoiceSequence" }
      }
    ));
    prismaMock.inspectionBillingSummary.findMany.mockResolvedValueOnce([
      { quickbooksInvoiceNumber: "TW2026-1003" }
    ]);
    prismaMock.auditLog.findMany.mockResolvedValueOnce([
      { metadata: { invoiceNumber: "TW2026-1007" } }
    ]);
    prismaMock.customerCompany.findFirst.mockResolvedValue({
      id: "customer_1",
      name: "Orr Energy Services",
      contactName: null,
      billingEmail: "ap@orr.example",
      phone: "555-1212",
      billingAddressLine1: null,
      billingAddressLine2: null,
      billingCity: null,
      billingState: null,
      billingPostalCode: null,
      billingCountry: null,
      serviceAddressLine1: null,
      serviceAddressLine2: null,
      serviceCity: null,
      serviceState: null,
      servicePostalCode: null,
      serviceCountry: null,
      notes: null
    });
    prismaMock.customerCompany.findUnique.mockResolvedValue({
      quickbooksCustomerId: "qb_customer_1"
    });
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([
      {
        id: "catalog_1",
        quickbooksItemId: "qb_item_1",
        name: "Fire Extinguisher Recharge",
        taxable: true
      }
    ]);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        Customer: {
          Id: "qb_customer_1",
          SyncToken: "2",
          DisplayName: "Orr Energy Services",
          PrimaryEmailAddr: { Address: "ap@orr.example" }
        }
      }))
      .mockResolvedValueOnce(jsonResponse({
        Customer: {
          Id: "qb_customer_1",
          SyncToken: "3",
          DisplayName: "Orr Energy Services",
          PrimaryEmailAddr: { Address: "ap@orr.example" }
        }
      }))
      .mockResolvedValueOnce(jsonResponse({
        Invoice: {
          Id: "invoice_direct_3",
          DocNumber: "TW2026-1008"
        }
      }))
      .mockResolvedValueOnce(jsonResponse({
        Invoice: {
          Id: "invoice_direct_3",
          DocNumber: "TW2026-1008"
        }
      }));

    const { createDirectQuickBooksInvoice } = await import("../quickbooks");

    const result = await createDirectQuickBooksInvoice(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        customerCompanyId: "customer_1",
        walkInMode: true,
        issueDate: "2026-04-27",
        dueDate: "2026-05-27",
        memo: "Counter sale",
        sendEmail: false,
        lineItems: [
          {
            catalogItemId: "catalog_1",
            description: "Fire Extinguisher Recharge",
            quantity: 1,
            unitPrice: 85,
            taxable: true
          }
        ]
      }
    );

    const createInvoiceBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body ?? "{}"));
    expect(createInvoiceBody.DocNumber).toBe("TW2026-1008");
    expect(result.invoiceNumber).toBe("TW2026-1008");
  });

  it("advances to the next TradeWorx invoice number when QuickBooks reports a duplicate document number", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(buildTenantConnection());
    prismaMock.tenantInvoiceSequence.upsert
      .mockResolvedValueOnce({ nextNumber: 1004 })
      .mockResolvedValueOnce({ nextNumber: 1005 })
      .mockResolvedValueOnce({ nextNumber: 1006 })
      .mockResolvedValueOnce({ nextNumber: 1007 })
      .mockResolvedValueOnce({ nextNumber: 1008 })
      .mockResolvedValueOnce({ nextNumber: 1009 });
    prismaMock.customerCompany.findFirst.mockResolvedValue({
      id: "customer_1",
      name: "Orr Energy Services",
      contactName: null,
      billingEmail: "ap@orr.example",
      phone: "555-1212",
      billingAddressLine1: null,
      billingAddressLine2: null,
      billingCity: null,
      billingState: null,
      billingPostalCode: null,
      billingCountry: null,
      serviceAddressLine1: null,
      serviceAddressLine2: null,
      serviceCity: null,
      serviceState: null,
      servicePostalCode: null,
      serviceCountry: null,
      notes: null
    });
    prismaMock.customerCompany.findUnique.mockResolvedValue({
      quickbooksCustomerId: "qb_customer_1"
    });
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([
      {
        id: "catalog_1",
        quickbooksItemId: "qb_item_1",
        name: "Fire Extinguisher Recharge",
        taxable: true
      }
    ]);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        Customer: {
          Id: "qb_customer_1",
          SyncToken: "2",
          DisplayName: "Orr Energy Services",
          PrimaryEmailAddr: { Address: "ap@orr.example" }
        }
      }))
      .mockResolvedValueOnce(jsonResponse({
        Customer: {
          Id: "qb_customer_1",
          SyncToken: "3",
          DisplayName: "Orr Energy Services",
          PrimaryEmailAddr: { Address: "ap@orr.example" }
        }
      }))
      .mockResolvedValueOnce(quickBooksDuplicateDocNumberResponse("TW2026-1003"))
      .mockResolvedValueOnce(quickBooksDuplicateDocNumberResponse("TW2026-1004"))
      .mockResolvedValueOnce(quickBooksDuplicateDocNumberResponse("TW2026-1005"))
      .mockResolvedValueOnce(quickBooksDuplicateDocNumberResponse("TW2026-1006"))
      .mockResolvedValueOnce(quickBooksDuplicateDocNumberResponse("TW2026-1007"))
      .mockResolvedValueOnce(jsonResponse({
        Invoice: {
          Id: "invoice_direct_4",
          DocNumber: "TW2026-1008"
        }
      }))
      .mockResolvedValueOnce(jsonResponse({
        Invoice: {
          Id: "invoice_direct_4",
          DocNumber: "TW2026-1008"
        }
      }));

    const { createDirectQuickBooksInvoice } = await import("../quickbooks");

    const result = await createDirectQuickBooksInvoice(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        customerCompanyId: "customer_1",
        walkInMode: true,
        issueDate: "2026-04-29",
        dueDate: "2026-05-29",
        memo: "Counter sale",
        sendEmail: false,
        lineItems: [
          {
            catalogItemId: "catalog_1",
            description: "Fire Extinguisher Recharge",
            quantity: 1,
            unitPrice: 85,
            taxable: true
          }
        ]
      }
    );

    const attemptedDocNumbers = fetchMock.mock.calls
      .slice(2, 8)
      .map((call) => JSON.parse(String(call[1]?.body ?? "{}")).DocNumber);
    expect(attemptedDocNumbers).toEqual([
      "TW2026-1003",
      "TW2026-1004",
      "TW2026-1005",
      "TW2026-1006",
      "TW2026-1007",
      "TW2026-1008"
    ]);
    expect(prismaMock.tenantInvoiceSequence.upsert).toHaveBeenCalledTimes(6);
    expect(result.invoiceNumber).toBe("TW2026-1008");
  });

  it("applies service and compliance fee rules for customer invoices", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      ...buildTenantConnection(),
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 20
    });
    prismaMock.customerCompany.findFirst.mockResolvedValue({
      id: "customer_1",
      name: "Klemme Construction",
      contactName: "Brett Klemme",
      billingEmail: "billing@klemme.example",
      phone: "580-555-0199",
      billingAddressLine1: "100 Main St",
      billingAddressLine2: null,
      billingCity: "Tulsa",
      billingState: "OK",
      billingPostalCode: "74103",
      billingCountry: null,
      serviceAddressLine1: "100 Main St",
      serviceAddressLine2: null,
      serviceCity: "Tulsa",
      serviceState: "OK",
      servicePostalCode: "74103",
      serviceCountry: null,
      notes: null
    });
    prismaMock.customerCompany.findUnique.mockResolvedValue({
      quickbooksCustomerId: "qb_customer_1"
    });
    prismaMock.serviceFeeRule.findMany.mockResolvedValue([
      {
        id: "service_rule_1",
        customerCompanyId: "customer_1",
        siteId: null,
        city: null,
        state: null,
        zipCode: null,
        feeCode: "SERVICE_FEE_LOCAL",
        unitPrice: 95,
        priority: 100
      }
    ]);
    prismaMock.complianceReportingFeeRule.findFirst.mockResolvedValue({
      id: "compliance_rule_1",
      city: "Tulsa",
      county: null,
      state: "OK",
      feeAmount: 18
    });
    prismaMock.quickBooksItemMap.findUnique.mockImplementation(async (input: {
      where: { tenantId_integrationId_internalCode: { internalCode: string } };
    }) => {
      const code = input.where.tenantId_integrationId_internalCode.internalCode;
      if (code === "SERVICE_FEE_LOCAL") {
        return {
          id: "mapping_service_fee",
          tenantId: "tenant_1",
          integrationId: "realm_1",
          internalCode: "SERVICE_FEE_LOCAL",
          internalName: "Service Fee",
          qbItemId: "qb_fee_item",
          qbItemName: "Service Fee",
          qbItemType: "Service",
          qbSyncToken: "1",
          qbActive: true,
          matchSource: "manual"
        };
      }
      if (code === "COMPLIANCE_REPORTING_FEE_KITCHEN_SUPPRESSION") {
        return {
          id: "mapping_compliance_fee",
          tenantId: "tenant_1",
          integrationId: "realm_1",
          internalCode: "COMPLIANCE_REPORTING_FEE_KITCHEN_SUPPRESSION",
          internalName: "Compliance Reporting Fee",
          qbItemId: "qb_compliance_item",
          qbItemName: "Compliance Reporting Fee",
          qbItemType: "Service",
          qbSyncToken: "1",
          qbActive: true,
          matchSource: "manual"
        };
      }
      return null;
    });
    prismaMock.quickBooksItemCache.findUnique.mockImplementation(async (input: {
      where: { tenantId_integrationId_qbItemId: { qbItemId: string } };
    }) => ({
      id: `cache_${input.where.tenantId_integrationId_qbItemId.qbItemId}`,
      tenantId: "tenant_1",
      integrationId: "realm_1",
      qbItemId: input.where.tenantId_integrationId_qbItemId.qbItemId,
      qbItemName: input.where.tenantId_integrationId_qbItemId.qbItemId === "qb_fee_item" ? "Service Fee" : "Compliance Reporting Fee",
      normalizedName: "fee",
      qbItemType: "Service",
      qbActive: true,
      qbSyncToken: "1",
      rawJson: {}
    }));
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([
      {
        id: "catalog_1",
        quickbooksItemId: "qb_item_1",
        name: "Kitchen suppression inspection",
        taxable: true
      }
    ]);
    prismaMock.quickBooksCatalogItem.findFirst.mockImplementation(async (input: {
      where: { quickbooksItemId: string };
    }) => {
      if (input.where.quickbooksItemId === "qb_fee_item") {
        return { taxable: false };
      }
      if (input.where.quickbooksItemId === "qb_compliance_item") {
        return { taxable: false };
      }
      return null;
    });

    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        Customer: {
          Id: "qb_customer_1",
          SyncToken: "2",
          DisplayName: "Klemme Construction",
          PrimaryEmailAddr: { Address: "billing@klemme.example" }
        }
      }))
      .mockResolvedValueOnce(jsonResponse({
        Customer: {
          Id: "qb_customer_1",
          SyncToken: "3",
          DisplayName: "Klemme Construction",
          PrimaryEmailAddr: { Address: "billing@klemme.example" }
        }
      }))
      .mockResolvedValueOnce(jsonResponse({
        Invoice: {
          Id: "invoice_direct_2",
          DocNumber: "TW2027-1000"
        }
      }))
      .mockResolvedValueOnce(jsonResponse({
        Invoice: {
          Id: "invoice_direct_2",
          DocNumber: "TW2027-1000"
        }
      }));

    const { createDirectQuickBooksInvoice } = await import("../quickbooks");

    await createDirectQuickBooksInvoice(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        customerCompanyId: "customer_1",
        walkInMode: false,
        proposalType: "kitchen_suppression",
        issueDate: "2027-04-10",
        dueDate: "2027-05-10",
        memo: "Kitchen system service",
        sendEmail: false,
        lineItems: [
          {
            catalogItemId: "catalog_1",
            description: "Kitchen suppression inspection",
            quantity: 1,
            unitPrice: 4187.08,
            taxable: true
          }
        ]
      }
    );

    const createInvoiceBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body ?? "{}"));
    expect(createInvoiceBody.DocNumber).toBe("TW2027-1000");
    expect(createInvoiceBody.Line).toHaveLength(3);
    expect(prismaMock.tenantInvoiceSequence.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId_year: {
          tenantId: "tenant_1",
          year: 2027
        }
      }
    }));
    expect(createInvoiceBody.Line.map((line: { Description: string }) => line.Description)).toEqual([
      "Kitchen suppression inspection",
      "Service Fee",
      "Compliance Reporting Fee"
    ]);
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
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW2026-1000" } }))
      .mockResolvedValueOnce(jsonResponse({ Invoice: { Id: "invoice_1", DocNumber: "TW2026-1000" } }));

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
