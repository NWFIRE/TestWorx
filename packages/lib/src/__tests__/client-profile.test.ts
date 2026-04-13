import { beforeEach, describe, expect, it, vi } from "vitest";
import { InspectionStatus, QuoteStatus } from "@prisma/client";

const prismaMock = {
  customerCompany: {
    findFirst: vi.fn()
  },
  inspection: {
    findMany: vi.fn()
  },
  quote: {
    findMany: vi.fn()
  },
  inspectionDocument: {
    findMany: vi.fn()
  },
  attachment: {
    findMany: vi.fn()
  },
  auditLog: {
    findMany: vi.fn()
  }
};

const quickBooksMock = {
  getQuickBooksCustomerInvoiceHistory: vi.fn()
};

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

vi.mock("../quickbooks", () => ({
  getQuickBooksCustomerInvoiceHistory: quickBooksMock.getQuickBooksCustomerInvoiceHistory
}));

describe("client profile workspace data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the customer is missing", async () => {
    prismaMock.customerCompany.findFirst.mockResolvedValue(null);

    const { getClientProfileData } = await import("../client-profile");
    const result = await getClientProfileData(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "customer_missing"
    );

    expect(result).toBeNull();
  }, 10000);

  it("builds a complete customer workspace view with billing and operational history", async () => {
    prismaMock.customerCompany.findFirst.mockResolvedValue({
      id: "customer_1",
      name: "Klemme Construction",
      contactName: "Brett Klemme",
      billingEmail: "office@klemme.test",
      phone: "580-977-4084",
      isActive: true,
      isTaxExempt: false,
      paymentTermsCode: "net_30",
      customPaymentTermsLabel: null,
      customPaymentTermsDays: null,
      quickbooksCustomerId: "qb_customer_1",
      notes: "Use rear loading entrance after 8am.",
      billingAddressLine1: "123 Billing St",
      billingAddressLine2: null,
      billingCity: "Tulsa",
      billingState: "OK",
      billingPostalCode: "74101",
      billingCountry: "USA",
      serviceAddressLine1: "500 Service Ave",
      serviceAddressLine2: null,
      serviceCity: "Tulsa",
      serviceState: "OK",
      servicePostalCode: "74103",
      serviceCountry: "USA",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-13T00:00:00.000Z"),
      sites: [
        {
          id: "site_1",
          name: "Main Campus",
          line1: null,
          line2: null,
          addressLine1: "500 Service Ave",
          addressLine2: null,
          city: "Tulsa",
          state: "OK",
          postalCode: "74103",
          country: "USA",
          _count: {
            inspections: 4,
            assets: 11
          }
        }
      ]
    });

    prismaMock.inspection.findMany.mockResolvedValue([
      {
        id: "inspection_1",
        scheduledStart: new Date("2026-04-22T15:00:00.000Z"),
        updatedAt: new Date("2026-04-12T10:00:00.000Z"),
        status: InspectionStatus.scheduled,
        site: { id: "site_1", name: "Main Campus", city: "Tulsa" },
        assignedTechnician: { id: "tech_1", name: "Taylor Tech" },
        technicianAssignments: [],
        tasks: [{ id: "task_1", inspectionType: "fire_alarm" }],
        reports: [{ id: "report_1", finalizedAt: null, status: "draft" }],
        deficiencies: [],
        billingSummary: {
          id: "billing_1",
          status: "ready",
          quickbooksInvoiceId: "qb_invoice_1",
          quickbooksInvoiceNumber: "1001",
          quickbooksSendStatus: "sent",
          subtotal: 230,
          createdAt: new Date("2026-04-11T00:00:00.000Z"),
          updatedAt: new Date("2026-04-11T00:00:00.000Z")
        },
        convertedFromQuotes: []
      },
      {
        id: "inspection_2",
        scheduledStart: new Date("2026-03-15T15:00:00.000Z"),
        updatedAt: new Date("2026-03-16T10:00:00.000Z"),
        status: InspectionStatus.completed,
        site: { id: "site_1", name: "Main Campus", city: "Tulsa" },
        assignedTechnician: null,
        technicianAssignments: [{ technician: { id: "tech_2", name: "Morgan Field" } }],
        tasks: [{ id: "task_2", inspectionType: "work_order" }],
        reports: [],
        deficiencies: [{ id: "def_1" }],
        billingSummary: null,
        convertedFromQuotes: []
      }
    ]);

    prismaMock.quote.findMany.mockResolvedValue([
      {
        id: "quote_1",
        quoteNumber: "Q-2026-0004",
        issuedAt: new Date("2026-04-10T00:00:00.000Z"),
        expiresAt: new Date("2026-05-10T00:00:00.000Z"),
        updatedAt: new Date("2026-04-10T00:00:00.000Z"),
        total: 4187.08,
        status: QuoteStatus.sent,
        quoteAccessToken: "quote_token_1",
        quickbooksEstimateNumber: "EST-88",
        site: { id: "site_1", name: "Main Campus" }
      }
    ]);

    prismaMock.inspectionDocument.findMany.mockResolvedValue([
      {
        id: "doc_1",
        label: "Signed authorization",
        fileName: "signed-authorization.pdf",
        uploadedAt: new Date("2026-04-09T00:00:00.000Z"),
        inspection: {
          id: "inspection_1",
          scheduledStart: new Date("2026-04-22T15:00:00.000Z"),
          site: { name: "Main Campus" }
        }
      }
    ]);

    prismaMock.attachment.findMany.mockResolvedValue([
      {
        id: "attachment_1",
        fileName: "inspection-photo.pdf",
        createdAt: new Date("2026-04-08T00:00:00.000Z"),
        inspectionReport: {
          inspection: {
            id: "inspection_1",
            scheduledStart: new Date("2026-04-22T15:00:00.000Z"),
            site: { name: "Main Campus" }
          }
        }
      }
    ]);

    prismaMock.auditLog.findMany.mockResolvedValue([
      {
        id: "audit_1",
        action: "quote.sent",
        createdAt: new Date("2026-04-10T16:00:00.000Z"),
        actor: { name: "Office Admin" }
      }
    ]);

    quickBooksMock.getQuickBooksCustomerInvoiceHistory.mockResolvedValue({
      connection: { connected: true, guidance: null },
      customerLinked: true,
      customerQuickBooksId: "qb_customer_1",
      invoices: [
        {
          invoiceId: "qb_invoice_1",
          invoiceNumber: "1001",
          invoiceDate: new Date("2026-04-11T00:00:00.000Z"),
          dueDate: new Date("2026-05-11T00:00:00.000Z"),
          totalAmount: 230,
          balanceDue: 75,
          paidAmount: 155,
          paymentStatus: "partial",
          statusLabel: "Partially paid",
          memo: "April service",
          lastUpdatedAt: new Date("2026-04-12T00:00:00.000Z"),
          lineItemSummary: ["Fire alarm inspection"],
          invoiceUrl: "https://qbo.example/invoice/1001"
        }
      ],
      lastSyncedAt: new Date("2026-04-13T12:00:00.000Z"),
      syncError: null
    });

    const { getClientProfileData } = await import("../client-profile");
    const result = await getClientProfileData(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "customer_1"
    );

    expect(result?.customer.name).toBe("Klemme Construction");
    expect(result?.overview.siteCount).toBe(1);
    expect(result?.overview.openQuoteCount).toBe(1);
    expect(result?.overview.upcomingInspectionCount).toBe(1);
    expect(result?.overview.unpaidInvoiceCount).toBe(1);
    expect(result?.overview.totalInvoiced).toBe(230);
    expect(result?.billing.invoices[0]?.invoiceNumber).toBe("1001");
    expect(result?.documents.some((document) => document.href === "/api/inspection-documents/doc_1?variant=preferred")).toBe(true);
    expect(result?.documents.some((document) => document.href === "/api/attachments/attachment_1")).toBe(true);
    expect(result?.quoteHistory[0]?.detailLink).toBe("/app/admin/quotes/quote_1");
    expect(result?.inspectionHistory[0]?.inspectionLink).toBe("/app/admin/inspections/inspection_1");
    expect(result?.activity.some((entry) => entry.type === "Invoice")).toBe(true);
  });
});
