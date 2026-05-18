import { createElement } from "react";
import { describe, expect, it } from "vitest";

import fireAlarmSample from "../pdf-v2/fire-alarm/fixtures/fireAlarm.sample.json";
import { renderPdfHtml } from "../pdf-v2/core/renderer/renderHtml";
import { buildFireAlarmRenderModel } from "../pdf-v2/fire-alarm/adapter/buildFireAlarmRenderModel";
import { FireAlarmReportDocument } from "../pdf-v2/fire-alarm/templates/FireAlarmReportDocument";

describe("fire alarm pdf v2", () => {
  it("normalizes finalized reports away from in-progress wording", () => {
    const model = buildFireAlarmRenderModel(fireAlarmSample);

    expect(model.report.documentStatus).toBe("Finalized");
    expect(model.report.narrative).not.toMatch(/in progress/i);
  });

  it("suppresses placeholder leakage and raw photo filenames", () => {
    const model = buildFireAlarmRenderModel(fireAlarmSample);
    const serialized = JSON.stringify(model);

    expect(serialized).not.toContain("Unknown Unknown");
    expect(serialized).not.toContain("—");
    expect(serialized).not.toContain("\"Na\"");
    expect(serialized).not.toContain("raw-filename-photo.jpg");
  });

  it("falls back to the customer address when the site is generic", () => {
    const model = buildFireAlarmRenderModel({
      ...fireAlarmSample,
      customerCompany: {
        ...fireAlarmSample.customerCompany,
        serviceAddressLine1: "700 Hospital Service Dr",
        serviceAddressLine2: "Building B",
        serviceCity: "Enid",
        serviceState: "OK",
        servicePostalCode: "73701"
      },
      site: {
        ...fireAlarmSample.site,
        name: "General / No Fixed Site",
        addressLine1: "No fixed service address",
        addressLine2: null,
        city: "Unknown",
        state: "Unknown",
        postalCode: "Unknown"
      }
    });

    expect(model.identity.cleanAddress).toBe("700 Hospital Service Dr, Building B, Enid OK 73701");
    expect(model.page1Metadata.some((item) => item.label === "Service address" && item.value.includes("700 Hospital Service Dr"))).toBe(true);
  });

  it("keeps notification modality type-aware", () => {
    const model = buildFireAlarmRenderModel(fireAlarmSample);
    const strobeOnly = model.notificationAppliancesSection.rows.find((row) => /strobe/i.test(row.applianceType) && !/horn/i.test(row.applianceType));
    const hornStrobe = model.notificationAppliancesSection.rows.find((row) => /horn[_ ]strobe/i.test(row.applianceType));

    expect(strobeOnly?.audibleOperation).toBeUndefined();
    expect(strobeOnly?.visibleOperation).toBe("Pass");
    expect(hornStrobe?.audibleOperation).toBe("Pass");
    expect(hornStrobe?.visibleOperation).toBe("Pass");
  });

  it("renders page one in the locked order with compliance visible", async () => {
    const model = buildFireAlarmRenderModel(fireAlarmSample);
    const html = await renderPdfHtml(createElement(FireAlarmReportDocument, { model }));

    const outcomeIndex = html.indexOf("Inspection outcome");
    const complianceIndex = html.indexOf("Applicable Codes, Standards");
    const identityIndex = html.indexOf("Customer and site");
    const metricsIndex = html.indexOf("Control Panels");

    expect(outcomeIndex).toBeGreaterThan(-1);
    expect(complianceIndex).toBeGreaterThan(outcomeIndex);
    expect(identityIndex).toBeGreaterThan(complianceIndex);
    expect(metricsIndex).toBeGreaterThan(identityIndex);
    expect(html).toContain("NFPA 72 (2025 Edition)");
    expect(html).toContain("NFPA 70 (2026 Edition)");
    expect(html).not.toContain("raw-filename-photo.jpg");
  });
});
