import type { InspectionType } from "@testworx/types";

import { getReportPdfMetadata, inspectionTypeRegistry } from "./report-config";

export type SummaryMetricKey =
  | "documentStatus"
  | "outcome"
  | "deficiencyCount"
  | "completionPercent"
  | "serviceDate"
  | "followUpRequired";

export type SummaryFactKey =
  | "customer"
  | "site"
  | "inspectionDate"
  | "completionDate"
  | "technician"
  | "billingContact"
  | "siteAddress"
  | "scheduledWindow"
  | "inspectionStatus";

export type ReportSectionRenderer =
  | "keyValue"
  | "table"
  | "checklist"
  | "findings"
  | "notes"
  | "photos"
  | "signatures";

export type FieldConfig = {
  key: string;
  label: string;
  format?: "text" | "date" | "datetime" | "boolean" | "number" | "address" | "badge" | "hours";
  hideIfEmpty?: boolean;
  fallback?: string;
};

export type TableColumnConfig = {
  key: string;
  label: string;
  width?: number;
  align?: "left" | "center" | "right";
  format?: "text" | "number" | "boolean" | "badge";
  hideIfEmpty?: boolean;
  renderMode?: "plain" | "indicators" | "stacked";
};

export type TableConfig = {
  dataset: string;
  columns: TableColumnConfig[];
  repeatHeader?: boolean;
  hideIfEmpty?: boolean;
  emptyMessage?: string;
};

export type ChecklistItemConfig = {
  key: string;
  label: string;
};

export type ChecklistConfig = {
  dataset: string;
  style: "passFailGrid";
  items: ChecklistItemConfig[];
};

export type ReportSectionConfig = {
  key: string;
  title: string;
  description?: string;
  renderer: ReportSectionRenderer;
  pageBreakBehavior?: "auto" | "avoid-inside" | "start-on-new-page";
  emptyState?: {
    mode: "hide-section" | "show-clean-empty";
    message?: string;
  };
  fields?: FieldConfig[];
  table?: TableConfig;
  checklist?: ChecklistConfig;
  sourceSectionId?: string;
};

export type PhotoSectionConfig = {
  enabled: boolean;
  title: string;
  captionMode: "sequential";
};

export type SignatureSectionConfig = {
  enabled: boolean;
  title: string;
  roles: string[];
};

export type ReportTypeConfig = {
  type: InspectionType;
  title: string;
  subtitle?: string;
  documentCategory: "inspection" | "service" | "deficiency";
  compliance: {
    label?: string;
    codes: string[];
    prominent: boolean;
    description?: string;
  };
  statusMapping: {
    finalizedLabel: string;
    completedLabel: string;
    passLabel: string;
    failLabel: string;
    deficiencyFoundLabel?: string;
    hideWorkflowStatesInCustomerPdf: boolean;
  };
  summary: {
    topMetrics: SummaryMetricKey[];
    primaryFacts: SummaryFactKey[];
    overviewFacts: SummaryFactKey[];
  };
  sections: ReportSectionConfig[];
  photos?: PhotoSectionConfig;
  signatures?: SignatureSectionConfig;
};

export const reportComplianceMap: Partial<Record<InspectionType, string[]>> = {
  fire_alarm: ["NFPA 72", "NFPA 70"],
  kitchen_suppression: ["NFPA 17A", "NFPA 96"],
  fire_extinguisher: ["NFPA 10"]
};

export const customerFacingFieldRules = {
  suppressValues: [null, undefined, "", "Unknown", "N/A", "--", "—"],
  addressFallback: "No service address on file",
  notesFallback: "No notes provided",
  findingsFallback: "No deficiencies recorded"
} as const;

export function mapCustomerFacingReportStatus(input: {
  isFinalized: boolean;
  isSigned: boolean;
  outcome?: "pass" | "fail" | null;
  workflowStatus?: string | null;
}) {
  if (input.isFinalized || input.isSigned) {
    return {
      documentStatus: "Finalized",
      inspectionStatus: "Completed"
    };
  }

  return {
    documentStatus: "In Review",
    inspectionStatus: "Scheduled"
  };
}

export const fireAlarmReportConfig: ReportTypeConfig = {
  type: "fire_alarm",
  title: "Fire Alarm Inspection and Testing Report",
  documentCategory: "inspection",
  compliance: {
    label: "Applicable Codes",
    codes: ["NFPA 72", "NFPA 70"],
    prominent: true,
    description: "This inspection was performed in accordance with the following standards."
  },
  statusMapping: {
    finalizedLabel: "Finalized",
    completedLabel: "Completed",
    passLabel: "Passed",
    failLabel: "Failed",
    deficiencyFoundLabel: "Deficiencies Found",
    hideWorkflowStatesInCustomerPdf: true
  },
  summary: {
    topMetrics: ["documentStatus", "outcome", "deficiencyCount", "serviceDate"],
    primaryFacts: ["customer", "site", "inspectionDate", "completionDate", "technician"],
    overviewFacts: ["scheduledWindow", "billingContact", "siteAddress", "inspectionStatus"]
  },
  sections: [
    { key: "control-panel", title: "Control Panel", description: "Inspect panel identification, power supplies, indications, communication, annunciation, and physical condition.", renderer: "keyValue", sourceSectionId: "control-panel" },
    { key: "initiating-devices", title: "Initiating Devices", description: "Record detectors, pull stations, and supervisory initiating devices tested during this visit.", renderer: "table", sourceSectionId: "initiating-devices" },
    { key: "notification", title: "Notification Appliances", description: "Inspect notification appliance performance and visible and audible operation.", renderer: "table", sourceSectionId: "notification" },
    { key: "system-summary", title: "General System Summary", description: "Capture overall system disposition, repair recommendations, and follow-up needs.", renderer: "keyValue", sourceSectionId: "system-summary" },
    { key: "findings", title: "Findings and Deficiencies", renderer: "findings", emptyState: { mode: "show-clean-empty", message: "No deficiencies recorded" } },
    { key: "notes", title: "Notes", renderer: "notes", emptyState: { mode: "show-clean-empty", message: "No notes provided" } }
  ],
  photos: { enabled: true, title: "Photos", captionMode: "sequential" },
  signatures: { enabled: true, title: "Signatures", roles: ["Technician", "Customer"] }
};

export const kitchenSuppressionReportConfig: ReportTypeConfig = {
  type: "kitchen_suppression",
  title: "Kitchen Suppression Inspection Report",
  documentCategory: "inspection",
  compliance: {
    label: "Applicable Codes",
    codes: ["NFPA 17A", "NFPA 96"],
    prominent: true,
    description: "This inspection was performed in accordance with the following standards."
  },
  statusMapping: {
    finalizedLabel: "Finalized",
    completedLabel: "Completed",
    passLabel: "Passed",
    failLabel: "Failed",
    deficiencyFoundLabel: "Deficiencies Found",
    hideWorkflowStatesInCustomerPdf: true
  },
  summary: {
    topMetrics: ["documentStatus", "outcome", "deficiencyCount", "serviceDate"],
    primaryFacts: ["customer", "site", "inspectionDate", "completionDate", "technician"],
    overviewFacts: ["scheduledWindow", "billingContact", "siteAddress", "inspectionStatus"]
  },
  sections: [
    { key: "system-details", title: "System Details", description: "Capture the core kitchen suppression system details for this hood system.", renderer: "keyValue", sourceSectionId: "system-details" },
    { key: "appliance-coverage", title: "Coverage and Appliances", description: "Capture hood groupings and protected appliances associated with the hood system.", renderer: "table", sourceSectionId: "appliance-coverage" },
    {
      key: "system-checklist",
      title: "System Checklist",
      description: "Record the core kitchen suppression checklist results for this inspection.",
      renderer: "checklist",
      sourceSectionId: "system-checklist",
      checklist: {
        dataset: "system-checklist",
        style: "passFailGrid",
        items: [
          { key: "allAppliancesProtected", label: "All appliances properly protected?" },
          { key: "ductPlenumProtected", label: "Duct and plenum properly protected?" },
          { key: "nozzlePositioningCorrect", label: "System nozzle positioning correct?" },
          { key: "systemInstalledPerMfgUl", label: "Installed per manufacturer and UL?" },
          { key: "fuelShutdownVerified", label: "Fuel shutdown verified?" },
          { key: "fireAlarmInterconnectWorking", label: "Fire alarm interconnection functioning?" },
          { key: "kClassExtinguisherPresent", label: "K-Class extinguisher in place?" },
          { key: "hoodCleanedPerNFPA96", label: "Hood cleaned per NFPA 96?" }
        ]
      }
    },
    { key: "tank-and-service", title: "Agent Tank and Service", description: "Track service materials used and related maintenance notes.", renderer: "table", sourceSectionId: "tank-and-service" },
    { key: "findings", title: "Findings and Deficiencies", renderer: "findings", emptyState: { mode: "show-clean-empty", message: "No deficiencies recorded" } },
    { key: "notes", title: "Notes", renderer: "notes", emptyState: { mode: "show-clean-empty", message: "No notes provided" } }
  ],
  photos: { enabled: true, title: "Photos", captionMode: "sequential" },
  signatures: { enabled: true, title: "Signatures", roles: ["Technician", "Customer"] }
};

export const fireExtinguisherReportConfig: ReportTypeConfig = {
  type: "fire_extinguisher",
  title: "Fire Extinguisher Inspection and Service Report",
  documentCategory: "inspection",
  compliance: {
    label: "Applicable Codes",
    codes: ["NFPA 10"],
    prominent: true,
    description: "This inspection was performed in accordance with the following standards."
  },
  statusMapping: {
    finalizedLabel: "Finalized",
    completedLabel: "Completed",
    passLabel: "Passed",
    failLabel: "Failed",
    deficiencyFoundLabel: "Deficiencies Found",
    hideWorkflowStatesInCustomerPdf: true
  },
  summary: {
    topMetrics: ["documentStatus", "outcome", "deficiencyCount", "serviceDate"],
    primaryFacts: ["customer", "site", "inspectionDate", "completionDate", "technician"],
    overviewFacts: ["scheduledWindow", "billingContact", "siteAddress", "inspectionStatus"]
  },
  sections: [
    { key: "inventory", title: "Extinguisher Inventory", description: "Record extinguisher location, type, condition, and service results.", renderer: "table", sourceSectionId: "inventory" },
    { key: "service", title: "Service Findings", description: "Capture work performed and follow-up recommendations for this visit.", renderer: "keyValue", sourceSectionId: "service" },
    { key: "findings", title: "Findings and Deficiencies", renderer: "findings", emptyState: { mode: "show-clean-empty", message: "No deficiencies recorded" } },
    { key: "notes", title: "Notes", renderer: "notes", emptyState: { mode: "show-clean-empty", message: "No notes provided" } }
  ],
  photos: { enabled: true, title: "Photos", captionMode: "sequential" },
  signatures: { enabled: true, title: "Signatures", roles: ["Technician", "Customer"] }
};

export const reportTypeRegistry: Partial<Record<InspectionType, ReportTypeConfig>> = {
  fire_alarm: fireAlarmReportConfig,
  kitchen_suppression: kitchenSuppressionReportConfig,
  fire_extinguisher: fireExtinguisherReportConfig
};

function buildDefaultReportTypeConfig(type: InspectionType): ReportTypeConfig {
  const template = inspectionTypeRegistry[type];
  const pdf = getReportPdfMetadata(type);

  return {
    type,
    title: pdf.subtitle || `${template.label} Inspection Report`,
    subtitle: pdf.subtitle,
    documentCategory: type === "work_order" ? "service" : "inspection",
    compliance: {
      label: "Applicable Codes",
      codes: reportComplianceMap[type] ?? pdf.nfpaReferences ?? [],
      prominent: true,
      description: "This inspection was performed in accordance with the following standards."
    },
    statusMapping: {
      finalizedLabel: "Finalized",
      completedLabel: "Completed",
      passLabel: "Passed",
      failLabel: "Failed",
      deficiencyFoundLabel: "Deficiencies Found",
      hideWorkflowStatesInCustomerPdf: true
    },
    summary: {
      topMetrics: ["documentStatus", "outcome", "deficiencyCount", "serviceDate"],
      primaryFacts: ["customer", "site", "inspectionDate", "completionDate", "technician"],
      overviewFacts: ["scheduledWindow", "billingContact", "siteAddress", "inspectionStatus"]
    },
    sections: template.sections.map((section) => ({
      key: section.id,
      title: section.label,
      description: section.description,
      renderer: section.fields.some((field) => field.type === "repeater") ? "table" : "keyValue",
      sourceSectionId: section.id
    })),
    photos: { enabled: true, title: "Photos", captionMode: "sequential" },
    signatures: { enabled: true, title: "Signatures", roles: ["Technician", "Customer"] }
  };
}

export function resolveReportTypeConfig(type: InspectionType) {
  return reportTypeRegistry[type] ?? buildDefaultReportTypeConfig(type);
}
