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

  it("creates a reusable PO-labeled site for inspections that do not have a physical customer site", async () => {
    prismaMock.customerCompany.findFirst.mockResolvedValue({
      id: "customer_1",
      name: "NW Fire"
    });
    prismaMock.site.findFirst.mockResolvedValue(null);
    prismaMock.site.create.mockResolvedValue({
      id: "site_po_33774"
    });

    const { ensurePurchaseOrderInspectionSite } = await import("../scheduling");

    const result = await ensurePurchaseOrderInspectionSite(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "customer_1",
      "33774"
    );

    expect(result).toEqual({ id: "site_po_33774" });
    expect(prismaMock.site.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        customerCompanyId: "customer_1",
        name: "PO: 33774",
        addressLine1: "No fixed service address",
        city: "Unknown",
        state: "Unknown",
        postalCode: "Unknown"
      }),
      select: { id: true }
    });
  });

  it.each([
    { name: " Temporary Site " },
    { name: " Temporary Site ", addressLine1: " ", city: "", state: " ", postalCode: "" },
    { name: " Temporary Site ", city: " Tulsa " }
  ])("creates a one-time site with optional address details: %j", async (input) => {
    prismaMock.customerCompany.findFirst.mockResolvedValue({ id: "customer_1", name: "NW Fire" });
    prismaMock.site.create.mockResolvedValue({ id: "site_custom_new" });
    const { createOneTimeInspectionSite } = await import("../scheduling");
    await createOneTimeInspectionSite(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" }, "customer_1", input
    );
    expect(prismaMock.customerCompany.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "customer_1", tenantId: "tenant_1" }
    }));
    expect(prismaMock.site.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Temporary Site", addressLine1: "", addressLine2: null,
        city: input.city?.trim() || "", state: "", postalCode: "" }),
      select: { id: true }
    });
  });

  it("still requires a one-time site name", async () => {
    const { createOneTimeInspectionSite } = await import("../scheduling");
    await expect(createOneTimeInspectionSite(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" }, "customer_1", { name: " " }
    )).rejects.toThrow("Enter a site name");
    expect(prismaMock.site.create).not.toHaveBeenCalled();
  });

  it("rejects a customer outside the tenant", async () => {
    prismaMock.customerCompany.findFirst.mockResolvedValue(null);
    const { createOneTimeInspectionSite } = await import("../scheduling");
    await expect(createOneTimeInspectionSite(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" }, "other_customer", { name: "Site" }
    )).rejects.toThrow("Customer not found");
    expect(prismaMock.site.create).not.toHaveBeenCalled();
  });

  it("does not allow technicians to create one-time sites", async () => {
    const { createOneTimeInspectionSite } = await import("../scheduling");
    await expect(createOneTimeInspectionSite(
      { userId: "tech_1", role: "technician", tenantId: "tenant_1" }, "customer_1", { name: "Site" }
    )).rejects.toThrow("Only administrators");
    expect(prismaMock.site.create).not.toHaveBeenCalled();
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
