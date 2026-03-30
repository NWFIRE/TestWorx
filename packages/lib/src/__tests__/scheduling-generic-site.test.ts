import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  customerCompany: {
    findFirst: vi.fn()
  },
  site: {
    findFirst: vi.fn(),
    create: vi.fn()
  }
};

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

describe("generic inspection site helper", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("reuses an existing generic site for the selected customer", async () => {
    prismaMock.customerCompany.findFirst.mockResolvedValue({
      id: "customer_1",
      name: "NW Fire"
    });
    prismaMock.site.findFirst.mockResolvedValue({
      id: "site_generic_1"
    });

    const { ensureGenericInspectionSite } = await import("../scheduling");

    const result = await ensureGenericInspectionSite(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "customer_1"
    );

    expect(result).toEqual({ id: "site_generic_1" });
    expect(prismaMock.site.create).not.toHaveBeenCalled();
  }, 10000);

  it("creates the generic site once when the customer does not have one yet", async () => {
    prismaMock.customerCompany.findFirst.mockResolvedValue({
      id: "customer_1",
      name: "NW Fire"
    });
    prismaMock.site.findFirst.mockResolvedValue(null);
    prismaMock.site.create.mockResolvedValue({
      id: "site_generic_new"
    });

    const { ensureGenericInspectionSite, genericInspectionSiteName } = await import("../scheduling");

    const result = await ensureGenericInspectionSite(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "customer_1"
    );

    expect(result).toEqual({ id: "site_generic_new" });
    expect(prismaMock.site.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        customerCompanyId: "customer_1",
        name: genericInspectionSiteName
      }),
      select: { id: true }
    });
  });

  it("creates a one-time site for the selected customer", async () => {
    prismaMock.customerCompany.findFirst.mockResolvedValue({
      id: "customer_1",
      name: "NW Fire"
    });
    prismaMock.site.create.mockResolvedValue({
      id: "site_custom_new"
    });

    const { createOneTimeInspectionSite } = await import("../scheduling");

    const result = await createOneTimeInspectionSite(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "customer_1",
      {
        name: "Temporary Job Site",
        addressLine1: "123 Main St",
        addressLine2: "Suite 200",
        city: "Tulsa",
        state: "OK",
        postalCode: "74103",
        notes: "Created from inspection scheduling."
      }
    );

    expect(result).toEqual({ id: "site_custom_new" });
    expect(prismaMock.site.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        customerCompanyId: "customer_1",
        name: "Temporary Job Site",
        addressLine1: "123 Main St",
        addressLine2: "Suite 200",
        city: "Tulsa",
        state: "OK",
        postalCode: "74103",
        notes: "Created from inspection scheduling."
      }),
      select: { id: true }
    });
  });
});
