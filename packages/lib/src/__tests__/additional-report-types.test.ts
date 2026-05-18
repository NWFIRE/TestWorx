import { describe, expect, it } from "vitest";

import { buildInitialReportDraft } from "../report-engine";
import { getReportPdfMetadata, inspectionTypeRegistry } from "../report-config";

const additionalTypes = [
  "joint_commission_fire_alarm",
  "joint_commission_fire_sprinkler",
  "work_order",
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
      expect(draft.sectionOrder).toEqual(expect.arrayContaining(template.sections.map((section) => section.id)));
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

  it("defines a healthcare-ready smart Joint Commission fire alarm template", () => {
    const template = inspectionTypeRegistry.joint_commission_fire_alarm;

    expect(template.label).toBe("Joint Commission fire alarm");
    expect(template.sections.map((section) => section.id)).toEqual([
      "inspection-information",
      "joint-commission-compliance-summary",
      "fire-alarm-system-information",
      "device-testing-summary",
      "fire-alarm-control-unit-testing",
      "notification-appliance-testing",
      "smoke-detector-sensitivity-testing",
      "elevator-recall-testing",
      "sprinkler-monitoring-interface",
      "central-station-communication",
      "deficiencies-and-recommendations",
      "joint-commission-documentation-review",
      "technician-notes",
      "customer-acknowledgment",
      "technician-certification",
      "final-outcome",
      "follow-up-actions",
      "attachments"
    ]);

    const systemInfo = template.sections.find((section) => section.id === "fire-alarm-system-information");
    expect(systemInfo?.fields.find((field) => field.id === "manufacturer")?.optionProvider).toBe("jointCommissionFireAlarmManufacturerOptions");
    expect(systemInfo?.fields.find((field) => field.id === "panelModel")?.optionProvider).toBe("jointCommissionFireAlarmPanelModelOptions");

    const deviceSummary = template.sections.find((section) => section.id === "device-testing-summary");
    const deviceRepeater = deviceSummary?.fields.find((field) => field.id === "deviceCategories");
    expect(deviceRepeater?.type).toBe("repeater");
    expect(deviceRepeater && deviceRepeater.type === "repeater" ? deviceRepeater.seedRows?.length : 0).toBeGreaterThanOrEqual(12);
    expect(deviceRepeater && deviceRepeater.type === "repeater"
      ? deviceRepeater.rowFields.find((field) => field.id === "category")?.optionProvider
      : null).toBe("jointCommissionFireAlarmDeviceTypeOptions");

    const metadata = getReportPdfMetadata("joint_commission_fire_alarm");
    expect(metadata.nfpaReferences).toEqual([
      "NFPA 72 (2025 Edition) - National Fire Alarm and Signaling Code",
      "NFPA 101 (2024 Edition) - Life Safety Code",
      "CMS Life Safety Code - Current adopted healthcare life safety requirements",
      "Joint Commission EC.02.03.05 - Fire protection systems documentation"
    ]);
  });
});
