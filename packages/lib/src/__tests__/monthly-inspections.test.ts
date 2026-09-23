import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ tenant: { findUnique: vi.fn() }, inspection: { findMany: vi.fn() } }));
vi.mock("@testworx/db", () => ({ prisma: mocks }));
vi.mock("../scheduling", () => ({ formatInspectionTaskSummary: () => "Fire alarm", formatInspectionStatusLabel: (s: string) => s, formatInspectionClassificationLabel: (s: string) => s }));
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
    expect(result.rows[0].values[6]).toBe("completed");
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
});
