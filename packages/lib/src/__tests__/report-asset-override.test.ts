import { describe, expect, it } from "vitest";
import { validateDraftForTemplate, applyRepeaterRowSmartUpdate } from "../report-engine";
import { resolveReportTemplate } from "../report-config";

describe("saved report asset overrides", () => {
  it("preserves a technician location through validation but maps a newly selected asset", () => {
    const assets = [{ id: "asset-a", name: "Extinguisher", assetTag: "EXT-A", metadata: { location: "Asset lobby", manufacturer: "amerex" } }];
    const draft = { templateVersion: 1, inspectionType: "fire_extinguisher", overallNotes: "", sectionOrder: ["inventory"], activeSectionId: "inventory",
      sections: { inventory: { status: "pending", notes: "", fields: { extinguishers: [{ assetId: "asset-a", location: "Service entrance", extinguisherType: "5_lb_abc" }] } } }, deficiencies: [], attachments: [], signatures: {}, context: { siteName: "Site", customerName: "Customer", scheduledDate: "2026-11-25", assetCount: 1, priorReportSummary: "" } };
    const saved = validateDraftForTemplate(draft, "fire_extinguisher", assets);
    expect((saved.sections.inventory.fields.extinguishers as any[])[0].location).toBe("Service entrance");
    const template = resolveReportTemplate({ inspectionType: "fire_extinguisher", assets });
    const selected = applyRepeaterRowSmartUpdate(template, "inventory", "extinguishers", { assetId: "asset-a", location: "Previous asset" }, "assetId");
    expect(selected.location).toBe("Asset lobby");
  });
});
