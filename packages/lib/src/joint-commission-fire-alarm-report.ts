import { RecurrenceFrequency } from "@prisma/client";

import type { ReportFieldDefinition, ReportSectionDefinition, ReportTemplateDefinition } from "./report-config";

const resultField: Exclude<ReportFieldDefinition, { type: "repeater" }> = {
  id: "result",
  label: "Result",
  type: "select",
  optionProvider: "jointCommissionFireAlarmResultOptions",
  requiredForFinalization: true,
  mobileDisplayType: "checklist_card",
  allowPhoto: true,
  requireNoteOnFail: true
};

const noteField: Exclude<ReportFieldDefinition, { type: "repeater" }> = {
  id: "notes",
  label: "Notes",
  type: "text",
  placeholder: "Document result details, limitations, or corrective context."
};

const photoField: Exclude<ReportFieldDefinition, { type: "repeater" }> = {
  id: "photo",
  label: "Photo",
  type: "photo"
};

function testingSection(input: {
  id: string;
  label: string;
  description: string;
  repeaterId: string;
  addLabel: string;
  rowFields: Array<Exclude<ReportFieldDefinition, { type: "repeater" }>>;
}): ReportSectionDefinition {
  return {
    id: input.id,
    label: input.label,
    description: input.description,
    mobileDisplayType: "grouped_check",
    fields: [
      {
        id: input.repeaterId,
        label: input.label,
        type: "repeater",
        addLabel: input.addLabel,
        duplicateLabel: "Duplicate row",
        completionFieldIds: ["result"],
        deficiencyFieldId: "result",
        carryForwardPriorRows: true,
        bulkActions: [
          { id: "mark_all_pass", label: "Mark All Pass", targets: [{ fieldId: "result", value: "pass" }] },
          { id: "mark_all_na", label: "Mark All N/A", targets: [{ fieldId: "result", value: "na" }] }
        ],
        rowFields: input.rowFields
      }
    ]
  };
}

const deviceSummarySeedRows = [
  "smoke_detectors",
  "heat_detectors",
  "pull_stations",
  "horn_strobes",
  "duct_detectors",
  "waterflow_switches",
  "tamper_switches",
  "monitor_modules",
  "control_modules",
  "elevator_recall_devices",
  "beam_detectors",
  "other"
].map((category) => ({ category }));

export const jointCommissionFireAlarmReportTemplate: ReportTemplateDefinition = {
  label: "Joint Commission fire alarm",
  description: "Healthcare-ready Joint Commission fire alarm inspection workflow with NFPA reference tracking, structured device testing, deficiencies, documentation review, signatures, and premium PDF output.",
  defaultRecurrenceFrequency: RecurrenceFrequency.ANNUAL,
  pdf: {
    subtitle: "Joint Commission Fire Alarm Inspection Report",
    nfpaReferences: [
      "NFPA 72 (2025 Edition) - National Fire Alarm and Signaling Code",
      "NFPA 101 (2024 Edition) - Life Safety Code",
      "CMS Life Safety Code - Current adopted healthcare life safety requirements",
      "Joint Commission EC.02.03.05 - Fire protection systems documentation"
    ]
  },
  sections: [
    {
      id: "inspection-information",
      label: "Inspection Information",
      description: "Capture the visit identity and healthcare documentation context required for survey-ready fire alarm records.",
      mobileDisplayType: "info_card",
      fields: [
        { id: "facilityName", label: "Facility name", type: "text", readOnly: true, prefill: [{ source: "siteDefault", key: "customerName" }], requiredForFinalization: true },
        { id: "facilityAddress", label: "Facility address", type: "text", readOnly: true, prefill: [{ source: "siteDefault", key: "siteAddress" }], requiredForFinalization: true },
        { id: "buildingArea", label: "Building / area", type: "text", placeholder: "Patient tower, surgery, MOB, clinic wing, or building identifier" },
        { id: "inspectionDateTime", label: "Inspection date / time", type: "text", readOnly: true, prefill: [{ source: "siteDefault", key: "scheduledDate" }], requiredForFinalization: true },
        { id: "frequency", label: "Frequency", type: "select", optionProvider: "jointCommissionFireAlarmFrequencyOptions", prefill: [{ source: "reportDefault", value: "annual" }], requiredForFinalization: true },
        { id: "facilityType", label: "Facility type", type: "select", optionProvider: "jointCommissionFireAlarmFacilityTypeOptions" },
        { id: "ahj", label: "AHJ", type: "select", optionProvider: "jointCommissionFireAlarmAhjOptions" },
        { id: "monitoringProvider", label: "Monitoring provider", type: "select", optionProvider: "jointCommissionFireAlarmMonitoringProviderOptions" },
        { id: "technician", label: "Technician", type: "text", placeholder: "Technician or inspector name" },
        { id: "customerRepresentative", label: "Customer representative", type: "text", placeholder: "Facility representative present" },
        { id: "reportNumber", label: "Report number", type: "text", placeholder: "Internal report reference" },
        { id: "workOrderNumber", label: "Work order number", type: "text", placeholder: "Work order / ticket reference" }
      ]
    },
    {
      id: "joint-commission-compliance-summary",
      label: "Joint Commission Compliance Summary",
      description: "Document the code and survey reference basis without hardcoding unverified section citations.",
      mobileDisplayType: "checklist_card",
      fields: [
        {
          id: "referencesUsed",
          label: "Code and survey references used",
          type: "repeater",
          addLabel: "Add reference",
          seedRows: [
            { referenceType: "nfpa_72", referenceDetail: "Fire alarm inspection and testing documentation" },
            { referenceType: "nfpa_101", referenceDetail: "Life Safety Code reference when applicable" },
            { referenceType: "cms_life_safety_code", referenceDetail: "CMS Life Safety Code documentation context" },
            { referenceType: "joint_commission_ec", referenceDetail: "Joint Commission Environment of Care reference used by facility" }
          ],
          rowFields: [
            { id: "referenceType", label: "Reference", type: "select", optionProvider: "jointCommissionFireAlarmReferenceOptions", requiredForFinalization: true },
            { id: "ecrReference", label: "ECR / EC reference", type: "select", optionProvider: "jointCommissionFireAlarmEcrReferenceOptions" },
            { id: "referenceDetail", label: "Reference detail", type: "text", placeholder: "Edition, facility policy, EC/LS/K-tag, or AHJ note" }
          ]
        },
        { id: "overallSystemResult", label: "Overall system result", type: "select", optionProvider: "jointCommissionFireAlarmFinalOutcomeOptions", requiredForFinalization: true },
        { id: "documentationComplete", label: "Documentation complete", type: "select", optionProvider: "yesNoNA", requiredForFinalization: true },
        { id: "complianceSummaryNotes", label: "Compliance summary notes", type: "text", placeholder: "Summarize survey-relevant context, exceptions, and limitations." }
      ]
    },
    {
      id: "fire-alarm-system-information",
      label: "Fire Alarm System Information",
      description: "Capture panel and system configuration once so technicians do not repeat metadata throughout the report.",
      mobileDisplayType: "info_card",
      fields: [
        { id: "manufacturer", label: "Manufacturer", type: "select", optionProvider: "jointCommissionFireAlarmManufacturerOptions" },
        { id: "panelModel", label: "Panel model", type: "select", optionProvider: "jointCommissionFireAlarmPanelModelOptions" },
        { id: "panelModelOther", label: "Panel model detail", type: "text", placeholder: "Enter model when Other is selected", visibleWhen: { fieldId: "panelModel", values: ["other"] } },
        { id: "panelSerialNumber", label: "Panel serial number", type: "text", placeholder: "Serial number" },
        { id: "softwareFirmwareVersion", label: "Software / firmware version", type: "text", placeholder: "Version when available" },
        { id: "occupancyType", label: "Occupancy type", type: "select", optionProvider: "jointCommissionFireAlarmOccupancyOptions" },
        { id: "numberOfDevices", label: "Number of devices", type: "number", allowQuantity: true },
        { id: "numberOfFloors", label: "Number of floors", type: "number", allowQuantity: true },
        { id: "sprinklerMonitoring", label: "Sprinkler monitoring", type: "select", optionProvider: "yesNoNA" },
        { id: "elevatorRecall", label: "Elevator recall", type: "select", optionProvider: "yesNoNA" },
        { id: "smokeControlInterface", label: "Smoke control interface", type: "select", optionProvider: "yesNoNA" },
        { id: "generatorInterface", label: "Generator interface", type: "select", optionProvider: "yesNoNA" },
        { id: "kitchenSuppressionInterface", label: "Kitchen suppression interface", type: "select", optionProvider: "yesNoNA" }
      ]
    },
    {
      id: "device-testing-summary",
      label: "Device Testing Summary",
      description: "Track device category quantities without forcing technicians to open every device unless detail is needed.",
      mobileDisplayType: "quantity_summary",
      fields: [
        {
          id: "deviceCategories",
          label: "Device categories",
          type: "repeater",
          addLabel: "Add device category",
          seedRows: deviceSummarySeedRows,
          completionFieldIds: ["quantityTested", "quantityPassed", "quantityFailed"],
          rowFields: [
            { id: "category", label: "Device category", type: "select", optionProvider: "jointCommissionFireAlarmDeviceTypeOptions" },
            { id: "quantityTested", label: "Quantity tested", type: "number", allowQuantity: true },
            { id: "quantityPassed", label: "Quantity passed", type: "number", allowQuantity: true },
            { id: "quantityFailed", label: "Quantity failed", type: "number", allowQuantity: true },
            noteField
          ]
        }
      ]
    },
    testingSection({
      id: "fire-alarm-control-unit-testing",
      label: "Fire Alarm Control Unit Testing",
      description: "Panel, power, signal, history, annunciator, and printer checks in one compact checklist.",
      repeaterId: "controlUnitTests",
      addLabel: "Add control unit test",
      rowFields: [
        { id: "testItem", label: "Test item", type: "select", options: [
          { label: "Panel normal condition", value: "panel_normal_condition" },
          { label: "Battery condition", value: "battery_condition" },
          { label: "Battery load test", value: "battery_load_test" },
          { label: "Ground fault detection", value: "ground_fault_detection" },
          { label: "Trouble signal operation", value: "trouble_signal_operation" },
          { label: "Supervisory signal operation", value: "supervisory_signal_operation" },
          { label: "Alarm signal operation", value: "alarm_signal_operation" },
          { label: "Remote annunciator", value: "remote_annunciator" },
          { label: "Event history logging", value: "event_history_logging" },
          { label: "Printer operation if applicable", value: "printer_operation" }
        ] },
        { id: "testMethod", label: "Test method", type: "select", optionProvider: "jointCommissionFireAlarmTestMethodOptions" },
        resultField,
        noteField,
        photoField
      ]
    }),
    testingSection({
      id: "notification-appliance-testing",
      label: "Notification Appliance Testing",
      description: "Type-aware notification appliance checks for audible and visible results by location.",
      repeaterId: "notificationAppliances",
      addLabel: "Add notification appliance",
      rowFields: [
        { id: "areaLocation", label: "Area / location", type: "text", placeholder: "2nd floor east corridor" },
        { id: "deviceType", label: "Device type", type: "select", optionProvider: "jointCommissionFireAlarmDeviceTypeOptions" },
        { id: "audibleResult", label: "Audible result", type: "select", optionProvider: "jointCommissionFireAlarmResultOptions" },
        { id: "visibleResult", label: "Visible result", type: "select", optionProvider: "jointCommissionFireAlarmResultOptions" },
        resultField,
        noteField,
        photoField
      ]
    }),
    testingSection({
      id: "smoke-detector-sensitivity-testing",
      label: "Smoke Detector Sensitivity Testing",
      description: "Record sensitivity results only for devices tested during this visit.",
      repeaterId: "sensitivityTests",
      addLabel: "Add sensitivity test",
      rowFields: [
        { id: "deviceId", label: "Device ID", type: "text", placeholder: "SD-101" },
        { id: "location", label: "Location", type: "text", placeholder: "Patient room 210" },
        { id: "sensitivityRange", label: "Sensitivity range", type: "text", placeholder: "Within listed range" },
        resultField,
        noteField
      ]
    }),
    testingSection({
      id: "elevator-recall-testing",
      label: "Elevator Recall Testing",
      description: "Document primary recall, alternate recall, shunt trip, and overall result for each elevator bank.",
      repeaterId: "elevatorRecallTests",
      addLabel: "Add elevator recall test",
      rowFields: [
        { id: "elevator", label: "Elevator", type: "text", placeholder: "Elevator bank A" },
        { id: "primaryRecall", label: "Primary recall", type: "select", optionProvider: "jointCommissionFireAlarmResultOptions" },
        { id: "alternateRecall", label: "Alternate recall", type: "select", optionProvider: "jointCommissionFireAlarmResultOptions" },
        { id: "shuntTrip", label: "Shunt trip", type: "select", optionProvider: "jointCommissionFireAlarmResultOptions" },
        resultField,
        noteField
      ]
    }),
    testingSection({
      id: "sprinkler-monitoring-interface",
      label: "Sprinkler Monitoring Interface",
      description: "Document alarm and supervisory interfaces that feed the fire alarm system.",
      repeaterId: "sprinklerInterfaces",
      addLabel: "Add interface check",
      rowFields: [
        { id: "interfaceItem", label: "Interface", type: "select", options: [
          { label: "Waterflow alarm", value: "waterflow_alarm" },
          { label: "Valve tamper supervisory", value: "valve_tamper_supervisory" },
          { label: "Fire pump monitoring", value: "fire_pump_monitoring" },
          { label: "Kitchen suppression monitoring", value: "kitchen_suppression_monitoring" }
        ] },
        { id: "signalType", label: "Signal type", type: "select", optionProvider: "jointCommissionFireAlarmSignalTypeOptions" },
        resultField,
        noteField
      ]
    }),
    {
      id: "central-station-communication",
      label: "Central Station Communication",
      description: "Verify primary/secondary paths and receipt of alarm, trouble, and supervisory signals.",
      mobileDisplayType: "checklist_card",
      fields: [
        { id: "primaryCommunication", label: "Primary communication", type: "select", optionProvider: "jointCommissionFireAlarmCommunicationPathOptions" },
        { id: "secondaryCommunication", label: "Secondary communication", type: "select", optionProvider: "jointCommissionFireAlarmCommunicationPathOptions" },
        { id: "alarmSignalReceiptVerification", label: "Alarm signal receipt verification", type: "select", optionProvider: "jointCommissionFireAlarmResultOptions" },
        { id: "troubleSignalReceiptVerification", label: "Trouble signal receipt verification", type: "select", optionProvider: "jointCommissionFireAlarmResultOptions" },
        { id: "supervisorySignalReceiptVerification", label: "Supervisory signal receipt verification", type: "select", optionProvider: "jointCommissionFireAlarmResultOptions" },
        { id: "communicationNotes", label: "Communication notes", type: "text", placeholder: "Signal confirmations, account numbers, operator initials, or limitations." }
      ]
    },
    {
      id: "deficiencies-and-recommendations",
      label: "Deficiencies and Recommendations",
      description: "Failed items can be documented inline, photographed, and carried into quote preparation.",
      mobileDisplayType: "issue_list",
      fields: [
        {
          id: "deficiencies",
          label: "Deficiencies",
          type: "repeater",
          addLabel: "Add deficiency",
          duplicateLabel: "Duplicate deficiency",
          rowFields: [
            { id: "deficiencyId", label: "Deficiency ID", type: "text", sequentialDefault: { prefix: "FA-" } },
            { id: "location", label: "Location", type: "text", placeholder: "Device, panel, room, or area" },
            { id: "description", label: "Description", type: "text", placeholder: "Customer-facing deficiency description" },
            { id: "severity", label: "Severity", type: "select", optionProvider: "jointCommissionFireAlarmDeficiencySeverityOptions" },
            { id: "recommendation", label: "Recommendation", type: "select", optionProvider: "jointCommissionFireAlarmCorrectiveActionOptions" },
            { id: "photo", label: "Photo attachment", type: "photo" },
            { id: "quoteRequired", label: "Quote required", type: "select", optionProvider: "yesNoNA" }
          ]
        }
      ]
    },
    {
      id: "joint-commission-documentation-review",
      label: "Joint Commission Documentation Review",
      description: "Confirm the documentation controls surveyors commonly ask to review with fire alarm records.",
      mobileDisplayType: "checklist_card",
      fields: [
        { id: "inspectionDocumentationAvailable", label: "Inspection documentation available", type: "select", optionProvider: "yesNoNA" },
        { id: "previousDeficienciesReviewed", label: "Previous deficiencies reviewed", type: "select", optionProvider: "yesNoNA" },
        { id: "impairmentProceduresReviewed", label: "Impairment procedures reviewed", type: "select", optionProvider: "yesNoNA" },
        { id: "staffNotificationProceduresReviewed", label: "Staff notification procedures reviewed", type: "select", optionProvider: "yesNoNA" },
        { id: "fireWatchProceduresReviewed", label: "Fire watch procedures reviewed", type: "select", optionProvider: "yesNoNA" },
        { id: "requiredTestingFrequenciesCurrent", label: "Required testing frequencies current", type: "select", optionProvider: "yesNoNA" },
        { id: "documentationRetentionCompliant", label: "Documentation retention compliant", type: "select", optionProvider: "yesNoNA" },
        { id: "documentationReviewNotes", label: "Documentation review notes", type: "text", placeholder: "Document missing records, facility policy notes, or follow-up." }
      ]
    },
    {
      id: "technician-notes",
      label: "Technician Notes",
      description: "Freeform field notes, access limitations, owner direction, and service context.",
      fields: [
        { id: "technicianNotes", label: "Technician notes", type: "text", placeholder: "Add technician notes for the inspection record." }
      ]
    },
    {
      id: "customer-acknowledgment",
      label: "Customer Acknowledgment",
      description: "Capture customer representative details used alongside the customer signature.",
      mobileDisplayType: "signature",
      fields: [
        { id: "customerRepresentativeName", label: "Customer representative name", type: "text", placeholder: "Representative name" },
        { id: "customerRepresentativeTitle", label: "Title", type: "text", placeholder: "Facility title" },
        { id: "customerAcknowledgmentDate", label: "Date", type: "date" }
      ]
    },
    {
      id: "technician-certification",
      label: "Technician Certification",
      description: "Capture technician certification details used alongside the technician signature.",
      mobileDisplayType: "signature",
      fields: [
        { id: "technicianName", label: "Technician name", type: "text", placeholder: "Technician name" },
        { id: "licenseNumber", label: "License number", type: "text", placeholder: "License, NICET, or certification number" },
        { id: "technicianCertificationDate", label: "Date", type: "date" }
      ]
    },
    {
      id: "final-outcome",
      label: "Final Outcome",
      description: "Summarize the final disposition in clear healthcare-ready language.",
      mobileDisplayType: "checklist_card",
      fields: [
        { id: "finalOutcome", label: "Final outcome", type: "select", optionProvider: "jointCommissionFireAlarmFinalOutcomeOptions", requiredForFinalization: true },
        { id: "fireWatchRecommendation", label: "Fire watch recommendation", type: "select", optionProvider: "jointCommissionFireAlarmFireWatchRecommendationOptions" },
        { id: "impairmentStatus", label: "Impairment status", type: "select", optionProvider: "jointCommissionFireAlarmImpairmentStatusOptions" },
        { id: "outcomeNotes", label: "Outcome notes", type: "text", placeholder: "Summarize final status and next steps." }
      ]
    },
    {
      id: "follow-up-actions",
      label: "Follow-Up Actions",
      description: "Select all next steps required after this visit.",
      mobileDisplayType: "issue_list",
      fields: [
        {
          id: "followUpActions",
          label: "Follow-up actions",
          type: "repeater",
          addLabel: "Add follow-up action",
          rowFields: [
            { id: "action", label: "Action", type: "select", optionProvider: "jointCommissionFireAlarmFollowUpActionOptions" },
            { id: "owner", label: "Owner", type: "text", placeholder: "Office, technician, facility, monitoring company, AHJ" },
            { id: "dueDate", label: "Due date", type: "date" },
            noteField
          ]
        }
      ]
    },
    {
      id: "attachments",
      label: "Attachments",
      description: "Track uploaded PDF/supporting documentation such as panel reports, device reports, sensitivity reports, and monitoring confirmations.",
      mobileDisplayType: "photo_gallery",
      fields: [
        {
          id: "attachmentRegister",
          label: "Attachment register",
          type: "repeater",
          addLabel: "Add attachment reference",
          rowFields: [
            { id: "attachmentType", label: "Attachment type", type: "select", options: [
              { label: "Panel report", value: "panel_report" },
              { label: "Device report", value: "device_report" },
              { label: "Sensitivity report", value: "sensitivity_report" },
              { label: "Battery calculation", value: "battery_calculation" },
              { label: "Deficiency photo", value: "deficiency_photo" },
              { label: "Monitoring confirmation", value: "monitoring_confirmation" },
              { label: "Other uploaded PDF", value: "other_uploaded_pdf" }
            ] },
            { id: "description", label: "Description", type: "text", placeholder: "Attachment description or file reference" },
            { id: "verified", label: "Verified", type: "select", optionProvider: "yesNoNA" }
          ]
        }
      ]
    }
  ]
};
