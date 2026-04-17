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
import { renderFireAlarmPdf } from "./fire-alarm";
import type { PdfInput } from "./types";

export * from "./types";
export * from "./formatters";
export * from "./status";
export * from "./compliance";
export * from "./indicators";
export * from "./render-model";
export * from "./registry";
export * from "./fire-alarm";

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
  if (input.task.inspectionType === "fire_alarm") {
    return renderFireAlarmPdf(input);
  }

  return generateLegacyInspectionReportPdfV2(input);
}

export function resolvePdfVersionForInspectionType(inspectionType: PdfInput["task"]["inspectionType"]) {
  return resolveReportTypeConfigV2(inspectionType) ? "v2" : "legacy";
}

export { supportsPdfV2 };
