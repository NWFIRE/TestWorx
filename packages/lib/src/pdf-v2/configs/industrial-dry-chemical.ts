import type { ReportTypeConfig } from "../types";

export const industrialDryChemicalReportConfigV2: ReportTypeConfig = {
  type: "industrial_suppression",
  version: "v2",
  title: "Industrial Dry Chemical Inspection Report",
  documentCategory: "inspection",
  compliance: {
    enabled: true,
    label: "Compliance Standards",
    description: "This inspection was performed in accordance with the following standards.",
    codes: ["NFPA 17"]
  },
  pageOne: {
    outcomeMetrics: ["documentStatus", "outcome", "deficiencyCount", "serviceDate"],
    primaryFacts: ["customer", "site", "inspectionDate", "completionDate", "technician"],
    overviewFacts: ["scheduledWindow", "billingContact", "siteAddress", "inspectionStatus"],
    systemSummarySectionKey: "system-information"
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
      key: "system-information",
      title: "System Information",
      description: "Protected hazard, dry chemical system details, release components, and tag status.",
      renderer: "keyValue",
      fields: [
        { key: "tagStatus", label: "Tag Status", format: "badge" },
        { key: "manufacturer", label: "Manufacturer" },
        { key: "manufacturerOther", label: "Other Manufacturer", hideIfEmpty: true },
        { key: "model", label: "Model", hideIfEmpty: true },
        { key: "systemLocation", label: "System Location", hideIfEmpty: true },
        { key: "hazardProtected", label: "Hazard Protected", hideIfEmpty: true },
        { key: "cylinderCount", label: "Cylinder / Tank Count", format: "number", hideIfEmpty: true },
        { key: "tankInformation", label: "Cylinder / Tank Information", hideIfEmpty: true },
        { key: "actuatorReleasingMechanism", label: "Actuator / Releasing Mechanism", hideIfEmpty: true },
        { key: "detectionMethod", label: "Detection Method", hideIfEmpty: true },
        { key: "nozzlesPipingCondition", label: "Nozzles / Piping Condition", format: "badge", hideIfEmpty: true },
        { key: "agentCondition", label: "Agent Condition", format: "badge", hideIfEmpty: true },
        { key: "pressureChargeStatus", label: "Pressure / Charge Status", format: "badge", hideIfEmpty: true },
        { key: "manualPullStation", label: "Manual Pull Station", format: "badge", hideIfEmpty: true },
        { key: "automaticDetection", label: "Automatic Detection", format: "badge", hideIfEmpty: true },
        { key: "shutdownInterlockChecks", label: "Shutdown / Interlock Checks", format: "badge", hideIfEmpty: true },
        { key: "alarmInterfaceChecks", label: "Alarm / Interface Checks", format: "badge", hideIfEmpty: true },
        { key: "dischargePathNozzleCoverage", label: "Discharge Path / Nozzle Coverage", format: "badge", hideIfEmpty: true },
        { key: "deficiencyNotes", label: "Deficiency Notes", hideIfEmpty: true },
        { key: "technicianNotes", label: "Technician Notes", hideIfEmpty: true },
        { key: "customerAcknowledgement", label: "Customer Acknowledgement", hideIfEmpty: true }
      ]
    },
    {
      key: "installation-compliance-checklist",
      title: "Installation & Compliance",
      renderer: "checklist",
      checklist: {
        dataset: "installation-compliance-checklist",
        style: "passFailGrid",
        items: [
          { key: "systemInstalledPerMfgUl", label: "1. System installed in accordance with MFG & UL?" },
          { key: "systemDischargedPriorToArrival", label: "2. System discharged prior to arrival?" },
          { key: "tamperingEvidence", label: "3. Evidence of tampering since last inspection?" }
        ]
      }
    },
    {
      key: "nozzles-piping-checklist",
      title: "Nozzles & Piping",
      renderer: "checklist",
      checklist: {
        dataset: "nozzles-piping-checklist",
        style: "passFailGrid",
        items: [
          { key: "hazardCoveredCorrectNozzles", label: "4. Hazard properly covered w/ correct nozzles?" },
          { key: "nozzlePositionChecked", label: "5. Check position of all nozzles?" },
          { key: "pipingConduitSecured", label: "20. Piping/conduit secured bracketed?" },
          { key: "nozzlesCleanCapsInPlace", label: "21. Nozzles cleaned and proper caps in place?" },
          { key: "fireAlarmInterconnectionFunctioning", label: "22. Fire alarm interconnection functioning?" }
        ]
      }
    },
    {
      key: "cylinders-agent-hardware-checklist",
      title: "Cylinders / Agent / Hardware",
      renderer: "checklist",
      checklist: {
        dataset: "cylinders-agent-hardware-checklist",
        style: "passFailGrid",
        items: [
          { key: "pressureGaugeProperRange", label: "6. Pressure gauge in proper range if equipped?" },
          { key: "cartridgeWeightCheckedOrReplaced", label: "7. Checked cartridge weight or replaced?" },
          { key: "pneumaticActuatorChecked", label: "8. Checked pneumatic actuator?" },
          { key: "cylinderAndMountInspected", label: "9. Inspected cylinder and mount?" }
        ]
      }
    },
    {
      key: "detection-actuation-checklist",
      title: "Detection & Actuation",
      renderer: "checklist",
      checklist: {
        dataset: "detection-actuation-checklist",
        style: "passFailGrid",
        items: [
          { key: "operatedWithTerminalLink", label: "10. Operated system with terminal link?" },
          { key: "electronicDetectionChecked", label: "11. Checked operation of electronic detection?" },
          { key: "cableTravelLinkPositionChecked", label: "12. Checked travel of cable and link position?" },
          { key: "fusibleLinksReplaced", label: "13. Replaced fusible link(s)?" },
          { key: "manualPullStationChecked", label: "14. Checked operation of manual pull station?" },
          { key: "timeDelayChecked", label: "15. Checked operation of time delay?" },
          { key: "microSwitchChecked", label: "16. Checked operation of micro-switch?" }
        ]
      }
    },
    {
      key: "shutdowns-interfaces-checklist",
      title: "Shutdowns & Interfaces",
      renderer: "checklist",
      checklist: {
        dataset: "shutdowns-interfaces-checklist",
        style: "passFailGrid",
        items: [
          { key: "gasValveChecked", label: "17. Checked operation of gas valve?" },
          { key: "shutdownsChecked", label: "18. Checked operation of shut downs?" },
          { key: "reservePowerSupplyChecked", label: "19. Checked reserve power supply?" }
        ]
      }
    },
    {
      key: "facility-readiness-checklist",
      title: "Facility / Operational Readiness",
      renderer: "checklist",
      checklist: {
        dataset: "facility-readiness-checklist",
        style: "passFailGrid",
        items: [
          { key: "properExtinguishersOtherAreas", label: "23. Proper fire extinguishers for other areas?" },
          { key: "personnelInstructed", label: "24. Personnel instructed on operation of system?" },
          { key: "monthlyInspectionsPerformed", label: "25. Monthly inspections being performed?" },
          { key: "systemDischargedSinceLastInspection", label: "26. System discharged since last inspection?" },
          { key: "systemReturnedNormal", label: "27. System returned to normal operational condition?" }
        ]
      }
    },
    {
      key: "documentation-compliance-checklist",
      title: "Documentation & Compliance",
      renderer: "checklist",
      checklist: {
        dataset: "documentation-compliance-checklist",
        style: "passFailGrid",
        items: [
          { key: "originalPlansOnSite", label: "28. Plans of original installation on site?" },
          { key: "inspectionTagInstalled", label: "29. Inspection tag installed on system?" }
        ]
      }
    },
    {
      key: "fusible-links",
      title: "Fusible Links",
      description: "Fusible links inspected or replaced during this visit.",
      renderer: "table",
      table: {
        dataset: "fusible-links.fusibleLinks",
        repeatHeader: true,
        emptyMessage: "No fusible links recorded",
        columns: [
          { key: "linkLocation", label: "Location", width: "20%" },
          { key: "linkTemperatureRating", label: "Rating", width: "10%", hideIfEmpty: true },
          { key: "manufactureDate", label: "Mfg Date", width: "12%", hideIfEmpty: true },
          { key: "replacementDate", label: "Replacement", width: "12%", hideIfEmpty: true },
          { key: "condition", label: "Condition", width: "12%", hideIfEmpty: true, renderMode: "stacked" },
          { key: "quantity", label: "Qty", width: "7%", hideIfEmpty: true },
          { key: "result", label: "Result", width: "9%", hideIfEmpty: true, renderMode: "stacked" },
          { key: "notes", label: "Notes", width: "18%", hideIfEmpty: true }
        ]
      }
    },
    { key: "findings", title: "Findings and Deficiencies", renderer: "findings", emptyState: { mode: "show-clean-empty", message: "No deficiencies recorded" } },
    { key: "notes", title: "Notes", renderer: "notes", emptyState: { mode: "show-clean-empty", message: "No notes provided" } }
  ],
  photos: { enabled: true, title: "Photos", captionMode: "sequential" },
  signatures: { enabled: true, title: "Signatures", roles: ["Technician", "Customer"] }
};
