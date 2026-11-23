import type { InspectionType } from "@testworx/types";

import {
  getReportPdfMetadata,
  inspectionTypeRegistry,
  type ReportFieldDefinition
} from "../report-config";
import { fireAlarmReportConfigV2 } from "./configs/fire-alarm";
import { fireExtinguisherReportConfigV2 } from "./configs/fire-extinguisher";
import { industrialDryChemicalReportConfigV2 } from "./configs/industrial-dry-chemical";
import { jointCommissionFireSprinklerReportConfigV2 } from "./configs/joint-commission-fire-sprinkler";
import { kitchenSuppressionReportConfigV2 } from "./configs/kitchen-suppression";
import type { ReportTypeConfig } from "./types";

export const reportTypeRegistryV2: Partial<Record<InspectionType, ReportTypeConfig>> = {
  fire_alarm: fireAlarmReportConfigV2,
  kitchen_suppression: kitchenSuppressionReportConfigV2,
  industrial_suppression: industrialDryChemicalReportConfigV2,
  joint_commission_fire_sprinkler: jointCommissionFireSprinklerReportConfigV2,
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

    if (scalarFields.length > 0 && section.pdfDisplayType === "checklist") {
      built.push({
        key: section.id,
        title: section.label,
        description: section.description,
        renderer: "checklist",
        checklist: {
          dataset: section.id,
          style: "passFailGrid",
          items: scalarFields.filter((field) => field.type === "select" || field.type === "boolean").map((field) => ({ key: field.id, label: field.label }))
        }
      });
      const detailFields = scalarFields.filter((field) => field.type !== "select" && field.type !== "boolean");
      if (detailFields.length) built.push({
        key: `${section.id}__details`, sourceSectionId: section.id, title: `${section.label} notes`, renderer: "keyValue",
        fields: detailFields.map((field) => ({ key: field.id, label: field.label, format: inferFieldFormat(field), preserveText: true, hideIfEmpty: true }))
      });
    } else if (scalarFields.length > 0) {
      built.push({
        key: section.id,
        title: section.label,
        description: section.description,
        renderer: "keyValue",
        fields: scalarFields.map((field) => ({
          key: field.id,
          label: field.label,
          format: inferFieldFormat(field),
          preserveText: field.type === "text" || Boolean(pdf.fullDetail && (field.type === "select" || field.type === "date")),
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
            .map((rowField, index) => ({
              key: rowField.id,
              label: rowField.label,
              width: pdf.fullDetail && repeaterField.rowFields.length < 6 ? undefined : index === 0 ? "22%" : index === 1 ? "18%" : "15%",
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
      label: "Applicable Codes, Standards & Compliance References",
      description: "This report includes editioned code references, applicability notes, and survey-ready compliance documentation.",
      codes: pdf.nfpaReferences ?? []
    },
    pageOne: {
      outcomeMetrics: ["documentStatus", "outcome", "deficiencyCount", "serviceDate"],
      primaryFacts: ["customer", "site", "inspectionDate", "completionDate", "technician"],
      overviewFacts: ["scheduledWindow", "billingContact", "siteAddress"],
      systemSummarySectionKey: pdf.fullDetail ? undefined : firstSectionKey
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
  const configured = reportTypeRegistryV2[type];
  if (!configured) return buildDefaultReportTypeConfigV2(type);
  // This report uses matching definition/dataset IDs. Retain its specialized
  // checklists, while including definition fields omitted by the older PDF map.
  if (type === "industrial_suppression") {
    const defaults = buildDefaultReportTypeConfigV2(type);
    const sections = [...configured.sections];
    for (const section of defaults.sections) {
      if (section.table && sections.some(existing => existing.table?.dataset === section.table?.dataset)) continue;
      if (section.fields) {
        const source = section.sourceSectionId ?? section.key;
        const covered = new Set(sections.flatMap(existing => {
          if (existing.checklist?.dataset === source) return existing.checklist.items.map(item => item.key);
          if ((existing.sourceSectionId ?? existing.key) === source) return (existing.fields ?? []).map(field => field.key);
          return [];
        }));
        const fields = section.fields.filter(field => !covered.has(field.key));
        if (fields.length) sections.push({ ...section, key: `${section.key}__additional`, sourceSectionId: source, fields });
      } else if (!sections.some(existing => existing.key === section.key)) {
        sections.push(section);
      }
    }
    return { ...configured, sections };
  }
  return configured;
}

export function supportsPdfV2(type: InspectionType) {
  return Boolean(inspectionTypeRegistry[type]);
}
