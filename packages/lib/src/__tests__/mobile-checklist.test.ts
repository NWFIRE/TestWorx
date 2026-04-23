import { buildDraftForTemplate, resolveReportTemplate } from "../report-engine";
import { buildMobileChecklistViewModel, isChecklistHeavyMobileInspectionType, mobileChecklistInspectionTypeAllowlist } from "../mobile-checklist";

describe("mobile checklist", () => {
  it("uses an explicit allowlist for the first-pass technician checklist flow", () => {
    expect(mobileChecklistInspectionTypeAllowlist).toEqual([
      "fire_alarm",
      "kitchen_suppression",
      "fire_extinguisher"
    ]);
    expect(isChecklistHeavyMobileInspectionType("fire_alarm")).toBe(true);
    expect(isChecklistHeavyMobileInspectionType("wet_chemical_acceptance_test")).toBe(false);
  });

  it("builds normalized checklist items for fire alarm drafts", () => {
    const template = resolveReportTemplate({ inspectionType: "fire_alarm", assets: [] });
    const draft = buildDraftForTemplate({
      inspectionType: "fire_alarm",
      siteDefaults: {},
      tenantBrandingDefaults: {},
      assets: []
    });

    draft.sections["control-panel"] = {
      ...draft.sections["control-panel"],
      status: "pass",
      fields: {
        ...draft.sections["control-panel"]?.fields,
        acPowerIndicator: "yes",
        batteryLoadTest: "fail"
      }
    };

    const model = buildMobileChecklistViewModel(template, draft);
    const acPower = model.items.find((item) => item.id === "control-panel:acPowerIndicator");
    const batteryLoad = model.items.find((item) => item.id === "control-panel:batteryLoadTest");

    expect(acPower?.status).toBe("positive");
    expect(acPower?.supportsNotApplicable).toBe(true);
    expect(batteryLoad?.status).toBe("negative");
  });

  it("maps repeater checklist rows and carries row companion fields", () => {
    const template = resolveReportTemplate({ inspectionType: "fire_extinguisher", assets: [] });
    const draft = buildDraftForTemplate({
      inspectionType: "fire_extinguisher",
      siteDefaults: {},
      tenantBrandingDefaults: {},
      assets: []
    });

    draft.sections.inventory = {
      ...draft.sections.inventory,
      status: "pass",
      fields: {
        ...draft.sections.inventory?.fields,
        extinguishers: [
          {
            __rowId: "row_1",
            assetTag: "EXT-100",
            location: "Lobby",
            gaugeStatus: "pass",
            mountingSecure: "fail",
            notes: "Bracket loose"
          }
        ]
      }
    };

    const model = buildMobileChecklistViewModel(template, draft);
    const gaugeStatus = model.items.find((item) => item.id === "inventory:extinguishers:row_1:gaugeStatus");
    const mountingSecure = model.items.find((item) => item.id === "inventory:extinguishers:row_1:mountingSecure");

    expect(gaugeStatus?.groupLabel).toContain("EXT-100");
    expect(gaugeStatus?.supportsNotApplicable).toBe(false);
    expect(mountingSecure?.status).toBe("negative");
    expect(mountingSecure?.noteFieldId).toBe("notes");
    expect(mountingSecure?.noteValue).toBe("Bracket loose");
  });
});
