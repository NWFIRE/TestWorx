import { createElement } from "react";
import { describe, expect, it } from "vitest";

import acceptanceTestSample from "../pdf-v2/acceptance-test/fixtures/acceptanceTest.sample.json";
import { buildAcceptanceTestRenderModel } from "../pdf-v2/acceptance-test/adapter/buildAcceptanceTestRenderModel";
import { AcceptanceTestDocument } from "../pdf-v2/acceptance-test/templates/AcceptanceTestDocument";
import { renderPdfHtml } from "../pdf-v2/core/renderer/renderHtml";

describe("acceptance test pdf v2", () => {
  it("uses installer defaults and branding without placeholder leakage", () => {
    const model = buildAcceptanceTestRenderModel(acceptanceTestSample);
    const serialized = JSON.stringify(model);

    expect(model.installer.companyName).toBe("Northwest Fire & Safety");
    expect(model.installer.licenseNumber).toBe("OK #466");
    expect(model.report.result).toBe("Pass");
    expect(serialized).not.toContain("Unknown Unknown");
    expect(serialized).not.toContain("\"comments\":\"—\"");
    expect(serialized).not.toContain("Na");
  });

  it("fails the overall result when any required test fails", () => {
    const sample = structuredClone(acceptanceTestSample);
    sample.draft.sections["test-results"].fields.properAlarmOperation = "No";

    const model = buildAcceptanceTestRenderModel(sample);

    expect(model.report.result).toBe("Fail");
    expect(model.summary.failed).toBe(1);
    expect(model.report.narrative).toMatch(/requiring correction/i);
  });

  it("renders the locked section order with a single result system", async () => {
    const model = buildAcceptanceTestRenderModel(acceptanceTestSample);
    const html = await renderPdfHtml(createElement(AcceptanceTestDocument, { model }));

    const outcomeIndex = html.indexOf("Outcome");
    const propertyIndex = html.indexOf("Property Information");
    const installerIndex = html.indexOf("Installer Information");
    const systemIndex = html.indexOf("System Information");
    const resultsIndex = html.indexOf("Acceptance Test Results");
    const summaryIndex = html.indexOf("Total Tests");
    const witnessIndex = html.indexOf("Witness Information");
    const commentsIndex = html.indexOf("Additional Comments");
    const signaturesIndex = html.indexOf("Signatures");

    expect(outcomeIndex).toBeGreaterThan(-1);
    expect(propertyIndex).toBeGreaterThan(outcomeIndex);
    expect(installerIndex).toBeGreaterThan(propertyIndex);
    expect(systemIndex).toBeGreaterThan(installerIndex);
    expect(resultsIndex).toBeGreaterThan(systemIndex);
    expect(summaryIndex).toBeGreaterThan(resultsIndex);
    expect(witnessIndex).toBeGreaterThan(summaryIndex);
    expect(commentsIndex).toBeGreaterThan(witnessIndex);
    expect(signaturesIndex).toBeGreaterThan(commentsIndex);
    expect(html).toContain("NFPA 17A");
    expect(html).toContain(">Result<");
    expect(html).not.toContain(">Pass / Fail<");
    expect(html).not.toContain(">Yes / No<");
    expect(html).toContain("No additional comments.");
  });
});
