import type { ReportFieldDefinition, ReportSectionDefinition, ReportTemplateDefinition } from "./report-config";
import { buildBackflowChecklistSeedRows } from "./report-requirements";

const visualInspectionRowFields: Array<Exclude<ReportFieldDefinition, { type: "repeater" }>> = [
  { id: "requirementKey", label: "Requirement key", type: "text", hidden: true, readOnly: true },
  { id: "requirementProfileKey", label: "Requirement profile", type: "text", hidden: true, readOnly: true },
  { id: "requirementEditionLabel", label: "Requirement edition", type: "text", hidden: true, readOnly: true },
  { id: "frequencyLabel", label: "Frequency", type: "text", hidden: true, readOnly: true },
  { id: "displayLabel", label: "Inspection item", type: "text", readOnly: true },
  { id: "codeRef", label: "Code reference", type: "text", readOnly: true },
  { id: "result", label: "Result", type: "select", optionProvider: "backflowStatusOptions" },
  { id: "condition", label: "Condition", type: "select", optionProvider: "backflowConditionOptions" },
  { id: "comments", label: "Inspector comments", type: "text", placeholder: "Document observed conditions, access limitations, readings, or notable context for this checkpoint." },
  { id: "customerComment", label: "Customer-facing note", type: "text", placeholder: "Plain-language note that should appear in the customer-facing report when this item needs attention." },
  { id: "correctiveAction", label: "Corrective-action notes", type: "text", placeholder: "Document what was repaired, what still needs work, or what follow-up is recommended." },
  { id: "photo", label: "Photo", type: "photo" }
];

function buildBackflowPhotoSection(): ReportSectionDefinition {
  return {
    id: "photos",
    label: "Photos and attachments",
    description: "Guide the technician through customer-ready documentation photos without cluttering the field workflow.",
    fields: [
      {
        id: "photoSet",
        label: "Photo documentation",
        type: "repeater",
        addLabel: "Add photo",
        validation: [{ type: "minRows", value: 1, message: "Add at least one overview or documentation photo before finalizing." }],
        rowFields: [
          { id: "category", label: "Photo category", type: "select", optionProvider: "backflowPhotoCategoryOptions" },
          { id: "caption", label: "Caption", type: "text", placeholder: "Describe what this photo documents for the inspection record." },
          { id: "photo", label: "Photo", type: "photo" },
          { id: "comments", label: "Comments", type: "text", placeholder: "Optional extra context for the office, customer, or follow-up team." }
        ]
      }
    ]
  };
}

export const backflowReportTemplate: ReportTemplateDefinition = {
  label: "Fire sprinkler backflow",
  description: "NFPA-25-style fire sprinkler backflow inspection and test workflow with smart asset prefill, structured visual/test documentation, and polished customer-facing output.",
  pdf: {
    subtitle: "Fire Sprinkler Backflow Inspection Report",
    nfpaReferences: ["NFPA 25"]
  },
  sections: [
    {
      id: "header",
      label: "Header",
      description: "Capture the core visit, site, and jurisdiction context in the same clean report family used across TradeWorx.",
      fields: [
        { id: "customerName", label: "Customer", type: "text", readOnly: true, prefill: [{ source: "siteDefault", key: "customerName" }] },
        { id: "siteName", label: "Site", type: "text", readOnly: true, prefill: [{ source: "siteDefault", key: "siteName" }] },
        { id: "buildingArea", label: "Building / area", type: "text", placeholder: "Building, riser room, pump room, yard vault, or service area" },
        { id: "siteAddress", label: "Site address", type: "text", readOnly: true, prefill: [{ source: "siteDefault", key: "siteAddress" }, { source: "siteDefault", key: "siteName" }] },
        { id: "workOrderNumber", label: "Work order number", type: "text", placeholder: "Optional office work order reference" },
        { id: "jobNumber", label: "Job number", type: "text", placeholder: "Optional job or dispatch number" },
        { id: "inspectionDate", label: "Inspection date", type: "text", readOnly: true, prefill: [{ source: "siteDefault", key: "scheduledDate" }] },
        { id: "inspectionStartTime", label: "Inspection start time", type: "text", placeholder: "9:00 AM" },
        { id: "inspectionEndTime", label: "Inspection end time", type: "text", placeholder: "10:15 AM" },
        { id: "technician", label: "Technician", type: "text", placeholder: "Technician or tester name" },
        { id: "technicianLicenseOrCertification", label: "License / certification", type: "text", placeholder: "State certification, company license, or tester credential" },
        { id: "inspectionType", label: "Inspection type", type: "select", optionProvider: "backflowInspectionTypeOptions" },
        { id: "tagStatus", label: "Tag status", type: "select", optionProvider: "backflowTagStatusOptions" },
        { id: "ahjName", label: "AHJ", type: "text", placeholder: "Authority having jurisdiction, water purveyor, or inspector requestor" },
        { id: "adoptedCodeEdition", label: "Adopted code edition", type: "select", optionProvider: "backflowCodeEditionOptions" }
      ]
    },
    {
      id: "site-context",
      label: "Site and system context",
      description: "Set the fire protection context for the assembly so the report reads like a real operational inspection record.",
      fields: [
        {
          id: "requirementProfile",
          label: "Requirement profile",
          type: "select",
          optionProvider: "backflowRequirementProfiles",
          prefill: [
            { source: "priorField", sectionId: "site-context", fieldId: "requirementProfile" },
            { source: "reportDefault", value: "nfpa25_2023_backflow" }
          ]
        },
        { id: "fireProtectionSystemServed", label: "System served", type: "select", optionProvider: "backflowSystemServedOptions" },
        { id: "sprinklerSystemType", label: "Sprinkler system type", type: "select", optionProvider: "backflowSprinklerSystemTypeOptions" },
        { id: "waterSupplyType", label: "Water supply type", type: "select", optionProvider: "backflowWaterSupplyTypeOptions" },
        { id: "occupancyType", label: "Occupancy type", type: "select", optionProvider: "backflowOccupancyTypeOptions" },
        { id: "systemStatusAtArrival", label: "System status at arrival", type: "select", optionProvider: "backflowSystemStatusOptions" },
        { id: "monitoringStatus", label: "Monitoring status", type: "select", optionProvider: "backflowMonitoringStatusOptions" },
        { id: "notesOnOccupancyOrHazard", label: "Occupancy / hazard notes", type: "text", placeholder: "Document hazard use, access limitations, risk exposure, or other site context important to the inspection." }
      ]
    },
    {
      id: "assembly-identification",
      label: "Backflow assembly identification",
      description: "Prefill known asset metadata when available and capture the exact assembly details tied to the fire protection system.",
      fields: [
        {
          id: "assemblies",
          label: "Backflow assemblies",
          type: "repeater",
          addLabel: "Add assembly",
          repeatableSource: "siteAssets",
          rowIdentityField: "assetId",
          validation: [{ type: "minRows", value: 1, message: "Add at least one backflow assembly before finalizing." }],
          rowFields: [
            {
              id: "assetId",
              label: "Linked asset",
              type: "select",
              optionProvider: "assetSelect",
              mappings: [
                {
                  source: "optionMetadata",
                  targets: [
                    { fieldId: "deviceTagNumber", sourceKey: "assetTag", mode: "always" },
                    { fieldId: "assemblyManufacturer", sourceKey: "manufacturer", mode: "if_empty" },
                    { fieldId: "assemblyModel", sourceKey: "model", mode: "if_empty" },
                    { fieldId: "assemblySize", sourceKey: "sizeInches", mode: "if_empty" },
                    { fieldId: "serialNumber", sourceKey: "serialNumber", mode: "if_empty" },
                    { fieldId: "assemblyLocation", sourceKey: "location", mode: "always" },
                    { fieldId: "installationOrientation", sourceKey: "installationOrientation", mode: "if_empty" },
                    { fieldId: "detectorMeterPresent", sourceKey: "detectorMeterPresent", mode: "if_empty" },
                    { fieldId: "fireLineType", sourceKey: "fireLineType", mode: "if_empty" },
                    { fieldId: "installYear", sourceKey: "installYear", mode: "if_empty" },
                    { fieldId: "assemblyType", sourceKey: "assemblyType", mode: "if_empty" }
                  ]
                }
              ]
            },
            { id: "assemblyType", label: "Assembly type", type: "select", optionProvider: "backflowAssemblyTypes" },
            { id: "assemblyManufacturer", label: "Manufacturer", type: "select", optionProvider: "backflowManufacturers", customValueFieldId: "assemblyManufacturerOther", customValueTrigger: "other" },
            { id: "assemblyManufacturerOther", label: "Manufacturer other", type: "text", placeholder: "Enter manufacturer", visibleWhen: { fieldId: "assemblyManufacturer", values: ["other"] } },
            { id: "assemblyModel", label: "Model", type: "text", placeholder: "Assembly model" },
            { id: "assemblySize", label: "Assembly size", type: "select", optionProvider: "backflowAssemblySizeOptions", customValueFieldId: "assemblySizeOther", customValueTrigger: "other" },
            { id: "assemblySizeOther", label: "Assembly size other", type: "text", placeholder: "Enter assembly size", visibleWhen: { fieldId: "assemblySize", values: ["other"] } },
            { id: "serialNumber", label: "Serial number", type: "text", placeholder: "Serial number" },
            { id: "assemblyLocation", label: "Assembly location", type: "text", placeholder: "Riser room, vault, exterior enclosure, or mechanical room" },
            { id: "installationOrientation", label: "Installation orientation", type: "select", optionProvider: "backflowOrientationOptions" },
            { id: "detectorMeterPresent", label: "Detector meter present", type: "select", optionProvider: "backflowDetectorMeterOptions" },
            { id: "fireLineType", label: "Fire line type", type: "select", optionProvider: "backflowFireLineTypeOptions" },
            { id: "installYear", label: "Install year", type: "text", placeholder: "YYYY", normalizeAs: "twoDigitYear" },
            { id: "deviceTagNumber", label: "Device tag number", type: "text", placeholder: "Tag, asset, or tester identifier" }
          ]
        },
        {
          id: "assembliesDocumented",
          label: "Assemblies documented",
          type: "number",
          calculation: { key: "assetCountFromRepeater", sourceFieldId: "assemblies" },
          readOnly: true
        },
        {
          id: "detectorAssembliesCount",
          label: "Detector assemblies",
          type: "number",
          calculation: {
            key: "countRowsMatchingAnyValues",
            sourceFieldId: "assemblies",
            rowFieldIds: ["assemblyType"],
            values: ["dcda", "rpda", "detector_check"]
          },
          readOnly: true
        }
      ]
    },
    {
      id: "inspection-scope",
      label: "Inspection scope and workflow",
      description: "Drive the correct test path and prompts with explicit scope selections while staying adaptable to the adopted NFPA profile.",
      fields: [
        {
          id: "assemblyType",
          label: "Assembly type",
          type: "select",
          optionProvider: "backflowAssemblyTypes",
          mappings: [
            {
              source: "optionMetadata",
              targets: [{ fieldId: "assemblyConfigurationDetected", sourceKey: "workflow", mode: "always" }]
            }
          ],
          prefill: [{ source: "priorField", sectionId: "inspection-scope", fieldId: "assemblyType" }]
        },
        { id: "testReason", label: "Test reason", type: "select", optionProvider: "backflowTestReasonOptions" },
        {
          id: "assemblyConfigurationDetected",
          label: "Assembly workflow",
          type: "text",
          readOnly: true,
          prefill: [{ source: "priorField", sectionId: "inspection-scope", fieldId: "assemblyConfigurationDetected" }]
        },
        { id: "detectorAssemblyNotes", label: "Detector assembly notes", type: "text", placeholder: "Use for detector-line coordination, meter observations, or other detector-specific scope notes." }
      ]
    },
    {
      id: "visual-inspection",
      label: "Visual inspection",
      description: "Move through a structured NFPA-25-style visual inspection set with standardized outcomes, comments, and customer-facing notes.",
      fields: [
        {
          id: "visualInspectionItems",
          label: "Visual inspection items",
          type: "repeater",
          addLabel: "Add inspection item",
          bulkActions: [
            { id: "mark_all_pass", label: "Mark All Pass", targets: [{ fieldId: "result", value: "pass" }] },
            { id: "mark_all_na", label: "Mark All N/A", targets: [{ fieldId: "result", value: "na" }] }
          ],
          completionFieldIds: ["result"],
          deficiencyFieldId: "result",
          seedRows: buildBackflowChecklistSeedRows(),
          rowFields: visualInspectionRowFields
        },
        {
          id: "visualInspectionCompleted",
          label: "Visual items completed",
          type: "number",
          calculation: {
            key: "countRowsMatchingAnyValues",
            sourceFieldId: "visualInspectionItems",
            rowFieldIds: ["result"],
            values: ["pass", "fail", "na"]
          },
          readOnly: true
        },
        {
          id: "visualInspectionDeficiencyCount",
          label: "Visual deficiencies",
          type: "number",
          calculation: {
            key: "countRowsMatchingAnyValues",
            sourceFieldId: "visualInspectionItems",
            rowFieldIds: ["result"],
            values: ["fail", "deficiency"]
          },
          readOnly: true
        }
      ]
    },
    {
      id: "test-results",
      label: "Test results",
      description: "Capture the initial test, detector-specific notes, and any repair / re-test path in a structured, customer-ready record.",
      fields: [
        { id: "testPerformed", label: "Test performed", type: "select", optionProvider: "backflowTestPerformedOptions", prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "testPerformed" }] },
        { id: "noTestReason", label: "No-test reason", type: "text", placeholder: "Document why the test could not be completed or was only partially completed.", visibleWhen: { fieldId: "testPerformed", values: ["no", "partial", "could_not_complete"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "noTestReason" }] },
        { id: "testKitIdentifier", label: "Test kit identifier", type: "text", placeholder: "Gauge / kit serial or identifier", prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "testKitIdentifier" }] },
        { id: "testKitCalibrationDate", label: "Test kit calibration date", type: "text", placeholder: "Calibration date", prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "testKitCalibrationDate" }] },
        { id: "initialTestOverallResult", label: "Initial test overall result", type: "select", optionProvider: "backflowInitialTestResultOptions", prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "initialTestOverallResult" }] },
        { id: "testerComments", label: "Tester comments", type: "text", placeholder: "Summarize the testing sequence, conditions encountered, and any abnormal findings.", prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "testerComments" }] },
        { id: "dcCheck1Reading", label: "DC check #1 reading (psi)", type: "number", placeholder: "0.0", visibleWhen: { fieldId: "assemblyType", values: ["dcda", "dcva", "double_check", "detector_check"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "dcCheck1Reading" }] },
        { id: "dcCheck1Result", label: "DC check #1 result", type: "select", optionProvider: "backflowStatusOptions", visibleWhen: { fieldId: "assemblyType", values: ["dcda", "dcva", "double_check", "detector_check"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "dcCheck1Result" }] },
        { id: "dcCheck2Reading", label: "DC check #2 reading (psi)", type: "number", placeholder: "0.0", visibleWhen: { fieldId: "assemblyType", values: ["dcda", "dcva", "double_check", "detector_check"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "dcCheck2Reading" }] },
        { id: "dcCheck2Result", label: "DC check #2 result", type: "select", optionProvider: "backflowStatusOptions", visibleWhen: { fieldId: "assemblyType", values: ["dcda", "dcva", "double_check", "detector_check"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "dcCheck2Result" }] },
        { id: "dcShutoffValveCondition", label: "DC shutoff valve condition", type: "select", optionProvider: "backflowStatusOptions", visibleWhen: { fieldId: "assemblyType", values: ["dcda", "dcva", "double_check", "detector_check"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "dcShutoffValveCondition" }] },
        { id: "dcOverallResult", label: "DC overall result", type: "select", optionProvider: "backflowStatusOptions", visibleWhen: { fieldId: "assemblyType", values: ["dcda", "dcva", "double_check", "detector_check"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "dcOverallResult" }] },
        { id: "rpCheck1Reading", label: "RP check #1 reading (psi)", type: "number", placeholder: "0.0", visibleWhen: { fieldId: "assemblyType", values: ["rpda", "rpz", "rpza", "reduced_pressure"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "rpCheck1Reading" }] },
        { id: "rpCheck1Result", label: "RP check #1 result", type: "select", optionProvider: "backflowStatusOptions", visibleWhen: { fieldId: "assemblyType", values: ["rpda", "rpz", "rpza", "reduced_pressure"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "rpCheck1Result" }] },
        { id: "rpReliefValveOpeningPoint", label: "Relief valve opening point (psi)", type: "number", placeholder: "0.0", visibleWhen: { fieldId: "assemblyType", values: ["rpda", "rpz", "rpza", "reduced_pressure"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "rpReliefValveOpeningPoint" }] },
        { id: "rpReliefValveDischargeObserved", label: "Relief discharge observed", type: "select", optionProvider: "backflowReliefDischargeOptions", visibleWhen: { fieldId: "assemblyType", values: ["rpda", "rpz", "rpza", "reduced_pressure"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "rpReliefValveDischargeObserved" }] },
        { id: "rpCheck2Reading", label: "RP check #2 reading (psi)", type: "number", placeholder: "0.0", visibleWhen: { fieldId: "assemblyType", values: ["rpda", "rpz", "rpza", "reduced_pressure"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "rpCheck2Reading" }] },
        { id: "rpCheck2Result", label: "RP check #2 result", type: "select", optionProvider: "backflowStatusOptions", visibleWhen: { fieldId: "assemblyType", values: ["rpda", "rpz", "rpza", "reduced_pressure"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "rpCheck2Result" }] },
        { id: "rpOverallResult", label: "RP overall result", type: "select", optionProvider: "backflowStatusOptions", visibleWhen: { fieldId: "assemblyType", values: ["rpda", "rpz", "rpza", "reduced_pressure"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "rpOverallResult" }] },
        { id: "detectorMeterCondition", label: "Detector meter condition", type: "select", optionProvider: "backflowStatusOptions", visibleWhen: { fieldId: "assemblyType", values: ["dcda", "rpda", "detector_check"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "detectorMeterCondition" }] },
        { id: "detectorLineNotes", label: "Detector line notes", type: "text", placeholder: "Document detector line coordination, meter observations, or related fire service notes.", visibleWhen: { fieldId: "assemblyType", values: ["dcda", "rpda", "detector_check"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "detectorLineNotes" }] },
        { id: "repairsPerformedBeforeRetest", label: "Repairs performed before re-test", type: "select", optionProvider: "backflowYesNoOptions", visibleWhen: { fieldId: "initialTestOverallResult", values: ["fail"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "repairsPerformedBeforeRetest" }] },
        { id: "retestPerformed", label: "Re-test performed", type: "select", optionProvider: "backflowYesNoOptions", visibleWhen: { fieldId: "initialTestOverallResult", values: ["fail"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "retestPerformed" }] },
        { id: "retestDateTime", label: "Re-test date / time", type: "text", placeholder: "Date and time of re-test", visibleWhen: { fieldId: "retestPerformed", values: ["yes"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "retestDateTime" }] },
        { id: "retestCheck1Reading", label: "Re-test check #1 reading (psi)", type: "number", placeholder: "0.0", visibleWhen: { fieldId: "retestPerformed", values: ["yes"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "retestCheck1Reading" }] },
        { id: "retestCheck2Reading", label: "Re-test check #2 reading (psi)", type: "number", placeholder: "0.0", visibleWhen: { fieldId: "retestPerformed", values: ["yes"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "retestCheck2Reading" }] },
        { id: "retestReliefReading", label: "Re-test relief reading (psi)", type: "number", placeholder: "0.0", visibleWhen: { fieldId: "retestPerformed", values: ["yes"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "retestReliefReading" }] },
        { id: "retestOverallResult", label: "Re-test overall result", type: "select", optionProvider: "backflowStatusOptions", visibleWhen: { fieldId: "retestPerformed", values: ["yes"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "retestOverallResult" }] },
        { id: "retestComments", label: "Re-test comments", type: "text", placeholder: "Document repair verification and the outcome of re-testing.", visibleWhen: { fieldId: "retestPerformed", values: ["yes"] }, prefill: [{ source: "priorField", sectionId: "test-results", fieldId: "retestComments" }] }
      ]
    },
    {
      id: "deficiencies",
      label: "Deficiencies and impairments",
      description: "Use structured, customer-facing deficiency entries instead of a single generic note so the report is operationally useful and defensible.",
      fields: [
        {
          id: "deficiencyItems",
          label: "Deficiency items",
          type: "repeater",
          addLabel: "Add deficiency",
          rowFields: [
            { id: "deficiencyTitle", label: "Deficiency title", type: "text", placeholder: "Short deficiency title" },
            { id: "deficiencyCategory", label: "Category", type: "select", optionProvider: "backflowDeficiencyCategoryOptions" },
            { id: "severity", label: "Severity", type: "select", optionProvider: "backflowSeverityOptions" },
            { id: "codeReference", label: "Code reference", type: "text", placeholder: "NFPA / AHJ reference if applicable" },
            { id: "customerFacingDescription", label: "Customer-facing description", type: "text", placeholder: "Plain-language description of the issue and why it matters." },
            { id: "recommendedAction", label: "Recommended action", type: "select", optionProvider: "backflowRecommendationOptions" },
            { id: "repairPriority", label: "Repair priority", type: "select", optionProvider: "backflowRepairPriorityOptions" },
            { id: "systemLeftInService", label: "System left in service", type: "select", optionProvider: "backflowSystemLeftInServiceOptions" },
            { id: "impairmentProcedureNeeded", label: "Impairment procedure needed", type: "select", optionProvider: "backflowUnknownYesNoOptions" },
            { id: "fireWatchDiscussed", label: "Fire watch discussed", type: "select", optionProvider: "backflowFireWatchOptions" },
            { id: "photo", label: "Deficiency photo", type: "photo" }
          ]
        },
        {
          id: "deficiencyCount",
          label: "Structured deficiency count",
          type: "number",
          calculation: { key: "assetCountFromRepeater", sourceFieldId: "deficiencyItems" },
          readOnly: true
        }
      ]
    },
    {
      id: "corrective-actions",
      label: "Corrective actions and repairs",
      description: "Record what was repaired on site, what parts were used, and whether post-repair testing or further work is still required.",
      fields: [
        { id: "repairsPerformedOnSite", label: "Repairs performed on site", type: "select", optionProvider: "backflowRepairsPerformedOptions" },
        {
          id: "partsReplaced",
          label: "Parts replaced",
          type: "repeater",
          addLabel: "Add part",
          rowFields: [
            { id: "partName", label: "Part name", type: "text", placeholder: "Part or kit name" },
            { id: "quantity", label: "Quantity", type: "number", placeholder: "1" },
            { id: "notes", label: "Notes", type: "text", placeholder: "Part details or installation notes" }
          ]
        },
        { id: "adjustmentsMade", label: "Adjustments made", type: "text", placeholder: "Describe adjustments, cleaning, or setup changes made on site." },
        { id: "postRepairTestingCompleted", label: "Post-repair testing completed", type: "select", optionProvider: "backflowYesNoNAOptions" },
        { id: "unresolvedIssuesRemain", label: "Unresolved issues remain", type: "select", optionProvider: "backflowYesNoOptions" },
        { id: "unresolvedIssueSummary", label: "Unresolved issue summary", type: "text", placeholder: "Summarize what still needs repair, replacement, or further evaluation.", visibleWhen: { fieldId: "unresolvedIssuesRemain", values: ["yes"] } }
      ]
    },
    buildBackflowPhotoSection(),
    {
      id: "final-disposition",
      label: "Final disposition",
      description: "Close the record with a clear service outcome, next steps, and a customer-facing summary suitable for the final PDF and portal view.",
      fields: [
        { id: "finalResult", label: "Final result", type: "select", optionProvider: "backflowFinalResultOptions" },
        { id: "deviceLeftInService", label: "Device left in service", type: "select", optionProvider: "backflowSystemLeftInServiceOptions" },
        { id: "followUpRequired", label: "Follow-up required", type: "select", optionProvider: "backflowYesNoOptions" },
        { id: "followUpRecommendation", label: "Follow-up recommendation", type: "select", optionProvider: "backflowFollowUpRecommendationOptions" },
        { id: "nextServiceDue", label: "Next service due", type: "text", placeholder: "Next recommended service or test date" },
        { id: "impairmentNotes", label: "Impairment / outage notes", type: "text", placeholder: "Document owner notification, fire watch, impairment procedure, or service-restoration notes.", visibleWhen: { fieldId: "deviceLeftInService", values: ["no", "partially"] } },
        { id: "customerFacingSummary", label: "Customer-facing summary", type: "text", placeholder: "Summarize the assembly condition, test outcome, deficiencies, and next steps in plain language." }
      ]
    },
    {
      id: "signatures",
      label: "Signatures and acknowledgment",
      description: "Capture the printed-name and acknowledgment context that surrounds the required signature flow already used across TradeWorx reports.",
      fields: [
        { id: "technicianPrintedName", label: "Technician printed name", type: "text", placeholder: "Technician printed name" },
        { id: "customerRepresentativeName", label: "Customer representative name", type: "text", placeholder: "Customer representative" },
        { id: "customerRepresentativeTitle", label: "Customer representative title", type: "text", placeholder: "Title or role" },
        { id: "completedDateTime", label: "Completed date / time", type: "text", placeholder: "Completion date and time" }
      ]
    }
  ]
};
