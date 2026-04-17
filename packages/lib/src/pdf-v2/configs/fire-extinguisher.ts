import type { ReportTypeConfig } from "../types";

export const fireExtinguisherReportConfigV2: ReportTypeConfig = {
  type: "fire_extinguisher",
  version: "v2",
  title: "Fire Extinguisher Inspection and Service Report",
  documentCategory: "inspection",
  compliance: {
    enabled: true,
    label: "Compliance Standards",
    description: "This inspection was performed in accordance with the following standards.",
    codes: ["NFPA 10"]
  },
  pageOne: {
    outcomeMetrics: ["documentStatus", "outcome", "deficiencyCount", "serviceDate"],
    primaryFacts: ["customer", "site", "inspectionDate", "completionDate", "technician"],
    overviewFacts: ["scheduledWindow", "billingContact", "siteAddress"],
    systemSummarySectionKey: "extinguisher_summary"
  },
  statusMapping: {
    finalizedLabel: "Finalized",
    completedLabel: "Completed",
    passLabel: "Passed",
    failLabel: "Failed",
    deficiencyFoundLabel: "Deficiencies Found",
    hideWorkflowStatesInCustomerPdf: true
  },
  sections: [
    {
      key: "extinguisher_summary",
      title: "Extinguisher Summary",
      description: "Capture the overall extinguisher inventory and service disposition.",
      renderer: "keyValue",
      fields: [
        { key: "extinguishersInspected", label: "Extinguishers Inspected", format: "number" },
        { key: "extinguishersPassed", label: "Extinguishers Passed", format: "number" },
        { key: "extinguishersFailed", label: "Extinguishers Failed", format: "number" },
        { key: "extinguishersServiced", label: "Extinguishers Serviced", format: "number" },
        { key: "deficiencyCount", label: "Deficiency Count", format: "number" }
      ]
    },
    {
      key: "extinguishers",
      title: "Extinguishers",
      renderer: "table",
      table: {
        dataset: "extinguishers",
        repeatHeader: true,
        emptyMessage: "No extinguishers recorded",
        columns: [
          { key: "location", label: "Location", width: "18%" },
          { key: "type", label: "Type", width: "12%" },
          { key: "manufacturer", label: "Manufacturer", width: "12%", hideIfEmpty: true },
          { key: "serialNumber", label: "Serial Number", width: "14%", hideIfEmpty: true },
          { key: "size", label: "Size", width: "10%", hideIfEmpty: true },
          { key: "serviceStatus", label: "Service Status", width: "12%", format: "badge" },
          { key: "inspectionIndicators", label: "Inspection Indicators", width: "14%", renderMode: "stacked" },
          { key: "notes", label: "Notes", width: "8%", hideIfEmpty: true }
        ]
      }
    },
    {
      key: "service_actions",
      title: "Service Actions",
      renderer: "table",
      table: {
        dataset: "serviceActions",
        repeatHeader: true,
        hideIfEmpty: true,
        emptyMessage: "No service actions recorded",
        columns: [
          { key: "location", label: "Location", width: "18%" },
          { key: "extinguisherType", label: "Type", width: "12%" },
          { key: "action", label: "Action", width: "16%" },
          { key: "partsUsed", label: "Parts Used", width: "20%", hideIfEmpty: true },
          { key: "technicianNotes", label: "Notes", width: "34%", hideIfEmpty: true }
        ]
      }
    },
    { key: "findings", title: "Findings and Deficiencies", renderer: "findings", emptyState: { mode: "show-clean-empty", message: "No deficiencies recorded" } },
    { key: "notes", title: "Notes", renderer: "notes", emptyState: { mode: "show-clean-empty", message: "No notes provided" } }
  ],
  photos: { enabled: true, title: "Photos", captionMode: "sequential" },
  signatures: { enabled: true, title: "Signatures", roles: ["Technician", "Customer"] }
};
