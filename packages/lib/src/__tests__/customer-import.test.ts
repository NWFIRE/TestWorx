import { inspectionTypes } from "@testworx/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    customerCompany: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    site: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    asset: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    }
  }
}));

const { quickBooksMock } = vi.hoisted(() => ({
  quickBooksMock: {
    getTenantQuickBooksConnectionStatus: vi.fn(),
    syncTradeWorxCustomerCompanyToQuickBooks: vi.fn()
  }
}));

vi.mock("@testworx/db", async () => {
  const actual = await vi.importActual<typeof import("@testworx/db")>("@testworx/db");
  return {
    ...actual,
    prisma: prismaMock
  };
});

vi.mock("../quickbooks", () => ({
  getTenantQuickBooksConnectionStatus: quickBooksMock.getTenantQuickBooksConnectionStatus,
  syncTradeWorxCustomerCompanyToQuickBooks: quickBooksMock.syncTradeWorxCustomerCompanyToQuickBooks
}));

import { getCustomerSiteImportTemplateCsv, importCustomerSiteCsv, parseCustomerSiteImportCsv } from "../customer-import";

describe("customer/site csv import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quickBooksMock.getTenantQuickBooksConnectionStatus.mockResolvedValue({
      connection: { connected: false }
    });
  });

  it("parses the expected csv template headers and row values", () => {
    const rows = parseCustomerSiteImportCsv([
      "customerName,contactName,billingEmail,phone,siteName,addressLine1,addressLine2,city,state,postalCode,siteNotes,assetName,assetTag,assetInspectionTypes,assetLocation,assetManufacturer,assetModel,assetSerialNumber",
      "Pinecrest Property Management,Alyssa Reed,ap@pinecrestpm.com,312-555-0110,Pinecrest Tower,100 State St,,Chicago,IL,60601,Annual inspections,Lobby extinguisher bank,EXT-100,fire_extinguisher,Lobby by east stair,Amerex,,AMX-44021"
    ].join("\n"));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.customerName).toBe("Pinecrest Property Management");
    expect(rows[0]?.siteName).toBe("Pinecrest Tower");
    expect(rows[0]?.assetName).toBe("Lobby extinguisher bank");
  });

  it("accepts older csv files that only include customer and site headers", () => {
    const rows = parseCustomerSiteImportCsv([
      "customerName,contactName,billingEmail,phone,siteName,addressLine1,addressLine2,city,state,postalCode,siteNotes",
      "Pinecrest Property Management,Alyssa Reed,ap@pinecrestpm.com,312-555-0110,Pinecrest Tower,100 State St,,Chicago,IL,60601,Annual inspections"
    ].join("\n"));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.assetName).toBe("");
    expect(rows[0]?.assetInspectionTypes).toBe("");
  });

  it("accepts simplified legacy client-list headers", () => {
    const rows = parseCustomerSiteImportCsv([
      "Company Name,Contact Name,Email,Phone,Address,Notes,Status",
      "310 Park LLC,bpotterdmd,bpotterdmd@gmail.com,Phone: (216) 262-8560,904 Santa Fe,310 W. Park,active"
    ].join("\n"));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      customerName: "310 Park LLC",
      contactName: "bpotterdmd",
      billingEmail: "bpotterdmd@gmail.com",
      phone: "Phone: (216) 262-8560",
      siteName: "310 Park LLC",
      addressLine1: "904 Santa Fe",
      city: "Unknown",
      state: "Unknown",
      postalCode: "Unknown",
      siteNotes: "310 W. Park"
    });
  });

  it("fills missing address fields for sparse legacy rows", () => {
    const rows = parseCustomerSiteImportCsv([
      "Company Name,Contact Name,Email,Phone,Address,Notes,Status",
      "180 Direct Clinic,Rick,Rick@180directprimarycare.com,Phone: (580) 297-5078,,,"
    ].join("\n"));

    expect(rows[0]).toMatchObject({
      customerName: "180 Direct Clinic",
      siteName: "180 Direct Clinic",
      addressLine1: "Unknown",
      city: "Unknown",
      state: "Unknown",
      postalCode: "Unknown"
    });
  });

  it("provides a csv template with the required headers", () => {
    const template = getCustomerSiteImportTemplateCsv();

    expect(template).toContain("customerName,contactName,billingEmail,phone,siteName,addressLine1,addressLine2,city,state,postalCode,siteNotes,assetName,assetTag,assetInspectionTypes,assetLocation,assetManufacturer,assetModel,assetSerialNumber");
    expect(template).toContain("Lobby extinguisher bank");
  });

  it("creates new tenant-scoped customers, sites, and assets when they do not exist", async () => {
    prismaMock.customerCompany.findFirst.mockResolvedValue(null);
    prismaMock.customerCompany.create.mockResolvedValue({ id: "customer_1" });
    prismaMock.site.findFirst.mockResolvedValue(null);
    prismaMock.site.create.mockResolvedValue({ id: "site_1" });
    prismaMock.asset.findFirst.mockResolvedValue(null);
    prismaMock.asset.create.mockResolvedValue({ id: "asset_1" });

    const summary = await importCustomerSiteCsv(
      { userId: "user_1", role: "office_admin", tenantId: "tenant_1" },
      [
        "customerName,contactName,billingEmail,phone,siteName,addressLine1,addressLine2,city,state,postalCode,siteNotes,assetName,assetTag,assetInspectionTypes,assetLocation,assetManufacturer,assetModel,assetSerialNumber",
        "Pinecrest Property Management,Alyssa Reed,ap@pinecrestpm.com,312-555-0110,Pinecrest Tower,100 State St,,Chicago,IL,60601,Annual inspections,Lobby extinguisher bank,EXT-100,fire_extinguisher,Lobby by east stair,Amerex,,AMX-44021"
      ].join("\n")
    );

    expect(prismaMock.customerCompany.findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant_1", name: "Pinecrest Property Management" }
    });
    expect(prismaMock.customerCompany.create).toHaveBeenCalled();
    expect(prismaMock.site.create).toHaveBeenCalled();
    expect(prismaMock.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        siteId: "site_1",
        name: "Lobby extinguisher bank",
        assetTag: "EXT-100",
        inspectionTypes: [inspectionTypes.fire_extinguisher],
        metadata: expect.objectContaining({
          location: "Lobby by east stair",
          manufacturer: "Amerex",
          serialNumber: "AMX-44021"
        })
      })
    });
    expect(summary).toMatchObject({
      rowCount: 1,
      customersCreated: 1,
      customersUpdated: 0,
      sitesCreated: 1,
      sitesUpdated: 0,
      assetsCreated: 1,
      assetsUpdated: 0
    });
  });

  it("updates existing tenant-scoped customers, sites, and assets instead of duplicating them", async () => {
    prismaMock.customerCompany.findFirst.mockResolvedValue({ id: "customer_1", contactName: null, billingEmail: null, phone: null });
    prismaMock.customerCompany.update.mockResolvedValue({ id: "customer_1" });
    prismaMock.site.findFirst.mockResolvedValue({ id: "site_1", notes: null });
    prismaMock.site.update.mockResolvedValue({ id: "site_1" });
    prismaMock.asset.findFirst.mockResolvedValue({
      id: "asset_1",
      assetTag: "EXT-100",
      inspectionTypes: [inspectionTypes.fire_extinguisher],
      metadata: { location: "Old location" }
    });
    prismaMock.asset.update.mockResolvedValue({ id: "asset_1" });

    const summary = await importCustomerSiteCsv(
      { userId: "user_1", role: "tenant_admin", tenantId: "tenant_1" },
      [
        "customerName,contactName,billingEmail,phone,siteName,addressLine1,addressLine2,city,state,postalCode,siteNotes,assetName,assetTag,assetInspectionTypes,assetLocation,assetManufacturer,assetModel,assetSerialNumber",
        "Pinecrest Property Management,Alyssa Reed,ap@pinecrestpm.com,312-555-0110,Pinecrest Tower,100 State St,,Chicago,IL,60601,Annual inspections,Lobby extinguisher bank,EXT-100,fire_extinguisher;fire_alarm,Lobby by east stair,Amerex,Stored pressure,AMX-44021"
      ].join("\n")
    );

    expect(prismaMock.customerCompany.update).toHaveBeenCalled();
    expect(prismaMock.site.update).toHaveBeenCalled();
    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: { id: "asset_1" },
      data: expect.objectContaining({
        name: "Lobby extinguisher bank",
        assetTag: "EXT-100",
        inspectionTypes: [inspectionTypes.fire_extinguisher, inspectionTypes.fire_alarm],
        metadata: expect.objectContaining({
          location: "Lobby by east stair",
          manufacturer: "Amerex",
          model: "Stored pressure",
          serialNumber: "AMX-44021"
        })
      })
    });
    expect(summary).toMatchObject({
      rowCount: 1,
      customersCreated: 0,
      customersUpdated: 1,
      sitesCreated: 0,
      sitesUpdated: 1,
      assetsCreated: 0,
      assetsUpdated: 1
    });
  });

  it("syncs imported customers to QuickBooks when the tenant connection is active", async () => {
    quickBooksMock.getTenantQuickBooksConnectionStatus.mockResolvedValue({
      connection: { connected: true }
    });
    prismaMock.customerCompany.findFirst.mockResolvedValue(null);
    prismaMock.customerCompany.create.mockResolvedValue({ id: "customer_1" });
    prismaMock.site.findFirst.mockResolvedValue(null);
    prismaMock.site.create.mockResolvedValue({ id: "site_1" });
    quickBooksMock.syncTradeWorxCustomerCompanyToQuickBooks.mockResolvedValue({
      customerCompanyId: "customer_1",
      quickbooksCustomerId: "qbo_customer_1"
    });

    const summary = await importCustomerSiteCsv(
      { userId: "user_1", role: "office_admin", tenantId: "tenant_1" },
      [
        "customerName,contactName,billingEmail,phone,siteName,addressLine1,addressLine2,city,state,postalCode,siteNotes",
        "Pinecrest Property Management,Alyssa Reed,ap@pinecrestpm.com,312-555-0110,Pinecrest Tower,100 State St,,Chicago,IL,60601,Annual inspections"
      ].join("\n")
    );

    expect(quickBooksMock.syncTradeWorxCustomerCompanyToQuickBooks).toHaveBeenCalledWith(
      { userId: "user_1", role: "office_admin", tenantId: "tenant_1" },
      "customer_1"
    );
    expect(summary.quickBooksCustomersSynced).toBe(1);
    expect(summary.quickBooksCustomerSyncFailures).toBe(0);
  });

  it("keeps imported customer data when QuickBooks sync fails", async () => {
    quickBooksMock.getTenantQuickBooksConnectionStatus.mockResolvedValue({
      connection: { connected: true }
    });
    prismaMock.customerCompany.findFirst.mockResolvedValue(null);
    prismaMock.customerCompany.create.mockResolvedValue({ id: "customer_1" });
    prismaMock.site.findFirst.mockResolvedValue(null);
    prismaMock.site.create.mockResolvedValue({ id: "site_1" });
    quickBooksMock.syncTradeWorxCustomerCompanyToQuickBooks.mockRejectedValue(new Error("QuickBooks unavailable"));

    const summary = await importCustomerSiteCsv(
      { userId: "user_1", role: "office_admin", tenantId: "tenant_1" },
      [
        "customerName,contactName,billingEmail,phone,siteName,addressLine1,addressLine2,city,state,postalCode,siteNotes",
        "Pinecrest Property Management,Alyssa Reed,ap@pinecrestpm.com,312-555-0110,Pinecrest Tower,100 State St,,Chicago,IL,60601,Annual inspections"
      ].join("\n")
    );

    expect(prismaMock.customerCompany.create).toHaveBeenCalled();
    expect(prismaMock.site.create).toHaveBeenCalled();
    expect(summary.quickBooksCustomersSynced).toBe(0);
    expect(summary.quickBooksCustomerSyncFailures).toBe(1);
  });

  it("skips asset creation when asset columns are omitted", async () => {
    prismaMock.customerCompany.findFirst.mockResolvedValue(null);
    prismaMock.customerCompany.create.mockResolvedValue({ id: "customer_1" });
    prismaMock.site.findFirst.mockResolvedValue(null);
    prismaMock.site.create.mockResolvedValue({ id: "site_1" });

    const summary = await importCustomerSiteCsv(
      { userId: "user_1", role: "office_admin", tenantId: "tenant_1" },
      [
        "customerName,contactName,billingEmail,phone,siteName,addressLine1,addressLine2,city,state,postalCode,siteNotes",
        "Pinecrest Property Management,Alyssa Reed,ap@pinecrestpm.com,312-555-0110,Pinecrest Tower,100 State St,,Chicago,IL,60601,Annual inspections"
      ].join("\n")
    );

    expect(prismaMock.asset.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.asset.create).not.toHaveBeenCalled();
    expect(summary.assetsCreated).toBe(0);
    expect(summary.assetsUpdated).toBe(0);
  });

  it("rejects non-admin roles", async () => {
    await expect(importCustomerSiteCsv(
      { userId: "user_1", role: "technician", tenantId: "tenant_1" },
      [
        "customerName,contactName,billingEmail,phone,siteName,addressLine1,addressLine2,city,state,postalCode,siteNotes",
        "Pinecrest Property Management,Alyssa Reed,ap@pinecrestpm.com,312-555-0110,Pinecrest Tower,100 State St,,Chicago,IL,60601,Annual inspections"
      ].join("\n")
    )).rejects.toThrow(/Only tenant and office administrators/i);
  });
});
