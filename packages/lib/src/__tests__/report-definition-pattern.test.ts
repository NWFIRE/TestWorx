import { describe, expect, it } from "vitest";

import { runCalculation } from "../report-calculations";
import { resolveReportTemplate } from "../report-config";
import { resolveOptionProvider } from "../report-options";

describe("report definition pattern", () => {
  it("resolves shared option providers for extinguisher dropdowns through configuration", () => {
    const manufacturers = resolveOptionProvider("extinguisherManufacturers");
    const ulRatings = resolveOptionProvider("extinguisherUlRatings");
    const workOrderParts = resolveOptionProvider("workOrderPartsEquipmentOptions");
    const workOrderServices = resolveOptionProvider("workOrderServiceOptions");

    expect(manufacturers.some((option) => option.value === "amerex")).toBe(true);
    expect(ulRatings.some((option) => option.value === "3-A:40-B:C")).toBe(true);
    expect(workOrderParts.some((option) => option.label === "5 lb ABC")).toBe(true);
    expect(workOrderParts.some((option) => option.label === "Exit Sign")).toBe(true);
    expect(workOrderServices.some((option) => option.label === "Recharge")).toBe(true);
  });

  it("uses configuration-driven calculations for report fields", () => {
    expect(runCalculation("assetCountFromRepeater", {
      sourceRows: [
        { assetId: "asset_1" },
        { assetId: "asset_2" }
      ]
    })).toBe(2);

    expect(runCalculation("inspectionIntervalFromServiceType", {
      sourceValue: "hydro"
    })).toBe("12 years");

    expect(runCalculation("kitchenSuppressionInspectionCodeFromManufacturer", {
      sourceValues: ["guardian", ""]
    })).toBe("KS-INSPECTION-GUARDIAN/DENLAR");

    expect(runCalculation("kitchenSuppressionInspectionCodeFromManufacturer", {
      sourceValues: ["captiveaire", ""]
    })).toBe("KS-INSPECTION-CAPTIVEAIRE");

    expect(runCalculation("kitchenSuppressionInspectionCodeFromManufacturer", {
      sourceValues: ["ansul", ""]
    })).toBe("KS-INSPECTION");
  });

  it("keeps work orders as a simple single-page field workflow without tag or follow-up sections", () => {
    const template = resolveReportTemplate({ inspectionType: "work_order", assets: [] });

    expect(template.sections.map((section) => section.id)).toEqual([
      "work-performed",
      "parts-equipment-used",
      "work-order-photos"
    ]);
    expect(template.sections.some((section) => section.id === "tag-status")).toBe(false);
    expect(template.sections.flatMap((section) => section.fields.map((field) => field.id))).not.toContain("followUpRequired");

    const workPerformed = template.sections.find((section) => section.id === "work-performed");
    expect(workPerformed?.fields.map((field) => field.id)).toEqual(["descriptionOfWork", "jobsiteHours"]);
    const laborHours = workPerformed?.fields.find((field) => field.id === "jobsiteHours");
    expect(laborHours?.type).toBe("select");
    expect(laborHours && "options" in laborHours ? laborHours.options?.map((option) => option.value) : []).toEqual(expect.arrayContaining(["1", "1.5", "2", "2.5", "3", "3.5"]));
  });

  it("defines fire extinguisher smart fields entirely through flat configuration keys", () => {
    const template = resolveReportTemplate({
      inspectionType: "fire_extinguisher",
      assets: [
        {
          id: "asset_1",
          name: "Lobby extinguisher",
          assetTag: "EXT-100",
          metadata: { manufacturer: "amerex", ulRating: "2a_10bc", location: "Lobby" }
        }
      ]
    });

    const inventorySection = template.sections.find((section) => section.id === "inventory");
    const repeaterField = inventorySection?.fields.find((field) => field.id === "extinguishers");
    const unitsInspectedField = inventorySection?.fields.find((field) => field.id === "unitsInspected");

    expect(repeaterField?.type).toBe("repeater");
    expect(repeaterField && "repeatableSource" in repeaterField ? repeaterField.repeatableSource : undefined).toBe("siteAssets");
    expect(repeaterField && "validation" in repeaterField ? repeaterField.validation?.[0]?.type : undefined).toBe("minRows");
    expect(unitsInspectedField?.type).toBe("number");
    expect(unitsInspectedField?.calculation?.key).toBe("assetCountFromRepeater");
    expect(unitsInspectedField?.readOnly).toBe(true);
  });
});
