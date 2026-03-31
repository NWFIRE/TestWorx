import { describe, expect, it } from "vitest";

import { buildInitialReportDraft } from "../report-engine";
import { getReportPdfMetadata, inspectionTypeRegistry } from "../report-config";

const additionalTypes = [
  "joint_commission_fire_sprinkler",
  "backflow",
  "fire_pump",
  "dry_fire_sprinkler",
  "kitchen_suppression",
  "industrial_suppression",
  "emergency_exit_lighting"
] as const;

describe("additional inspection report types", () => {
  it("builds structured drafts for each remaining inspection type", () => {
    for (const inspectionType of additionalTypes) {
      const template = inspectionTypeRegistry[inspectionType];
      const draft = buildInitialReportDraft({
        inspectionType,
        siteName: "Harbor Main Campus",
        customerName: "Harbor View Hospital",
        scheduledDate: "2026-04-01T08:00:00.000Z",
        assetCount: 5,
        priorReportSummary: "Previous annual inspection complete."
      });

      expect(template.sections.length).toBeGreaterThanOrEqual(1);
      expect(draft.sectionOrder).toHaveLength(template.sections.length);
      expect(draft.context.customerName).toBe("Harbor View Hospital");

      for (const section of template.sections) {
        expect(draft.sections[section.id]).toBeDefined();
        expect(Object.keys(draft.sections[section.id]?.fields ?? {})).toEqual(section.fields.map((field) => field.id));
      }
    }
  });

  it("provides centralized NFPA references for every supported report type", () => {
    for (const inspectionType of Object.keys(inspectionTypeRegistry) as Array<keyof typeof inspectionTypeRegistry>) {
      const metadata = getReportPdfMetadata(inspectionType);
      expect(Array.isArray(metadata.nfpaReferences)).toBe(true);
      expect((metadata.nfpaReferences ?? []).length).toBeGreaterThan(0);
    }
  });
});
