import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, quickBooksMock } = vi.hoisted(() => ({
  prismaMock: {
    customerCompany: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
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

import { createCustomerCompany, getTenantCustomerCompanySettings, updateCustomerCompany } from "../customer-companies";

describe("customer company settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quickBooksMock.getTenantQuickBooksConnectionStatus.mockResolvedValue({
      connection: { connected: false }
    });
  });

  it("lists tenant-scoped customer companies for administrators", async () => {
    prismaMock.customerCompany.findMany.mockResolvedValue([
      { id: "customer_1", name: "Acme Tower", contactName: null, billingEmail: null, phone: null, quickbooksCustomerId: null, createdAt: new Date(), updatedAt: new Date() }
    ]);

    const result = await getTenantCustomerCompanySettings(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" }
    );

    expect(prismaMock.customerCompany.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant_1" },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      select: expect.any(Object)
    });
    expect(result).toHaveLength(1);
  });

  it("creates a customer locally even when QuickBooks is disconnected", async () => {
    prismaMock.customerCompany.findFirst.mockResolvedValue(null);
    prismaMock.customerCompany.create.mockResolvedValue({
      id: "customer_1",
      name: "Acme Tower",
      contactName: "Jordan Lee",
      billingEmail: "billing@acme.test",
      phone: "312-555-0101",
      quickbooksCustomerId: null
    });
    prismaMock.auditLog.create.mockResolvedValue(undefined);

    const result = await createCustomerCompany(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        name: "Acme Tower",
        contactName: "Jordan Lee",
        billingEmail: "billing@acme.test",
        phone: "312-555-0101"
      }
    );

    expect(prismaMock.customerCompany.create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant_1",
        name: "Acme Tower",
        contactName: "Jordan Lee",
        billingEmail: "billing@acme.test",
        phone: "312-555-0101"
      },
      select: expect.any(Object)
    });
    expect(quickBooksMock.syncTradeWorxCustomerCompanyToQuickBooks).not.toHaveBeenCalled();
    expect(result.quickBooksSynced).toBe(false);
    expect(result.quickBooksSyncError).toBeNull();
  });

  it("keeps the customer update when QuickBooks sync fails", async () => {
    quickBooksMock.getTenantQuickBooksConnectionStatus.mockResolvedValue({
      connection: { connected: true }
    });
    quickBooksMock.syncTradeWorxCustomerCompanyToQuickBooks.mockRejectedValue(new Error("QuickBooks unavailable"));
    prismaMock.customerCompany.findFirst
      .mockResolvedValueOnce({ id: "customer_1", name: "Old Name" })
      .mockResolvedValueOnce(null);
    prismaMock.customerCompany.update.mockResolvedValue({
      id: "customer_1",
      name: "Acme Tower",
      contactName: "Jordan Lee",
      billingEmail: "billing@acme.test",
      phone: "312-555-0101",
      quickbooksCustomerId: null
    });
    prismaMock.auditLog.create.mockResolvedValue(undefined);

    const result = await updateCustomerCompany(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        customerCompanyId: "customer_1",
        name: "Acme Tower",
        contactName: "Jordan Lee",
        billingEmail: "billing@acme.test",
        phone: "312-555-0101"
      }
    );

    expect(prismaMock.customerCompany.update).toHaveBeenCalledWith({
      where: { id: "customer_1" },
      data: {
        name: "Acme Tower",
        contactName: "Jordan Lee",
        billingEmail: "billing@acme.test",
        phone: "312-555-0101"
      },
      select: expect.any(Object)
    });
    expect(result.quickBooksSynced).toBe(false);
    expect(result.quickBooksSyncError).toMatch(/QuickBooks unavailable/i);
  });
});
