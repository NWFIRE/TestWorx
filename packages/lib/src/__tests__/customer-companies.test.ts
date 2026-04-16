import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, quickBooksMock } = vi.hoisted(() => ({
  prismaMock: {
    customerCompany: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    billingPayerAccount: {
      findFirst: vi.fn()
    },
    billingContractProfile: {
      findFirst: vi.fn()
    },
    auditLog: {
      create: vi.fn()
    }
  },
  quickBooksMock: {
    getTenantQuickBooksConnectionStatus: vi.fn(),
    syncTradeWorxCustomerCompanyToQuickBooks: vi.fn()
  }
}));

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

vi.mock("../quickbooks", () => ({
  getTenantQuickBooksConnectionStatus: quickBooksMock.getTenantQuickBooksConnectionStatus,
  syncTradeWorxCustomerCompanyToQuickBooks: quickBooksMock.syncTradeWorxCustomerCompanyToQuickBooks
}));

import {
  createCustomerCompany,
  getPaginatedTenantCustomerCompanySettings,
  getTenantCustomerCompanySettings,
  updateCustomerCompany
} from "../customer-companies";

function buildCustomerCompany(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "customer_1",
    name: "Acme Tower",
    contactName: "Jordan Lee",
    billingEmail: "billing@acme.test",
    phone: "312-555-0101",
    isTaxExempt: false,
    serviceAddressLine1: "123 Market Street",
    serviceAddressLine2: null,
    serviceCity: "Oklahoma City",
    serviceState: "OK",
    servicePostalCode: "73102",
    serviceCountry: "USA",
    billingAddressSameAsService: true,
    billingAddressLine1: "123 Market Street",
    billingAddressLine2: null,
    billingCity: "Oklahoma City",
    billingState: "OK",
    billingPostalCode: "73102",
    billingCountry: "USA",
    notes: null,
    isActive: true,
    paymentTermsCode: "due_on_receipt",
    customPaymentTermsLabel: null,
    customPaymentTermsDays: null,
    quickbooksCustomerId: null,
    billingType: "standard",
    billToAccountId: null,
    contractProfileId: null,
    invoiceDeliverySettings: { method: "payer_email" },
    autoBillingEnabled: false,
    requiredBillingReferences: { requirePo: false, requireCustomerReference: false, labels: [] },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

describe("customer company settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.customerCompany.count.mockResolvedValue(1);
    prismaMock.billingPayerAccount.findFirst.mockResolvedValue(null);
    prismaMock.billingContractProfile.findFirst.mockResolvedValue(null);
    quickBooksMock.getTenantQuickBooksConnectionStatus.mockResolvedValue({
      connection: { connected: false }
    });
  });

  it("lists tenant-scoped customer companies for administrators", async () => {
    prismaMock.customerCompany.findMany.mockResolvedValue([buildCustomerCompany()]);

    const result = await getTenantCustomerCompanySettings(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" }
    );

    expect(prismaMock.customerCompany.count).toHaveBeenCalledWith({
      where: { tenantId: "tenant_1" }
    });
    expect(prismaMock.customerCompany.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant_1" },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      skip: 0,
      take: 100,
      select: expect.any(Object)
    });
    expect(result).toHaveLength(1);
  });

  it("creates a customer locally even when QuickBooks is disconnected", async () => {
    prismaMock.customerCompany.findFirst.mockResolvedValue(null);
    prismaMock.customerCompany.create.mockResolvedValue(buildCustomerCompany());
    prismaMock.auditLog.create.mockResolvedValue(undefined);

    const result = await createCustomerCompany(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        name: "Acme Tower",
        contactName: "Jordan Lee",
        billingEmail: "billing@acme.test",
        phone: "312-555-0101",
        isTaxExempt: true,
        serviceAddressLine1: "123 Market Street",
        serviceCity: "Oklahoma City",
        serviceState: "OK",
        servicePostalCode: "73102",
        serviceCountry: "USA",
        billingAddressSameAsService: true,
        notes: "Collect payment on site.",
        paymentTermsCode: "due_on_receipt",
        isActive: true
      }
    );

    expect(prismaMock.customerCompany.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        name: "Acme Tower",
        serviceAddressLine1: "123 Market Street",
        billingAddressLine1: "123 Market Street",
        isTaxExempt: true,
        paymentTermsCode: "due_on_receipt",
        isActive: true
      }),
      select: expect.any(Object)
    });
    expect(quickBooksMock.syncTradeWorxCustomerCompanyToQuickBooks).not.toHaveBeenCalled();
    expect(result.quickBooksSynced).toBe(false);
    expect(result.quickBooksSyncError).toBeNull();
  });

  it("requires custom term details when custom payment terms are selected", async () => {
    await expect(
      createCustomerCompany(
        { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
        {
          name: "Acme Tower",
          paymentTermsCode: "custom",
          billingAddressSameAsService: true,
          isActive: true
        }
      )
    ).rejects.toThrow(/Enter custom payment terms/i);
  });

  it("keeps the customer update when QuickBooks sync fails", async () => {
    quickBooksMock.getTenantQuickBooksConnectionStatus.mockResolvedValue({
      connection: { connected: true }
    });
    quickBooksMock.syncTradeWorxCustomerCompanyToQuickBooks.mockRejectedValue(new Error("QuickBooks unavailable"));
    prismaMock.customerCompany.findFirst
      .mockResolvedValueOnce({ id: "customer_1", name: "Old Name" })
      .mockResolvedValueOnce(null);
    prismaMock.customerCompany.update.mockResolvedValue(
      buildCustomerCompany({
        paymentTermsCode: "custom",
        customPaymentTermsLabel: "Net 45"
      })
    );
    prismaMock.auditLog.create.mockResolvedValue(undefined);

    const result = await updateCustomerCompany(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        customerCompanyId: "customer_1",
        name: "Acme Tower",
        contactName: "Jordan Lee",
        billingEmail: "billing@acme.test",
        phone: "312-555-0101",
        isTaxExempt: true,
        serviceAddressLine1: "123 Market Street",
        serviceCity: "Oklahoma City",
        serviceState: "OK",
        servicePostalCode: "73102",
        serviceCountry: "USA",
        billingAddressSameAsService: false,
        billingAddressLine1: "PO Box 122",
        billingCity: "Oklahoma City",
        billingState: "OK",
        billingPostalCode: "73101",
        billingCountry: "USA",
        paymentTermsCode: "custom",
        customPaymentTermsLabel: "Net 45",
        isActive: false
      }
    );

    expect(prismaMock.customerCompany.update).toHaveBeenCalledWith({
      where: { id: "customer_1" },
      data: expect.objectContaining({
        billingAddressSameAsService: false,
        billingAddressLine1: "PO Box 122",
        isTaxExempt: true,
        paymentTermsCode: "custom",
        customPaymentTermsLabel: "Net 45",
        isActive: false
      }),
      select: expect.any(Object)
    });
    expect(result.quickBooksSynced).toBe(false);
    expect(result.quickBooksSyncError).toMatch(/QuickBooks unavailable/i);
  });

  it("requires an active payer account and contract profile for third-party billing", async () => {
    await expect(
      createCustomerCompany(
        { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
        {
          name: "Acme Tower",
          billingAddressSameAsService: true,
          isActive: true,
          paymentTermsCode: "due_on_receipt",
          billingType: "third_party"
        }
      )
    ).rejects.toThrow(/Third-party billing requires both an active payer account and an active contract profile/i);
  });

  it("saves validated third-party billing settings on the customer record", async () => {
    prismaMock.customerCompany.findFirst.mockResolvedValueOnce(null);
    prismaMock.billingPayerAccount.findFirst.mockResolvedValue({
      id: "payer_1",
      tenantId: "tenant_1",
      name: "Academy Fire",
      contactName: null,
      billingEmail: "ap@academy.test",
      phone: null,
      billingAddressLine1: null,
      billingAddressLine2: null,
      billingCity: null,
      billingState: null,
      billingPostalCode: null,
      billingCountry: null,
      invoiceDeliverySettings: { method: "payer_email" },
      quickbooksCustomerId: "qb_payer_1",
      externalAccountCode: null,
      externalReference: null,
      isActive: true
    });
    prismaMock.billingContractProfile.findFirst.mockResolvedValue({
      id: "contract_1",
      tenantId: "tenant_1",
      payerAccountId: "payer_1",
      name: "Academy Annual",
      isActive: true,
      effectiveStartDate: new Date("2026-01-01T00:00:00.000Z"),
      effectiveEndDate: null,
      inspectionRules: {},
      serviceRules: {},
      emergencyRules: {},
      deficiencyRules: {},
      groupingRules: { mode: "standard" },
      attachmentRules: {},
      deliveryRules: { holdForManualReview: true },
      referenceRules: { requirePo: true, labels: ["Store number"] }
    });
    prismaMock.customerCompany.create.mockResolvedValue(
      buildCustomerCompany({
        billingType: "third_party",
        billToAccountId: "payer_1",
        contractProfileId: "contract_1",
        invoiceDeliverySettings: { method: "payer_email", label: "Academy AP" },
        autoBillingEnabled: true,
        requiredBillingReferences: { requirePo: true, requireCustomerReference: false, labels: ["Store number"] }
      })
    );
    prismaMock.auditLog.create.mockResolvedValue(undefined);

    await createCustomerCompany(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        name: "Acme Tower",
        billingAddressSameAsService: true,
        isActive: true,
        paymentTermsCode: "due_on_receipt",
        billingType: "third_party",
        billToAccountId: "payer_1",
        contractProfileId: "contract_1",
        invoiceDeliverySettings: { method: "payer_email", label: "Academy AP" },
        autoBillingEnabled: true,
        requiredBillingReferences: { requirePo: true, requireCustomerReference: false, labels: ["Store number"] }
      }
    );

    expect(prismaMock.customerCompany.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        billingType: "third_party",
        billToAccountId: "payer_1",
        contractProfileId: "contract_1",
        autoBillingEnabled: true,
        invoiceDeliverySettings: { method: "payer_email", label: "Academy AP" },
        requiredBillingReferences: { requirePo: true, requireCustomerReference: false, labels: ["Store number"] }
      }),
      select: expect.any(Object)
    });
  });

  it("filters current customers by search query", async () => {
    prismaMock.customerCompany.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(4);
    prismaMock.customerCompany.findMany.mockResolvedValue([
      buildCustomerCompany({ name: "Harbor Medical", billingEmail: "ap@harbor.test" })
    ]);

    const result = await getPaginatedTenantCustomerCompanySettings(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { page: 1, limit: 10, query: "harbor" }
    );

    expect(prismaMock.customerCompany.count).toHaveBeenNthCalledWith(1, {
      where: {
        tenantId: "tenant_1",
        OR: [
          { name: { contains: "harbor", mode: "insensitive" } },
          { contactName: { contains: "harbor", mode: "insensitive" } },
          { billingEmail: { contains: "harbor", mode: "insensitive" } },
          { phone: { contains: "harbor", mode: "insensitive" } }
        ]
      }
    });
    expect(result.filters.query).toBe("harbor");
    expect(result.pagination.totalCount).toBe(1);
    expect(result.pagination.overallCount).toBe(4);
  });
});
