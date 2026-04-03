import { describe, expect, it } from "vitest";

import { runCalculation } from "../report-calculations";
import { resolveReportTemplate } from "../report-config";
import { resolveOptionProvider } from "../report-options";

describe("report definition pattern", () => {
  it("resolves shared option providers for extinguisher dropdowns through configuration", () => {
    const manufacturers = resolveOptionProvider("extinguisherManufacturers");
    const ulRatings = resolveOptionProvider("extinguisherUlRatings");

    expect(manufacturers.some((option) => option.value === "amerex")).toBe(true);
    expect(ulRatings.some((option) => option.value === "3-A:40-B:C")).toBe(true);
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
    })).toBe("KS-INSPECTION-LOW-RATE");

    expect(runCalculation("kitchenSuppressionInspectionCodeFromManufacturer", {
      sourceValues: ["captiveaire", ""]
    })).toBe("KS-INSPECTION-HIGH-RATE");

    expect(runCalculation("kitchenSuppressionInspectionCodeFromManufacturer", {
      sourceValues: ["ansul", ""]
    })).toBe("KS-INSPECTION-STANDARD");
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
