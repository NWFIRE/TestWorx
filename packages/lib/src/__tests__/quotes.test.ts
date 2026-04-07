import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteStatus, QuoteSyncStatus, QuoteDeliveryStatus } from "@prisma/client";

const { prismaMock, sendQuoteEmailMock, syncQuoteToQuickBooksEstimateMock, createInspectionMock, saveQuickBooksItemMappingForCodeMock, clearQuickBooksItemMappingForCodeMock } = vi.hoisted(() => ({
  prismaMock: {
    quote: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    },
    quoteLineItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn()
    },
    tenant: {
      findUnique: vi.fn()
    },
    quickBooksItemMap: {
      findUnique: vi.fn()
    },
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn()
    },
    customerCompany: {
      findMany: vi.fn(),
      findFirst: vi.fn()
    },
    site: {
      findMany: vi.fn(),
      findFirst: vi.fn()
    },
    user: {
      findFirst: vi.fn()
    }
  },
  sendQuoteEmailMock: vi.fn(),
  syncQuoteToQuickBooksEstimateMock: vi.fn(),
  createInspectionMock: vi.fn(),
  saveQuickBooksItemMappingForCodeMock: vi.fn(),
  clearQuickBooksItemMappingForCodeMock: vi.fn()
}));

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

vi.mock("../account-email", () => ({
  sendQuoteEmail: sendQuoteEmailMock
}));

vi.mock("../quickbooks", () => ({
  resolveQuickBooksItemForBilling: vi.fn(),
  saveQuickBooksItemMappingForCode: saveQuickBooksItemMappingForCodeMock,
  clearQuickBooksItemMappingForCode: clearQuickBooksItemMappingForCodeMock,
  syncQuoteToQuickBooksEstimate: syncQuoteToQuickBooksEstimateMock,
  validateMappedQbItem: vi.fn()
}));

vi.mock("../scheduling", () => ({
  createInspection: createInspectionMock
}));

import {
  createQuote,
  getCustomerQuoteDetail,
  getQuoteFormOptions,
  getQuoteWorkspaceData,
  saveQuoteLineItemQuickBooksMapping,
  clearQuoteLineItemQuickBooksMapping
} from "../quotes";

describe("quotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.customerCompany.findMany.mockResolvedValue([]);
    prismaMock.customerCompany.findFirst.mockResolvedValue(null);
    prismaMock.site.findMany.mockResolvedValue([]);
    prismaMock.site.findFirst.mockResolvedValue(null);
    prismaMock.auditLog.create.mockResolvedValue(undefined);
    prismaMock.auditLog.findMany.mockResolvedValue([]);
    prismaMock.quoteLineItem.findMany.mockResolvedValue([]);
    prismaMock.tenant.findUnique.mockResolvedValue({ quickbooksRealmId: "realm_1" });
    prismaMock.quickBooksItemMap.findUnique.mockResolvedValue({
      qbItemId: "qb_item_1",
      qbActive: true
    });
    prismaMock.quoteLineItem.findFirst.mockResolvedValue({
      id: "line_1",
      quoteId: "quote_1",
      internalCode: "WET_FIRE_SPRINKLER_ANNUAL"
    });
    prismaMock.quoteLineItem.update.mockResolvedValue(undefined);
    saveQuickBooksItemMappingForCodeMock.mockResolvedValue(undefined);
    clearQuickBooksItemMappingForCodeMock.mockResolvedValue(undefined);
  });

  it("creates a draft quote with mapped qb item ids", async () => {
    prismaMock.quote.count.mockResolvedValue(3);
    prismaMock.quote.create.mockResolvedValue({
      id: "quote_1",
      quoteNumber: "Q-2026-0004"
    });

    const result = await createQuote(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" },
      {
        customerCompanyId: "customer_1",
        siteId: "site_1",
        contactName: "Alyssa Reed",
        recipientEmail: "alyssa@example.com",
        issuedAt: new Date("2026-04-06T12:00:00.000Z"),
        expiresAt: new Date("2026-04-30T12:00:00.000Z"),
        internalNotes: "Internal note",
        customerNotes: "Customer note",
        taxAmount: 10,
        lineItems: [
          {
            internalCode: "EXTINGUISHER_ANNUAL",
            title: "Fire extinguisher annual inspection",
            description: "Annual field inspection and tagging",
            quantity: 2,
            unitPrice: 55,
            discountAmount: 5,
            taxable: false,
            inspectionType: "fire_extinguisher",
            category: "inspection"
          }
        ]
      }
    );

    expect(result.id).toBe("quote_1");
    expect(prismaMock.quote.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: QuoteStatus.draft,
        syncStatus: QuoteSyncStatus.not_synced,
        deliveryStatus: QuoteDeliveryStatus.not_sent,
        subtotal: 105,
        total: 115,
        lineItems: {
          create: [
            expect.objectContaining({
              internalCode: "EXTINGUISHER_ANNUAL",
              qbItemId: "qb_item_1",
              total: 105
            })
          ]
        }
      })
    }));
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });

  it("marks a sent customer quote as viewed on first access", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      customerCompanyId: "customer_1"
    });
    prismaMock.quote.findFirst.mockResolvedValue({
      id: "quote_1",
      tenantId: "tenant_1",
      customerCompanyId: "customer_1",
      quoteNumber: "Q-2026-0001",
      status: QuoteStatus.sent,
      issuedAt: new Date("2026-04-06T12:00:00.000Z"),
      expiresAt: null,
      viewedAt: null,
      subtotal: 100,
      taxAmount: 0,
      total: 100,
      customerNotes: null,
      site: null,
      customerCompany: { name: "Acme", contactName: "Alyssa", billingEmail: "alyssa@example.com", phone: null },
      tenant: { name: "TradeWorx", branding: {}, billingEmail: null },
      lineItems: []
    });
    prismaMock.quote.update.mockResolvedValue(undefined);

    const result = await getCustomerQuoteDetail(
      { userId: "customer_user_1", role: "customer_user", tenantId: "tenant_1" },
      "quote_1"
    );

    expect(prismaMock.quote.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "quote_1" },
      data: expect.objectContaining({
        status: QuoteStatus.viewed
      })
    }));
    expect(result?.status).toBe(QuoteStatus.viewed);
    expect(result?.effectiveStatus).toBe(QuoteStatus.viewed);
  });

  it("treats overdue active quotes as expired in the workspace", async () => {
    prismaMock.quote.findMany.mockResolvedValue([
      {
        id: "quote_1",
        quoteNumber: "Q-2026-0001",
        status: QuoteStatus.sent,
        syncStatus: QuoteSyncStatus.not_synced,
        expiresAt: new Date("2026-04-01T12:00:00.000Z"),
        issuedAt: new Date("2026-03-20T12:00:00.000Z"),
        total: 100,
        recipientEmail: "alyssa@example.com",
        customerCompany: { name: "Acme" },
        site: { name: "Tower" },
        lineItems: []
      }
    ]);

    const results = await getQuoteWorkspaceData(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" },
      { status: "expired", syncStatus: "all", query: "" }
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.effectiveStatus).toBe(QuoteStatus.expired);
  });

  it("keeps the quotes workspace loading when a quote's customer or site record is missing", async () => {
    prismaMock.quote.findMany.mockResolvedValue([
      {
        id: "quote_2",
        tenantId: "tenant_1",
        customerCompanyId: "customer_missing",
        siteId: "site_missing",
        quoteNumber: "Q-2026-0002",
        status: QuoteStatus.draft,
        syncStatus: QuoteSyncStatus.not_synced,
        expiresAt: null,
        issuedAt: new Date("2026-04-07T12:00:00.000Z"),
        total: 125,
        recipientEmail: null,
        lineItems: []
      }
    ]);
    prismaMock.customerCompany.findMany.mockResolvedValue([]);
    prismaMock.site.findMany.mockResolvedValue([]);

    const results = await getQuoteWorkspaceData(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" },
      { status: "all", syncStatus: "all", query: "" }
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.customerCompany.name).toBe("Archived customer");
    expect(results[0]?.site?.name).toBe("Archived site");
  });

  it("includes wet fire sprinkler annual inspection in quote form options", async () => {
    const result = await getQuoteFormOptions(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" }
    );

    expect(result.catalog.some((item) => item.code === "WET_FIRE_SPRINKLER_ANNUAL")).toBe(true);
  });

  it("saves a quote line item QuickBooks mapping and persists the chosen qb item id", async () => {
    await saveQuoteLineItemQuickBooksMapping(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" },
      {
        quoteId: "quote_1",
        lineItemId: "line_1",
        internalCode: "WET_FIRE_SPRINKLER_ANNUAL",
        internalName: "Wet fire sprinkler annual inspection",
        qbItemId: "qb_item_77"
      }
    );

    expect(saveQuickBooksItemMappingForCodeMock).toHaveBeenCalledWith(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" },
      expect.objectContaining({
        internalCode: "WET_FIRE_SPRINKLER_ANNUAL",
        qbItemId: "qb_item_77"
      })
    );
    expect(prismaMock.quoteLineItem.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "line_1" },
      data: { qbItemId: "qb_item_77" }
    }));
  });

  it("clears a quote line item QuickBooks mapping and removes the stored line item qb id", async () => {
    await clearQuoteLineItemQuickBooksMapping(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" },
      {
        quoteId: "quote_1",
        lineItemId: "line_1",
        internalCode: "WET_FIRE_SPRINKLER_ANNUAL"
      }
    );

    expect(clearQuickBooksItemMappingForCodeMock).toHaveBeenCalledWith(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" },
      "WET_FIRE_SPRINKLER_ANNUAL"
    );
    expect(prismaMock.quoteLineItem.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "line_1" },
      data: { qbItemId: null }
    }));
  });
});
