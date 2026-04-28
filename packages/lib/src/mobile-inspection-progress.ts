import type { InspectionType } from "@testworx/types";

import type { ReportDraft, ReportPreview } from "./report-engine";
import { buildReportPreview, isFieldVisible } from "./report-engine";
import type { ReportFieldDefinition, ReportPrimitiveValue, ReportTemplateDefinition } from "./report-config";

export type MobileInspectionSectionStatus =
  | "not_started"
  | "in_progress"
  | "complete"
  | "needs_review";

export type MobileInspectionSectionProgress = {
  sectionId: string;
  sectionLabel: string;
  status: MobileInspectionSectionStatus;
  completedCount: number | null;
  totalCount: number | null;
  percent: number | null;
  issueCount: number;
  hasMeaningfulInput: boolean;
};

export type MobileInspectionProgressSummary = {
  sections: MobileInspectionSectionProgress[];
  completedCount: number | null;
  totalCount: number | null;
  percent: number | null;
  hasMeaningfulProgress: boolean;
  reportStatus: "Not Started" | "In Progress" | "Ready" | "Finalized";
  preview: ReportPreview;
};

const negativeSelectValues = new Set(["fail", "deficiency", "damaged", "attention", "poor", "low", "high", "needs_repair", "no"]);

function isEmptyValue(value: ReportPrimitiveValue | undefined) {
  return value === null || value === undefined || value === "";
}

function isMeaningfulValue(field: Exclude<ReportFieldDefinition, { type: "repeater" }>, value: ReportPrimitiveValue | undefined) {
  if (isEmptyValue(value)) {
    return false;
  }

  if (field.type === "boolean" && value === false) {
    return false;
  }

  return !isOnlyConfiguredDefault(field, value);
}

function isProgressCountedScalarField(field: Exclude<ReportFieldDefinition, { type: "repeater" }>) {
  return !field.hidden && !field.readOnly && field.type === "select";
}

function isMeaningfulScalarField(field: Exclude<ReportFieldDefinition, { type: "repeater" }>) {
  return !field.hidden && !field.readOnly && field.type !== "photo";
}

function getReportDefaultValue(field: Exclude<ReportFieldDefinition, { type: "repeater" }>) {
  return field.prefill?.find((prefill) => prefill.source === "reportDefault")?.value;
}

function isOnlyConfiguredDefault(
  field: Exclude<ReportFieldDefinition, { type: "repeater" }>,
  value: ReportPrimitiveValue | undefined
) {
  const defaultValue = getReportDefaultValue(field);
  return !isEmptyValue(defaultValue) && value === defaultValue;
}

function getRepeaterRows(
  fields: Record<string, ReportPrimitiveValue> | undefined,
  fieldId: string
) {
  return Array.isArray(fields?.[fieldId])
    ? fields?.[fieldId] as unknown as Array<Record<string, ReportPrimitiveValue>>
    : [];
}

function buildSectionIssueCount(
  section: ReportTemplateDefinition["sections"][number],
  sectionFields: Record<string, ReportPrimitiveValue> | undefined,
  previewSection: ReportPreview["sectionSummaries"][number] | undefined
) {
  const derivedFieldCount = section.fields
    .filter((field): field is Exclude<ReportFieldDefinition, { type: "repeater" }> => field.type !== "repeater")
    .filter((field) => !field.hidden && !field.readOnly && field.type === "select")
    .reduce((count, field) => {
      const value = String(sectionFields?.[field.id] ?? "").toLowerCase();
      return negativeSelectValues.has(value) ? count + 1 : count;
    }, 0);

  return Math.max(previewSection?.deficiencyCount ?? 0, derivedFieldCount);
}

function buildSectionProgress(
  section: ReportTemplateDefinition["sections"][number],
  draft: ReportDraft,
  previewSection: ReportPreview["sectionSummaries"][number] | undefined
): MobileInspectionSectionProgress {
  const sectionState = draft.sections[section.id];
  const sectionFields = sectionState?.fields as Record<string, ReportPrimitiveValue> | undefined;
  let completedCount = 0;
  let totalCount = 0;
  let hasMeaningfulInput = false;

  for (const field of section.fields) {
    if (field.type === "repeater") {
      const rows = getRepeaterRows(sectionFields, field.id);
      if (rows.length > 0) {
        hasMeaningfulInput = true;
      }

      if (field.completionFieldIds && field.completionFieldIds.length > 0) {
        totalCount += rows.length;
        completedCount += rows.filter((row) => field.completionFieldIds?.every((fieldId) => !isEmptyValue(row[fieldId]))).length;
        continue;
      }

      const minRows = field.validation?.find((rule) => rule.type === "minRows");
      if (minRows) {
        totalCount += Number(minRows.value ?? 0);
        completedCount += Math.min(rows.length, Number(minRows.value ?? 0));
      }

      continue;
    }

    if (!isFieldVisible(field, sectionFields ?? {})) {
      continue;
    }

    if (isMeaningfulScalarField(field) && isMeaningfulValue(field, sectionFields?.[field.id])) {
      hasMeaningfulInput = true;
    }

    if (!isProgressCountedScalarField(field)) {
      continue;
    }

    totalCount += 1;
    if (!isEmptyValue(sectionFields?.[field.id])) {
      completedCount += 1;
    }
  }

  const issueCount = buildSectionIssueCount(section, sectionFields, previewSection);
  const safeTotalCount = totalCount > 0 ? totalCount : null;
  const safeCompletedCount = safeTotalCount ? Math.min(completedCount, safeTotalCount) : null;
  const percent = safeTotalCount && safeCompletedCount !== null
    ? Math.round((safeCompletedCount / safeTotalCount) * 100)
    : null;

  let status: MobileInspectionSectionStatus = "not_started";
  if (issueCount > 0 && safeTotalCount !== null && safeCompletedCount === safeTotalCount) {
    status = "needs_review";
  } else if (issueCount > 0 && hasMeaningfulInput) {
    status = "needs_review";
  } else if (safeTotalCount !== null && safeCompletedCount === safeTotalCount) {
    status = "complete";
  } else if (hasMeaningfulInput) {
    status = "in_progress";
  }

  return {
    sectionId: section.id,
    sectionLabel: section.label,
    status,
    completedCount: safeCompletedCount,
    totalCount: safeTotalCount,
    percent,
    issueCount,
    hasMeaningfulInput
  };
}

export function buildMobileInspectionProgressSummary(
  template: ReportTemplateDefinition,
  draft: ReportDraft,
  reportStatus?: "draft" | "submitted" | "finalized" | null
): MobileInspectionProgressSummary {
  const preview = buildReportPreview(draft);
  const sections = template.sections.map((section) => {
    const previewSection = preview.sectionSummaries.find((summary) => summary.sectionId === section.id);
    return buildSectionProgress(section, draft, previewSection);
  });

  const countedSections = sections.filter((section) => typeof section.totalCount === "number" && typeof section.completedCount === "number");
  const totalCount = countedSections.length > 0
    ? countedSections.reduce((sum, section) => sum + (section.totalCount ?? 0), 0)
    : null;
  const completedCount = totalCount !== null
    ? countedSections.reduce((sum, section) => sum + (section.completedCount ?? 0), 0)
    : null;
  const percent = totalCount && completedCount !== null
    ? Math.round((completedCount / totalCount) * 100)
    : null;
  const hasMeaningfulProgress = sections.some((section) => section.hasMeaningfulInput);

  const nextReportStatus = reportStatus === "finalized"
    ? "Finalized"
    : totalCount !== null && completedCount === totalCount && totalCount > 0
      ? "Ready"
      : hasMeaningfulProgress
        ? "In Progress"
        : "Not Started";

  return {
    sections,
    completedCount,
    totalCount,
    percent,
    hasMeaningfulProgress,
    reportStatus: nextReportStatus,
    preview
  };
}

export function isFireAlarmInspectionType(inspectionType: InspectionType) {
  return inspectionType === "fire_alarm";
}
