import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteDeliveryStatus, QuoteStatus, QuoteSyncStatus } from "@prisma/client";
import { addDays } from "date-fns";

const { prismaMock, sendQuoteEmailMock, sendQuoteReminderEmailMock, syncQuoteToQuickBooksEstimateMock, createInspectionMock, saveQuickBooksItemMappingForCodeMock, clearQuickBooksItemMappingForCodeMock, generateQuotePdfMock } = vi.hoisted(() => ({
  prismaMock: {
    quote: {
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    },
    quoteLineItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn()
    },
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    quickBooksItemMap: {
      findUnique: vi.fn()
    },
    quickBooksCatalogItem: {
      findMany: vi.fn()
    },
    quoteReminderDispatch: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
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
  sendQuoteReminderEmailMock: vi.fn(),
  syncQuoteToQuickBooksEstimateMock: vi.fn(),
  createInspectionMock: vi.fn(),
  saveQuickBooksItemMappingForCodeMock: vi.fn(),
  clearQuickBooksItemMappingForCodeMock: vi.fn(),
  generateQuotePdfMock: vi.fn()
}));

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

vi.mock("../account-email", () => ({
  sendQuoteEmail: sendQuoteEmailMock,
  sendQuoteReminderEmail: sendQuoteReminderEmailMock
}));

vi.mock("../env", () => ({
  getServerEnv: () => ({
    APP_URL: "https://tradeworx.example"
  })
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

vi.mock("../quote-pdf", () => ({
  generateQuotePdf: generateQuotePdfMock
}));

import {
  approveQuoteByAccessToken,
  convertQuoteToInspection,
  createQuote,
  deleteQuote,
  getHostedQuoteDetailByToken,
  getCustomerQuoteDetail,
  getQuoteFormOptions,
  getQuoteWorkspaceData,
  runQuoteReminderSweep,
  saveQuoteLineItemQuickBooksMapping,
  sendQuoteReminderNow,
  clearQuoteLineItemQuickBooksMapping,
  sendQuote,
  updateQuoteReminderControl,
  updateQuoteReminderSettings
} from "../quotes";

describe("quotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.customerCompany.findMany.mockResolvedValue([]);
    prismaMock.customerCompany.findFirst.mockResolvedValue(null);
    prismaMock.site.findMany.mockResolvedValue([]);
    prismaMock.site.findFirst.mockResolvedValue(null);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([]);
    prismaMock.auditLog.create.mockResolvedValue(undefined);
    prismaMock.auditLog.findMany.mockResolvedValue([]);
    prismaMock.quoteLineItem.findMany.mockResolvedValue([]);
    prismaMock.quote.findUnique.mockResolvedValue({
      id: "quote_1",
      tenantId: "tenant_1",
      status: QuoteStatus.draft,
      sentAt: null,
      firstViewedAt: null,
      expiresAt: null,
      approvedAt: null,
      declinedAt: null,
      convertedAt: null,
      remindersEnabled: true,
      remindersPausedAt: null,
      reminderCount: 0
    });
    prismaMock.quote.findMany.mockResolvedValue([]);
    prismaMock.quote.delete.mockResolvedValue(undefined);
    prismaMock.quoteReminderDispatch.findMany.mockResolvedValue([]);
    prismaMock.quoteReminderDispatch.findFirst.mockResolvedValue(null);
    prismaMock.quoteReminderDispatch.create.mockResolvedValue({
      id: "dispatch_1",
      status: "pending"
    });
    prismaMock.quoteReminderDispatch.update.mockResolvedValue(undefined);
    prismaMock.tenant.findUnique.mockResolvedValue({ quickbooksRealmId: "realm_1", quoteReminderSettings: null });
    prismaMock.tenant.update.mockResolvedValue(undefined);
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
    generateQuotePdfMock.mockResolvedValue(new Uint8Array([1, 2, 3]));
    sendQuoteReminderEmailMock.mockResolvedValue({
      sent: true,
      provider: "resend",
      messageId: "reminder_msg_1",
      error: null,
      reason: "sent"
    });
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

  it("persists the direct QuickBooks item id when a quote line is selected from the imported catalog", async () => {
    prismaMock.quote.count.mockResolvedValue(4);
    prismaMock.quote.create.mockResolvedValue({
      id: "quote_2",
      quoteNumber: "Q-2026-0005"
    });

    const result = await createQuote(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" },
      {
        customerCompanyId: "customer_1",
        siteId: "site_1",
        contactName: "Alyssa Reed",
        recipientEmail: "alyssa@example.com",
        issuedAt: new Date("2026-04-06T12:00:00.000Z"),
        expiresAt: null,
        internalNotes: null,
        customerNotes: null,
        taxAmount: 0,
        lineItems: [
          {
            internalCode: "QBO_ITEM:qb_catalog_9",
            title: "Kitchen System Recharge",
            description: "QuickBooks Service • SKU KS-RECHARGE",
            quantity: 1,
            unitPrice: 185,
            discountAmount: 0,
            taxable: false,
            inspectionType: null,
            category: "service"
          }
        ]
      }
    );

    expect(result.id).toBe("quote_2");
    expect(prismaMock.quote.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lineItems: {
          create: [
            expect.objectContaining({
              internalCode: "QBO_ITEM:qb_catalog_9",
              qbItemId: "qb_catalog_9",
              title: "Kitchen System Recharge"
            })
          ]
        }
      })
    }));
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

  it("includes wet fire sprinkler annual inspection and imported QuickBooks catalog items in quote form options", async () => {
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([
      {
        quickbooksItemId: "qb_service_1",
        name: "Kitchen System Recharge",
        sku: "KS-RECHARGE",
        itemType: "Service",
        unitPrice: 185
      }
    ]);

    const result = await getQuoteFormOptions(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" }
    );

    expect(result.catalog.some((item) => item.code === "WET_FIRE_SPRINKLER_ANNUAL")).toBe(true);
    expect(result.catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "QBO_ITEM:qb_service_1",
          title: "Kitchen System Recharge",
          source: "quickbooks",
          quickbooksItemId: "qb_service_1",
          unitPrice: 185
        })
      ])
    );
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

  it("sends a quote using a hosted access link and increments resend metadata", async () => {
    prismaMock.quote.findFirst
      .mockResolvedValueOnce({
        id: "quote_1",
        tenantId: "tenant_1",
        customerCompanyId: "customer_1",
        siteId: "site_1",
        contactName: "Alyssa Reed",
        recipientEmail: "alyssa@example.com",
        quoteNumber: "Q-2026-0005",
        status: QuoteStatus.sent,
        syncStatus: QuoteSyncStatus.not_synced,
        deliveryStatus: QuoteDeliveryStatus.not_sent,
        sentAt: new Date("2026-04-06T12:00:00.000Z"),
        expiresAt: new Date("2026-05-01T12:00:00.000Z"),
        quoteAccessToken: "token_123",
        quoteAccessTokenRevokedAt: null,
        quoteAccessTokenExpiresAt: new Date("2026-05-01T23:59:59.000Z"),
        tenant: { name: "TradeWorx", branding: {}, billingEmail: "office@example.com" },
        lineItems: [],
        subtotal: 100,
        taxAmount: 0,
        total: 100,
        customerNotes: null
      })
      .mockResolvedValueOnce({
        id: "quote_1",
        tenantId: "tenant_1",
        customerCompanyId: "customer_1",
        siteId: "site_1",
        quoteNumber: "Q-2026-0005",
        recipientEmail: "alyssa@example.com",
        issuedAt: new Date("2026-04-06T12:00:00.000Z"),
        expiresAt: new Date("2026-05-01T12:00:00.000Z"),
        status: QuoteStatus.sent,
        customerNotes: null,
        subtotal: 100,
        taxAmount: 0,
        total: 100,
        lineItems: [],
        tenant: { name: "TradeWorx", branding: {}, billingEmail: "office@example.com" }
      });
    prismaMock.customerCompany.findFirst.mockResolvedValue({
      id: "customer_1",
      name: "Acme",
      contactName: "Alyssa Reed",
      billingEmail: "alyssa@example.com",
      phone: null
    });
    prismaMock.site.findFirst.mockResolvedValue({
      id: "site_1",
      name: "Main campus",
      addressLine1: "123 Main",
      addressLine2: null,
      city: "Austin",
      state: "TX",
      postalCode: "78701"
    });
    prismaMock.quote.update.mockResolvedValue(undefined);
    sendQuoteEmailMock.mockResolvedValue({
      sent: true,
      provider: "resend",
      messageId: "msg_1",
      error: null,
      reason: "sent"
    });

    await sendQuote(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" },
      "quote_1",
      { recipientEmail: "alyssa@example.com" }
    );

    expect(sendQuoteEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      quoteUrl: "https://tradeworx.example/quote/token_123",
      expiresAt: new Date("2026-05-01T12:00:00.000Z")
    }));
    expect(prismaMock.quote.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "quote_1" },
      data: expect.objectContaining({
        lastSentAt: expect.any(Date),
        resendCount: { increment: 1 },
        quoteAccessTokenSentToEmail: "alyssa@example.com"
      })
    }));
  });

  it("records hosted quote views and moves sent quotes into viewed", async () => {
    prismaMock.quote.findFirst.mockResolvedValue({
      id: "quote_1",
      tenantId: "tenant_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      quoteNumber: "Q-2026-0008",
      contactName: "Alyssa Reed",
      recipientEmail: "alyssa@example.com",
      status: QuoteStatus.sent,
      issuedAt: new Date("2026-04-06T12:00:00.000Z"),
      expiresAt: null,
      viewedAt: null,
      firstViewedAt: null,
      lastViewedAt: null,
      viewCount: 0,
      quoteAccessToken: "token_abc",
      quoteAccessTokenRevokedAt: null,
      quoteAccessTokenExpiresAt: addDays(new Date(), 10),
      quoteAccessTokenSentToEmail: "alyssa@example.com",
      subtotal: 100,
      taxAmount: 0,
      total: 100,
      customerNotes: null,
      customerCompany: { name: "Acme", contactName: "Alyssa", billingEmail: "alyssa@example.com", phone: null },
      site: { name: "Main campus", addressLine1: "123 Main", addressLine2: null, city: "Austin", state: "TX", postalCode: "78701" },
      tenant: { id: "tenant_1", name: "TradeWorx", branding: {}, billingEmail: "office@example.com" },
      lineItems: []
    });
    prismaMock.quote.update.mockResolvedValue(undefined);

    const result = await getHostedQuoteDetailByToken("token_abc");

    expect(prismaMock.quote.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "quote_1" },
      data: expect.objectContaining({
        status: QuoteStatus.viewed,
        viewCount: { increment: 1 }
      })
    }));
    expect(result.quote?.status).toBe(QuoteStatus.viewed);
    expect(result.quote?.viewCount).toBe(1);
  });

  it("approves a quote through the hosted access token without duplicating approval", async () => {
    prismaMock.quote.findFirst.mockResolvedValue({
      id: "quote_1",
      tenantId: "tenant_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      quoteNumber: "Q-2026-0009",
      contactName: "Alyssa Reed",
      recipientEmail: "alyssa@example.com",
      status: QuoteStatus.viewed,
      issuedAt: new Date("2026-04-06T12:00:00.000Z"),
      expiresAt: null,
      quoteAccessToken: "token_approve",
      quoteAccessTokenRevokedAt: null,
      quoteAccessTokenExpiresAt: addDays(new Date(), 5),
      quoteAccessTokenSentToEmail: "alyssa@example.com",
      approvedAt: null,
      declinedAt: null,
      subtotal: 100,
      taxAmount: 0,
      total: 100,
      customerNotes: null,
      customerCompany: { name: "Acme", contactName: "Alyssa", billingEmail: "alyssa@example.com", phone: null },
      site: { name: "Main campus", addressLine1: "123 Main", addressLine2: null, city: "Austin", state: "TX", postalCode: "78701" },
      tenant: { id: "tenant_1", name: "TradeWorx", branding: {}, billingEmail: "office@example.com" },
      lineItems: []
    });
    prismaMock.quote.update.mockResolvedValue({
      id: "quote_1",
      tenantId: "tenant_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      quoteNumber: "Q-2026-0009",
      contactName: "Alyssa Reed",
      recipientEmail: "alyssa@example.com",
      status: QuoteStatus.approved,
      issuedAt: new Date("2026-04-06T12:00:00.000Z"),
      expiresAt: null,
      quoteAccessToken: "token_approve",
      quoteAccessTokenRevokedAt: null,
      quoteAccessTokenExpiresAt: addDays(new Date(), 5),
      quoteAccessTokenSentToEmail: "alyssa@example.com",
      approvedAt: new Date(),
      declinedAt: null,
      subtotal: 100,
      taxAmount: 0,
      total: 100,
      customerNotes: null,
      customerResponseNote: "Please schedule next week.",
      customerCompany: { name: "Acme", contactName: "Alyssa", billingEmail: "alyssa@example.com", phone: null },
      site: { name: "Main campus", addressLine1: "123 Main", addressLine2: null, city: "Austin", state: "TX", postalCode: "78701" },
      tenant: { id: "tenant_1", name: "TradeWorx", branding: {}, billingEmail: "office@example.com" },
      lineItems: []
    });

    const result = await approveQuoteByAccessToken("token_approve", { note: "Please schedule next week." });

    expect(prismaMock.quote.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "quote_1" },
      data: expect.objectContaining({
        status: QuoteStatus.approved,
        customerResponseNote: "Please schedule next week."
      })
    }));
    expect(result.accessState).toBe("approved");
  });

  it("blocks quote conversion until the quote is approved", async () => {
    prismaMock.quote.findFirst.mockResolvedValue({
      id: "quote_1",
      tenantId: "tenant_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      quoteNumber: "Q-2026-0010",
      status: QuoteStatus.sent,
      expiresAt: null,
      convertedInspectionId: null,
      customerNotes: null,
      lineItems: [
        {
          id: "line_1",
          inspectionType: "fire_extinguisher",
          description: "Annual inspection",
          title: "Fire extinguisher annual inspection"
        }
      ]
    });

    await expect(convertQuoteToInspection(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" },
      "quote_1"
    )).rejects.toThrow("Approve this quote before converting it into work.");
  });

  it("deletes an unsynced quote and records the deletion audit event", async () => {
    prismaMock.quote.findFirst.mockResolvedValue({
      id: "quote_1",
      quoteNumber: "Q-2026-0013",
      quickbooksEstimateId: null,
      syncStatus: QuoteSyncStatus.not_synced,
      convertedInspectionId: null
    });

    await deleteQuote(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" },
      "quote_1"
    );

    expect(prismaMock.quote.delete).toHaveBeenCalledWith({
      where: { id: "quote_1" }
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "quote.deleted",
        entityId: "quote_1"
      })
    }));
  });

  it("prevents deleting a quote that is already synced to QuickBooks", async () => {
    prismaMock.quote.findFirst.mockResolvedValue({
      id: "quote_1",
      quoteNumber: "Q-2026-0014",
      quickbooksEstimateId: "qb_estimate_1",
      syncStatus: QuoteSyncStatus.synced,
      convertedInspectionId: null
    });

    await expect(deleteQuote(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" },
      "quote_1"
    )).rejects.toThrow("Quotes already synced to QuickBooks cannot be deleted.");
  });

  it("stores tenant quote reminder settings", async () => {
    await updateQuoteReminderSettings(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" },
      {
        enabled: true,
        sentNotViewedFirstBusinessDays: 3,
        sentNotViewedSecondBusinessDays: 6,
        viewedPendingFirstBusinessDays: 2,
        viewedPendingSecondBusinessDays: 5,
        expiringSoonDays: 2,
        expiredFollowUpEnabled: true,
        expiredFollowUpDays: 1,
        maxAutoReminders: 4,
        templates: {
          sentNotViewed: {
            subject: "Reminder: quote {{quoteNumber}} is ready",
            body: "Please review your quote online."
          },
          viewedPending: {
            subject: "Reminder: quote {{quoteNumber}} is waiting on approval",
            body: "Approve the quote when you are ready."
          },
          expiringSoon: {
            subject: "Quote {{quoteNumber}} expires soon",
            body: "Review the quote before it expires."
          },
          expired: {
            subject: "Quote {{quoteNumber}} has expired",
            body: "Reply if you would like us to reissue it."
          }
        }
      }
    );

    expect(prismaMock.tenant.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "tenant_1" },
      data: expect.objectContaining({
        quoteReminderSettings: expect.objectContaining({
          enabled: true,
          maxAutoReminders: 4
        })
      })
    }));
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "quote.reminder_settings_updated",
        entityType: "Tenant"
      })
    }));
  });

  it("pauses quote reminders and clears the next reminder schedule", async () => {
    prismaMock.quote.findFirst.mockResolvedValue({
      id: "quote_1"
    });

    await updateQuoteReminderControl(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" },
      "quote_1",
      "pause"
    );

    expect(prismaMock.quote.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "quote_1" },
      data: expect.objectContaining({
        remindersPausedAt: expect.any(Date),
        remindersPausedByUserId: "admin_1",
        nextReminderAt: null,
        reminderStage: "paused"
      })
    }));
  });

  it("sends a manual quote reminder using the hosted quote link", async () => {
    prismaMock.quote.findFirst.mockResolvedValueOnce({
      id: "quote_1",
      tenantId: "tenant_1",
      status: QuoteStatus.viewed,
      sentAt: new Date("2026-04-01T12:00:00.000Z"),
      firstViewedAt: new Date("2026-04-02T12:00:00.000Z"),
      expiresAt: addDays(new Date("2026-04-07T12:00:00.000Z"), 10),
      approvedAt: null,
      declinedAt: null,
      convertedAt: null,
      remindersEnabled: true,
      remindersPausedAt: null,
      reminderCount: 0
    }).mockResolvedValueOnce({
      id: "quote_1",
      tenantId: "tenant_1",
      quoteNumber: "Q-2026-0011",
      status: QuoteStatus.viewed,
      expiresAt: addDays(new Date("2026-04-07T12:00:00.000Z"), 10),
      remindersEnabled: true,
      remindersPausedAt: null,
      recipientEmail: "alyssa@example.com",
      contactName: "Alyssa Reed",
      total: 275,
      lastReminderAt: null,
      quoteAccessToken: "token_followup",
      tenant: { id: "tenant_1", name: "TradeWorx", branding: {}, billingEmail: "office@example.com", quoteReminderSettings: null },
      customerCompany: { id: "customer_1", name: "Acme", contactName: "Alyssa Reed", billingEmail: "alyssa@example.com", phone: null },
      site: { id: "site_1", name: "Main campus" }
    });

    await sendQuoteReminderNow(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" },
      "quote_1"
    );

    expect(sendQuoteReminderEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      quoteUrl: "https://tradeworx.example/quote/token_followup",
      recipientEmail: "alyssa@example.com"
    }));
    expect(prismaMock.quoteReminderDispatch.create).toHaveBeenCalled();
  });

  it("sweeps due reminder quotes and only sends reminders for quotes that are due", async () => {
    prismaMock.quote.findMany.mockResolvedValue([
      {
        id: "quote_due",
        tenantId: "tenant_1",
        status: QuoteStatus.sent,
        sentAt: new Date("2026-04-01T12:00:00.000Z"),
        firstViewedAt: null,
        expiresAt: null,
        approvedAt: null,
        declinedAt: null,
        convertedAt: null,
        remindersEnabled: true,
        remindersPausedAt: null,
        reminderCount: 0
      }
    ]);
    prismaMock.quoteReminderDispatch.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.quote.findFirst.mockResolvedValue({
      id: "quote_due",
      tenantId: "tenant_1",
      quoteNumber: "Q-2026-0012",
      status: QuoteStatus.sent,
      expiresAt: null,
      remindersEnabled: true,
      remindersPausedAt: null,
      recipientEmail: "alyssa@example.com",
      contactName: "Alyssa Reed",
      total: 199,
      lastReminderAt: null,
      quoteAccessToken: "token_due",
      tenant: { id: "tenant_1", name: "TradeWorx", branding: {}, billingEmail: "office@example.com", quoteReminderSettings: null },
      customerCompany: { id: "customer_1", name: "Acme", contactName: "Alyssa Reed", billingEmail: "alyssa@example.com", phone: null },
      site: null
    });

    const result = await runQuoteReminderSweep({ tenantId: "tenant_1", limit: 10 });

    expect(result).toEqual({
      processed: 1,
      sentCount: 1,
      skippedCount: 0
    });
    expect(sendQuoteReminderEmailMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.quoteReminderDispatch.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        quoteId: "quote_due",
        reminderType: "sent_not_viewed_first"
      })
    }));
  });
});
