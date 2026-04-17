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
    expect(serialized).not.toContain("Na");
    expect(serialized).not.toContain("raw-filename-photo.jpg");
  });

  it("keeps notification modality type-aware", () => {
    const model = buildFireAlarmRenderModel(fireAlarmSample);
    const strobeOnly = model.notificationAppliancesSection.rows.find((row) => /strobe/i.test(row.applianceType) && !/horn/i.test(row.applianceType));
    const hornStrobe = model.notificationAppliancesSection.rows.find((row) => /horn strobe/i.test(row.applianceType));

    expect(strobeOnly?.audibleOperation).toBeUndefined();
    expect(strobeOnly?.visibleOperation).toBe("Pass");
    expect(hornStrobe?.audibleOperation).toBe("Pass");
    expect(hornStrobe?.visibleOperation).toBe("Pass");
  });

  it("renders page one in the locked order with compliance visible", async () => {
    const model = buildFireAlarmRenderModel(fireAlarmSample);
    const html = await renderPdfHtml(createElement(FireAlarmReportDocument, { model }));

    const outcomeIndex = html.indexOf("Inspection outcome");
    const complianceIndex = html.indexOf("Compliance Standards");
    const identityIndex = html.indexOf("Customer and site");
    const metricsIndex = html.indexOf("Control Panels");

    expect(outcomeIndex).toBeGreaterThan(-1);
    expect(complianceIndex).toBeGreaterThan(outcomeIndex);
    expect(identityIndex).toBeGreaterThan(complianceIndex);
    expect(metricsIndex).toBeGreaterThan(identityIndex);
    expect(html).toContain("NFPA 72");
    expect(html).toContain("NFPA 70");
    expect(html).not.toContain("raw-filename-photo.jpg");
  });
});
