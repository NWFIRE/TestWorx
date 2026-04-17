import type { PdfInput, ReportRenderModelV2 } from "../types";
import { buildReportRenderModelV2 } from "../render-model";

export function buildReportRenderModelFromDraft(input: PdfInput): ReportRenderModelV2 {
  return buildReportRenderModelV2(input);
}
