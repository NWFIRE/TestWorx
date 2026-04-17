import type { ReportTypeConfig } from "../types";

export const fireAlarmReportConfigV2: ReportTypeConfig = {
  type: "fire_alarm",
  version: "v2",
  title: "Fire Alarm Inspection and Testing Report",
  documentCategory: "inspection",
  compliance: {
    enabled: true,
    label: "Compliance Standards",
    description: "This inspection was performed in accordance with the following standards.",
    codes: ["NFPA 72", "NFPA 70"]
  },
  pageOne: {
    outcomeMetrics: ["documentStatus", "outcome", "deficiencyCount", "completionPercent"],
    primaryFacts: ["customer", "site", "inspectionDate", "completionDate", "technician"],
    overviewFacts: ["scheduledWindow", "billingContact", "siteAddress"],
    systemSummarySectionKey: "general_system_summary"
  },
  statusMapping: {
    finalizedLabel: "Finalized",
    completedLabel: "Completed",
    passLabel: "Pass",
    failLabel: "Fail",
    deficiencyFoundLabel: "Deficiencies Found",
    hideWorkflowStatesInCustomerPdf: true
  },
  sections: [
    {
      key: "control_panel_summary",
      title: "Control Panel",
      description: "Inspect panel identification, power supplies, indications, communication, annunciation, and physical condition.",
      renderer: "keyValue",
      fields: [
        { key: "controlPanelsInspected", label: "Control Panels Inspected", format: "number" },
        { key: "lineVoltageStatus", label: "Line Voltage Status" },
        { key: "acPowerIndicator", label: "AC Power Indicator", format: "boolean" },
        { key: "powerSupplyCondition", label: "Power Supply Condition" },
        { key: "batteryDateCode", label: "Battery Date Code" },
        { key: "batterySize", label: "Battery Size" },
        { key: "batteryQuantity", label: "Quantity", format: "number" },
        { key: "batteryChargeLevel", label: "Battery Charge Level" },
        { key: "batteryLoadTest", label: "Battery Load Test" },
        { key: "centralStationSignalTest", label: "Central Station Signal Test" },
        { key: "controlPanelCondition", label: "Control Panel Condition" }
      ]
    },
    {
      key: "control_panels",
      title: "Control Panels",
      renderer: "table",
      table: {
        dataset: "controlPanels",
        repeatHeader: true,
        emptyMessage: "No control panels recorded",
        columns: [
          { key: "location", label: "Location", width: "18%" },
          { key: "type", label: "Type", width: "14%" },
          { key: "manufacturer", label: "Manufacturer", width: "14%", hideIfEmpty: true },
          { key: "serviceKey", label: "Service Key", width: "12%", hideIfEmpty: true },
          { key: "inspectionIndicators", label: "Inspection Indicators", width: "28%", renderMode: "stacked" },
          { key: "notes", label: "Notes", width: "14%", hideIfEmpty: true }
        ]
      }
    },
    {
      key: "initiating_devices",
      title: "Initiating Devices",
      description: "Record detectors, pull stations, and supervisory initiating devices tested during this visit.",
      renderer: "table",
      table: {
        dataset: "initiatingDevices",
        repeatHeader: true,
        emptyMessage: "No initiating devices recorded",
        columns: [
          { key: "location", label: "Location", width: "20%" },
          { key: "type", label: "Type", width: "16%" },
          { key: "manufacturer", label: "Manufacturer", width: "12%", hideIfEmpty: true },
          { key: "serviceKey", label: "Service Key", width: "12%", hideIfEmpty: true },
          { key: "inspectionIndicators", label: "Inspection Indicators", width: "28%", renderMode: "stacked" },
          { key: "notes", label: "Notes", width: "12%", hideIfEmpty: true }
        ]
      }
    },
    {
      key: "notification_appliances",
      title: "Notification Appliances",
      description: "Inspect notification appliance performance and visible/audible operation.",
      renderer: "table",
      table: {
        dataset: "notificationAppliances",
        repeatHeader: true,
        emptyMessage: "No notification appliances recorded",
        columns: [
          { key: "location", label: "Location", width: "18%" },
          { key: "type", label: "Type", width: "16%" },
          { key: "manufacturer", label: "Manufacturer", width: "12%", hideIfEmpty: true },
          { key: "serviceKey", label: "Service Key", width: "12%", hideIfEmpty: true },
          { key: "inspectionIndicators", label: "Inspection Indicators", width: "30%", renderMode: "stacked" },
          { key: "notes", label: "Notes", width: "12%", hideIfEmpty: true }
        ]
      }
    },
    {
      key: "general_system_summary",
      title: "General System Summary",
      description: "Capture overall system disposition, repair recommendations, and follow-up needs.",
      renderer: "keyValue",
      fields: [
        { key: "controlPanelsInspected", label: "Control Panels Inspected", format: "number" },
        { key: "initiatingDevicesInspected", label: "Initiating Devices Inspected", format: "number" },
        { key: "notificationAppliancesInspected", label: "Notification Appliances Inspected", format: "number" },
        { key: "deficiencyCount", label: "Deficiency Count", format: "number" },
        { key: "deficienciesFound", label: "Deficiencies Found", format: "boolean" },
        { key: "fireAlarmSystemStatus", label: "Fire Alarm System Status" },
        { key: "laborHours", label: "Labor Hours", format: "hours" },
        { key: "followUpRequired", label: "Follow-Up Required", format: "boolean" }
      ]
    },
    { key: "findings", title: "Findings and Deficiencies", renderer: "findings", emptyState: { mode: "show-clean-empty", message: "No deficiencies recorded" } },
    { key: "notes", title: "Notes", renderer: "notes", emptyState: { mode: "show-clean-empty", message: "No notes provided" } }
  ],
  photos: { enabled: true, title: "Photos", captionMode: "single-generic" },
  signatures: { enabled: true, title: "Signatures", roles: ["Technician", "Customer"] }
};
