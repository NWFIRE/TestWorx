import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { buildReportRenderModelFromDraft } from "./adapters/from-report-draft";
import { renderPageOneV2 } from "./page-one";
import { addPage, buildRuntime } from "./page-shell";
import { resolveReportTypeConfigV2, supportsPdfV2 } from "./registry";
import { renderChecklistSection } from "./sections/checklist";
import { renderCompactMetricsSection } from "./sections/compact-metrics";
import { renderFindingsSection } from "./sections/findings";
import { renderKeyValueSection } from "./sections/key-value";
import { renderNotesSection } from "./sections/notes";
import { renderPhotosSection } from "./sections/photos";
import { renderSignaturesSection } from "./sections/signatures";
import { renderTableSection } from "./sections/table";
import type { PdfInput } from "./types";
import { resolveTenantBranding } from "../branding";
import { formatReportReference } from "../report-reference";
import { splitTextIntoLines } from "./page-shell";

export * from "./types";
export * from "./formatters";
export * from "./status";
export * from "./compliance";
export * from "./indicators";
export * from "./render-model";
export * from "./registry";

async function generateLegacyInspectionReportPdfV2(input: PdfInput) {
  const model = buildReportRenderModelFromDraft(input);
  const runtime = await buildRuntime(model);
  let cursor = addPage(runtime, 1);

  cursor = renderPageOneV2(runtime, cursor);

  for (const section of model.sections) {
    switch (section.renderer) {
      case "keyValue":
        cursor = renderKeyValueSection(runtime, cursor, section);
        break;
      case "compactMetrics":
        cursor = renderCompactMetricsSection(runtime, cursor, section);
        break;
      case "table":
        cursor = renderTableSection(runtime, cursor, section);
        break;
      case "checklist":
        cursor = renderChecklistSection(runtime, cursor, section);
        break;
      case "findings":
        cursor = renderFindingsSection(runtime, cursor, section);
        break;
      case "notes":
        cursor = renderNotesSection(runtime, cursor, section);
        break;
      case "photos":
        cursor = await renderPhotosSection(runtime, cursor, section);
        break;
      case "signatures":
        cursor = await renderSignaturesSection(runtime, cursor, section);
        break;
    }
  }

  return runtime.pdfDoc.save({ useObjectStreams: false });
}

export async function generateInspectionReportPdfV2(input: PdfInput) {
  let bytes: Uint8Array;
  if (input.task.inspectionType === "fire_alarm") {
    const { renderFireAlarmPdf } = await import("./fire-alarm");
    bytes = await renderFireAlarmPdf(input);
  } else if (input.task.inspectionType === "wet_chemical_acceptance_test") {
    const { renderAcceptanceTestPdf } = await import("./acceptance-test");
    bytes = await renderAcceptanceTestPdf(input);
  } else {
    bytes = await generateLegacyInspectionReportPdfV2(input);
  }
  // Count physical pages after both rendering engines finish, including overflow pages.
  const document = await PDFDocument.load(bytes);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const htmlReport = input.task.inspectionType === "fire_alarm" || input.task.inspectionType === "wet_chemical_acceptance_test";
  const branding = resolveTenantBranding({ tenantName: input.tenant.name, branding: input.tenant.branding });
  document.getPages().forEach((page, index) => {
    if (htmlReport && index > 0) {
      const heading = `${branding.legalBusinessName} | ${formatReportReference(input.report)}`;
      const lines = splitTextIntoLines(font, heading, page.getWidth() - 80, 7);
      lines.forEach((line, lineIndex) => page.drawText(line, { x: 40, y: page.getHeight() - 13 - lineIndex * 8, size: 7, font, color: rgb(.25, .3, .36) }));
    }
    const label = `Page ${index + 1} of ${document.getPageCount()}`;
    page.drawText(label, { x: (page.getWidth() - font.widthOfTextAtSize(label, 8)) / 2, y: 16, size: 8, font, color: rgb(.25, .3, .36) });
  });
  return document.save({ useObjectStreams: false });
}

export function resolvePdfVersionForInspectionType(inspectionType: PdfInput["task"]["inspectionType"]) {
  return resolveReportTypeConfigV2(inspectionType) ? "v2" : "legacy";
}

export { supportsPdfV2 };
