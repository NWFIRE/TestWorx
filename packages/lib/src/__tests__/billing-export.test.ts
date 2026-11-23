import { describe, expect, it } from "vitest";
import { buildBillingExportCsv } from "../billing-export";

describe("provider-neutral billing export", () => {
  it("exports quantities and source IDs without prices or tax totals", () => {
    const csv = buildBillingExportCsv({ customerName: "Acme", siteName: "Main", inspectionId: "visit1", items: [
      { id: "line1", category: "service", description: 'Inspect "A", then B\nNote', quantity: 2.5, unit: "hours", reportId: "report1" }
    ] });
    expect(csv).toContain('"Inspect ""A"", then B\nNote"');
    expect(csv).toContain('"2.5","hours","","report1"');
    expect(csv).not.toMatch(/price|tax|subtotal/i);
  });
  it("neutralizes formulas in customer and line text", () => {
    const csv = buildBillingExportCsv({ customerName: "=CMD()", siteName: "+site", inspectionId: "id", items: [
      { id: "line", category: "service", description: "  @SUM(A1)", quantity: 1, reportId: "report" }
    ] });
    expect(csv).toContain('"\'=CMD()"');
    expect(csv).toContain('"\'+site"');
    expect(csv).toContain('"\'  @SUM(A1)"');
  });
});
