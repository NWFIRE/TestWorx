import type { InspectionType } from "@testworx/types";

import {
  getReportPdfMetadata,
  inspectionTypeRegistry,
  type ReportFieldDefinition
} from "../report-config";
import { fireAlarmReportConfigV2 } from "./configs/fire-alarm";
import { fireExtinguisherReportConfigV2 } from "./configs/fire-extinguisher";
import { kitchenSuppressionReportConfigV2 } from "./configs/kitchen-suppression";
import type { ReportTypeConfig } from "./types";

export const reportTypeRegistryV2: Partial<Record<InspectionType, ReportTypeConfig>> = {
  fire_alarm: fireAlarmReportConfigV2,
  kitchen_suppression: kitchenSuppressionReportConfigV2,
  fire_extinguisher: fireExtinguisherReportConfigV2
};

function inferFieldFormat(field: Exclude<ReportFieldDefinition, { type: "repeater" }>) {
  switch (field.type) {
    case "boolean":
      return "boolean" as const;
    case "number":
      return "number" as const;
    case "date":
      return "date" as const;
    default:
      return "text" as const;
  }
}

function buildDefaultReportTypeConfigV2(type: InspectionType): ReportTypeConfig {
  const template = inspectionTypeRegistry[type];
  const pdf = getReportPdfMetadata(type);

  const expandedSections = template.sections.flatMap((section) => {
    const scalarFields = section.fields.filter((field): field is Exclude<ReportFieldDefinition, { type: "repeater" }> => field.type !== "repeater");
    const repeaterFields = section.fields.filter((field): field is Extract<ReportFieldDefinition, { type: "repeater" }> => field.type === "repeater");
    const built = [] as ReportTypeConfig["sections"];

    if (scalarFields.length > 0) {
      built.push({
        key: section.id,
        title: section.label,
        description: section.description,
        renderer: "keyValue",
        fields: scalarFields.map((field) => ({
          key: field.id,
          label: field.label,
          format: inferFieldFormat(field),
          hideIfEmpty: true
        }))
      });
    }

    for (const repeaterField of repeaterFields) {
      built.push({
        key: `${section.id}__${repeaterField.id}`,
        title: repeaterFields.length === 1 ? section.label : repeaterField.label,
        description: section.description,
        renderer: "table",
        table: {
          dataset: `${section.id}.${repeaterField.id}`,
          repeatHeader: true,
          emptyMessage: `No ${repeaterField.label.toLowerCase()} recorded`,
          columns: repeaterField.rowFields
            .filter((rowField) => !rowField.hidden)
            .slice(0, 6)
            .map((rowField, index) => ({
              key: rowField.id,
              label: rowField.label,
              width: index === 0 ? "22%" : index === 1 ? "18%" : "15%",
              hideIfEmpty: true,
              renderMode: /operation|condition|status|result/i.test(rowField.id) ? "stacked" : "plain"
            }))
        }
      });
    }

    return built;
  });

  const firstSectionKey = expandedSections[0]?.key;

  return {
    type,
    version: "v2",
    title: pdf.subtitle || `${template.label} Inspection Report`,
    documentCategory: type === "work_order" ? "service" : "inspection",
    compliance: {
      enabled: true,
      label: "Compliance Standards",
      description: "This inspection was performed in accordance with the following standards.",
      codes: pdf.nfpaReferences ?? []
    },
    pageOne: {
      outcomeMetrics: ["documentStatus", "outcome", "deficiencyCount", "serviceDate"],
      primaryFacts: ["customer", "site", "inspectionDate", "completionDate", "technician"],
      overviewFacts: ["scheduledWindow", "billingContact", "siteAddress"],
      systemSummarySectionKey: firstSectionKey
    },
    statusMapping: {
      finalizedLabel: "Finalized",
      completedLabel: "Completed",
      passLabel: "Passed",
      failLabel: "Failed",
      deficiencyFoundLabel: "Deficiencies Found",
      hideWorkflowStatesInCustomerPdf: true
    },
    sections: expandedSections,
    photos: { enabled: true, title: "Photos", captionMode: "sequential" },
    signatures: { enabled: true, title: "Signatures", roles: ["Technician", "Customer"] }
  };
}

export function resolveReportTypeConfigV2(type: InspectionType) {
  return reportTypeRegistryV2[type] ?? buildDefaultReportTypeConfigV2(type);
}

export function supportsPdfV2(type: InspectionType) {
  return Boolean(inspectionTypeRegistry[type]);
}
