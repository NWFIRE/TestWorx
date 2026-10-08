import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildInitialReportDraft, collectFinalizationValidationIssues, validateDraftForTemplate, validateFinalizationDraft } from "../report-engine";
import { vehicleSuppressionReportTemplate as template } from "../vehicle-suppression-report";
import { extractBillableItemsFromDraft } from "../inspection-billing";
import { buildReportRenderModelV2, generateInspectionReportPdfV2 } from "../pdf-v2";
import type { PdfInput } from "../pdf-v2/types";

export function vehicleDraft() {
  return buildInitialReportDraft({ inspectionType: "vehicle_suppression", siteName: "Fleet depot", customerName: "Example Fleet", scheduledDate: "2026-10-08T14:00:00.000Z", assetCount: 0 });
}

export function completedVehicleDraft() {
  const draft = vehicleDraft();
  Object.assign(draft.sections["vehicle-information"].fields, {
    vehicleId: "UNIT-42", vehicleModel: "Fleet service truck", manufacturer: "Amerex", systemModel: "VS",
    serviceDate: "2026-10-08", timeIn: "9:00 AM", serviceScope: "semi_annual", tagStatus: "green",
    manualReference: "Installed system manual", technicianLicense: "EXAMPLE-123"
  });
  draft.sections["agent-cylinders"].fields.cylinders = [{ cylinderId: "CYL-42", typeSizeModel: "Dry chemical / 25 lb / VS", manufactured: "2024", lastSixYear: "Not yet due", lastHydro: "2024", notes: "Rear compartment" }];
  Object.assign(draft.sections["detection-controls"].fields, { controlPanel: "amgads_iii_plus", panelModelSerial: "PANEL-42", devices: [{ deviceType: "thermostat_350", quantity: 4, notes: "Engine compartment" }, { deviceType: "manual_switch", quantity: 1, notes: "Cab" }] });
  for (const section of template.sections.filter((entry) => entry.pdfDisplayType === "checklist")) {
    for (const field of section.fields.filter((field) => field.type === "select")) draft.sections[section.id].fields[field.id] = "pass";
  }
  Object.assign(draft.sections["service-findings"].fields, { controlHeadReplaced: "na", controlHeadChecked: "yes", serviceNotes: "Inspection completed; no deficiencies observed." });
  const imageDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=";
  draft.signatures = { technician: { signerName: "Example Technician", imageDataUrl, signedAt: "2026-10-08T15:00:00.000Z" }, customer: { signerName: "Example Customer", imageDataUrl, signedAt: "2026-10-08T15:01:00.000Z" } };
  return draft;
}

export function vehiclePdfInput(): PdfInput {
  const draft = completedVehicleDraft();
  return {
    tenant: { name: "Example Inspection Company", branding: {}, timezone: "America/Chicago" },
    customerCompany: { name: "Example Fleet", contactName: "Example Customer", phone: null, billingEmail: null },
    site: { name: "Fleet depot", addressLine1: "100 Example Street", addressLine2: null, city: "Example City", state: "OK", postalCode: "73000" },
    inspection: { id: "example-vehicle-inspection", scheduledStart: new Date("2026-10-08T14:00:00Z"), scheduledEnd: null, status: "completed", notes: null },
    task: { inspectionType: "vehicle_suppression" }, report: { id: "example-vehicle-report", finalizedAt: new Date("2026-10-08T15:01:00Z"), technicianName: "Example Technician" },
    draft, deficiencies: [], photos: [], technicianSignature: draft.signatures.technician!, customerSignature: draft.signatures.customer!
  };
}

describe("vehicle fire suppression shared report", () => {
  it("starts with unanswered checks and no sample customer data", () => {
    const draft = vehicleDraft();
    expect(template.sections.filter((section) => section.pdfDisplayType === "checklist").map((section) => section.fields.filter((field) => field.type === "select").length)).toEqual([2, 11, 29]);
    expect(JSON.stringify(draft)).not.toMatch(/Waste Connections|APS Fire|MH700853/);
    expect(draft.signatures).toEqual({});
    expect(collectFinalizationValidationIssues(draft).length).toBeGreaterThan(40);
  });

  it("validates completed reports and preserves saved values through normalization", () => {
    const draft = validateDraftForTemplate(completedVehicleDraft(), "vehicle_suppression");
    expect(validateFinalizationDraft(draft)).toBe(true);
    expect(draft.sections["vehicle-information"].fields.vehicleId).toBe("UNIT-42");
    expect(draft.sections["agent-cylinders"].fields.cylinders).toHaveLength(1);
    draft.sections["vehicle-information"].fields.serviceScope = "other";
    expect(collectFinalizationValidationIssues(draft).some((issue) => issue.message.includes("Other service description"))).toBe(true);
    expect(() => validateDraftForTemplate(draft, "fire_alarm")).toThrow(/does not match/);
  });

  it("carries equipment forward but never prior test results or signatures", () => {
    const draft = buildInitialReportDraft({ inspectionType: "vehicle_suppression", siteName: "Fleet depot", customerName: "Example Fleet", scheduledDate: "2027-04-08T14:00:00Z", assetCount: 0, priorCompletedDraft: completedVehicleDraft() });
    expect(draft.sections["vehicle-information"].fields.vehicleId).toBe("UNIT-42");
    expect(draft.sections["agent-cylinders"].fields.cylinders).toHaveLength(1);
    expect(draft.sections["detection-controls"].fields.devices).toHaveLength(2);
    expect(draft.sections["daily-inspection"].fields.panelPower).not.toBe("pass");
    expect(draft.sections["vehicle-information"].fields.serviceDate).not.toBe("2026-10-08");
    expect(draft.signatures).toEqual({});
  });

  it("bills one vehicle inspection, not the equipment inventory", () => {
    const items = extractBillableItemsFromDraft({ tenantId: "tenant-1", inspectionId: "inspection-1", reportId: "report-1", reportType: "vehicle_suppression", draft: completedVehicleDraft() });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ category: "service", quantity: 1, code: "VEHICLE_FIRE_SUPPRESSION_INSPECTION" });
  });

  it("allows documented failures and preserves notes and N/A answers on the PDF", () => {
    const input = vehiclePdfInput();
    input.draft.sections["daily-inspection"].fields.panelPower = "fail";
    expect(() => validateFinalizationDraft(input.draft)).toThrow(/needs a note/);
    input.draft.sections["daily-inspection"].fields.notes = "Panel power absent; customer advised and corrective work requested.";
    input.draft.sections["monthly-inspection"].fields.reservoirPressure = "na";
    expect(validateFinalizationDraft(input.draft)).toBe(true);
    const json = JSON.stringify(buildReportRenderModelV2(input));
    expect(json).toContain("Panel power absent");
    expect(json).toContain("Not applicable");
  });

  it("renders equipment, every checklist and shared signatures to PDF", async () => {
    const input = vehiclePdfInput();
    const model = buildReportRenderModelV2(input);
    for (const section of template.sections) expect([model.systemSummary, ...model.sections].some((entry) => entry?.key === section.id || entry?.key.startsWith(`${section.id}__`)), section.id).toBe(true);
    const json = JSON.stringify(model);
    expect(json).toContain("UNIT-42");
    expect(json).toContain("CYL-42");
    expect(json).toContain("Example Technician");
    expect(json).toContain("Not applicable");
    expect(json).toContain("350-degree thermostat");
    expect(json).toContain("EXAMPLE-123");
    expect(json).not.toContain("Oct 7, 2026");
    expect(json).not.toContain("Waste Connections");
    const bytes = await generateInspectionReportPdfV2(input);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });
});
