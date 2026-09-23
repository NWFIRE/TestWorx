import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ tenant: { findUnique: vi.fn() }, inspection: { findMany: vi.fn() } }));
vi.mock("@testworx/db", () => ({ prisma: mocks }));
import { getMonthlyInspectionList, inspectionMonthKey } from "../monthly-inspections";
import { monthlyInspectionCsv } from "../../../../apps/web/src/app/app/admin/inspections/monthly/csv";
const actor = { tenantId: "tenant", userId: "office", role: "office_admin" as const };
describe("monthly inspection list", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.tenant.findUnique.mockResolvedValue({ timezone: "America/Chicago" }); mocks.inspection.findMany.mockResolvedValue([]); });
  it("requires admin and tenant scope", async () => {
    await expect(getMonthlyInspectionList({ ...actor, role: "technician" })).rejects.toThrow();
    await expect(getMonthlyInspectionList({ ...actor, tenantId: null })).rejects.toThrow();
    expect(mocks.inspection.findMany).not.toHaveBeenCalled();
  });
  it("validates month and returns an empty exportable list", async () => {
    await expect(getMonthlyInspectionList(actor, "2026-13")).rejects.toThrow("valid month");
    expect((await getMonthlyInspectionList(actor, "2026-09")).rows).toEqual([]);
    expect(mocks.inspection.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "tenant", scheduledStart: { gte: new Date("2026-08-31T00:00:00Z"), lt: new Date("2026-10-02T00:00:00Z") } } }));
  });
  it("uses local month boundaries, includes completed jobs, and keeps separate IDs", async () => {
    const row = { status: "completed", inspectionClassification: "standard", isPriority: false, customerCompany: { name: "Customer" }, site: { name: "Site" }, assignedTechnician: { name: "Alex" }, technicianAssignments: [{ technician: { name: "Alex" } }], tasks: [] };
    mocks.inspection.findMany.mockResolvedValue([
      { ...row, id: "excluded", scheduledStart: new Date("2026-09-01T04:59:00Z") },
      { ...row, id: "first", scheduledStart: new Date("2026-09-01T05:00:00Z") },
      { ...row, id: "second", scheduledStart: new Date("2026-10-01T04:59:00Z") },
      { ...row, id: "excluded2", scheduledStart: new Date("2026-10-01T05:00:00Z") }
    ]);
    const result = await getMonthlyInspectionList(actor, "2026-09");
    expect(result.rows.map(r => r.id)).toEqual(["first", "second"]);
    expect(result.rows[0].values[6]).toBe("Completed");
    expect(result.rows[0].values[9]).toBe("Alex");
    expect(inspectionMonthKey(new Date("2026-12-01T05:30:00Z"), "America/Chicago")).toBe("2026-11");
  });
  it("quotes CSV cells and prevents spreadsheet formulas", () => {
    const csv = monthlyInspectionCsv([{ id: "id", values: ['A, "B"\nC', '=HYPERLINK("bad")', '  +123', '@formula'] }], "America/Chicago");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"A, ""B""\nC"');
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"\'  +123"');
    expect(csv).toContain('"\'@formula"');
    expect(monthlyInspectionCsv([], "UTC")).toContain("Inspection ID");
  });
  it("hides placeholder sites and uses real site, service or billing addresses without mixing them", async () => {
    const base = { scheduledStart: new Date("2026-09-10T14:00:00Z"), status: "scheduled", inspectionClassification: "standard", isPriority: false,
      assignedTechnician: null, technicianAssignments: [], tasks: [],
      customerCompany: { name: "Customer", serviceAddressLine1: "123 Service St", serviceCity: "Enid", serviceState: "OK", servicePostalCode: "73703", billingAddressLine1: "456 Billing Rd" },
      site: { name: "General / No Fixed Site", addressLine1: "No fixed service address", city: "Unknown", state: "Unknown", postalCode: "Unknown" } };
    mocks.inspection.findMany.mockResolvedValue([
      { ...base, id: "service" },
      { ...base, id: "real", site: { name: "Main campus", addressLine1: "789 Site Ave", city: "Tulsa" } },
      { ...base, id: "billing", customerCompany: { name: "Customer", billingAddressLine1: "456 Billing Rd" } },
      { ...base, id: "empty", customerCompany: { name: "Customer" } }
    ]);
    const { rows } = await getMonthlyInspectionList(actor, "2026-09");
    expect(rows.map(row => row.values[2])).toEqual(["", "Main campus", "", ""]);
    expect(rows.map(row => row.values[3])).toEqual(["123 Service St, Enid OK 73703", "789 Site Ave, Tulsa", "456 Billing Rd", ""]);
    const csv = monthlyInspectionCsv(rows, "America/Chicago");
    expect(csv).not.toContain("No fixed"); expect(csv).not.toContain("Unknown");
    expect(csv).toContain("123 Service St, Enid OK 73703");
  });
});
