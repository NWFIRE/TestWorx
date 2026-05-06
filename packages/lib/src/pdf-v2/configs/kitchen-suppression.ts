import type { ReportTypeConfig } from "../types";

export const kitchenSuppressionReportConfigV2: ReportTypeConfig = {
  type: "kitchen_suppression",
  version: "v2",
  title: "Kitchen Suppression Inspection Report",
  documentCategory: "inspection",
  compliance: {
    enabled: true,
    label: "Compliance Standards",
    description: "This inspection was performed in accordance with the following standards.",
    codes: ["NFPA 17A", "NFPA 96"]
  },
  pageOne: {
    outcomeMetrics: ["documentStatus", "outcome", "deficiencyCount", "serviceDate"],
    primaryFacts: ["customer", "site", "inspectionDate", "completionDate", "technician"],
    overviewFacts: ["scheduledWindow", "billingContact", "siteAddress"],
    systemSummarySectionKey: "system_details"
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
      key: "system_details",
      title: "System Details",
      description: "Capture the core kitchen suppression system details for this hood system.",
      renderer: "keyValue",
      fields: [
        { key: "systemType", label: "System Type" },
        { key: "systemSizeGallons", label: "System Size (Gallons)", format: "number" },
        { key: "numberOfCylinders", label: "Number of Cylinders", format: "number" },
        { key: "ul300Compliant", label: "UL 300 Compliant", format: "boolean" },
        { key: "systemLocation", label: "System Location" },
        { key: "areaProtected", label: "Area Protected" },
        { key: "manufacturer", label: "Manufacturer" },
        { key: "model", label: "Model" },
        { key: "cylinderDates", label: "Cylinder Dates" },
        { key: "lastCylinderHydroDate", label: "Last Cylinder Hydro Date", format: "date" }
      ]
    },
    {
      key: "hoods",
      title: "Hoods",
      renderer: "table",
      table: {
        dataset: "hoods",
        repeatHeader: true,
        emptyMessage: "No hoods recorded",
        columns: [
          { key: "hoodName", label: "Hood / Location", width: "24%" },
          { key: "hoodSize", label: "Hood Size", width: "16%", hideIfEmpty: true },
          { key: "ductSize", label: "Duct Size", width: "16%", hideIfEmpty: true },
          { key: "ductQuantity", label: "Duct Qty", width: "12%", hideIfEmpty: true },
          { key: "ductNozzleQuantity", label: "Duct Nozzle Qty", width: "16%", hideIfEmpty: true },
          { key: "ductNozzleType", label: "Duct Nozzle Type", width: "16%", hideIfEmpty: true }
        ]
      }
    },
    {
      key: "appliances",
      title: "Appliances",
      renderer: "table",
      table: {
        dataset: "appliances",
        repeatHeader: true,
        emptyMessage: "No appliances recorded",
        columns: [
          { key: "hoodName", label: "Hood / Location", width: "24%" },
          { key: "appliance", label: "Appliance", width: "22%" },
          { key: "size", label: "Size", width: "16%", hideIfEmpty: true },
          { key: "applianceNozzleQuantity", label: "Nozzle Qty", width: "18%", hideIfEmpty: true },
          { key: "applianceNozzleType", label: "Nozzle Type", width: "20%", hideIfEmpty: true }
        ]
      }
    },
    {
      key: "system_checklist",
      title: "System Checklist",
      description: "Record the core kitchen suppression system checklist results for this inspection.",
      renderer: "checklist",
      checklist: {
        dataset: "systemChecklist",
        style: "passFailGrid",
        items: [
          { key: "allAppliancesProtected", label: "All appliances properly protected?" },
          { key: "ductPlenumProtected", label: "Duct & plenum properly protected?" },
          { key: "nozzlePositioningCorrect", label: "Positioning of all system nozzles correct?" },
          { key: "systemInstalledPerMfgUl", label: "System installed properly per mfg & UL?" },
          { key: "penetrationsSealedProperly", label: "Hood and duct penetrations sealed properly?" },
          { key: "pressureGaugeInRange", label: "Pressure gauge in operating range if equipped?" },
          { key: "cartridgeWeightWithinSpec", label: "Cartridge weight within specifications if equipped?" },
          { key: "cylinderChemicalCondition", label: "Cylinder chemical in good condition?" },
          { key: "manualPullStationTested", label: "Operated system via manual pull station?" },
          { key: "testLinkOperated", label: "Operated system via test link?" },
          { key: "fuelShutdownVerified", label: "Verified shutdown of equipment fuel source?" },
          { key: "nozzlesCleanCapped", label: "Nozzles clean and proper caps in place?" },
          { key: "detectionLinksPlacement", label: "Proper placement of detection links?" },
          { key: "fusibleLinksReplaced", label: "Replaced fusible link(s)?" },
          { key: "cableTravelChecked", label: "Checked travel of cable/s-hooks?" },
          { key: "pipingSecured", label: "Piping/conduit tight & securely bracketed?" },
          { key: "flameFryerSeparation", label: "Proper separation between flame and fryer?" },
          { key: "fireAlarmInterconnectWorking", label: "Fire alarm interconnection functioning?" },
          { key: "gasValveTestedReset", label: "Gas valve tested & reset to operating position?" },
          { key: "pipingObstructionTested", label: "Piping obstruction test performed?" },
          { key: "filtersInstalledCorrectly", label: "Proper filters installed & in correct position?" },
          { key: "exhaustFanOperational", label: "Exhaust fan operational and warning sign on hood?" },
          { key: "kClassExtinguisherPresent", label: "K-class fire extinguisher charged & in place?" },
          { key: "hoodCleanedPerNFPA96", label: "Hood cleaned regularly in accordance with NFPA 96?" }
        ]
      }
    },
    {
      key: "agent_tank_service",
      title: "Agent Tank and Service",
      description: "Track service materials used and related maintenance notes.",
      renderer: "table",
      table: {
        dataset: "fusibleLinksUsed",
        repeatHeader: true,
        hideIfEmpty: false,
        emptyMessage: "No service materials recorded",
        columns: [
          { key: "item", label: "Item", width: "34%" },
          { key: "details", label: "Details", width: "36%", hideIfEmpty: true },
          { key: "quantity", label: "Quantity", width: "14%" },
          { key: "notes", label: "Notes", width: "16%", hideIfEmpty: true }
        ]
      }
    },
    { key: "findings", title: "Findings and Deficiencies", renderer: "findings", emptyState: { mode: "show-clean-empty", message: "No deficiencies recorded" } },
    { key: "notes", title: "Notes", renderer: "notes", emptyState: { mode: "show-clean-empty", message: "No notes provided" } }
  ],
  photos: { enabled: true, title: "Photos", captionMode: "sequential" },
  signatures: { enabled: true, title: "Signatures", roles: ["Technician", "Customer"] }
};
