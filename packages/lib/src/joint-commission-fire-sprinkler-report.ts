import type { ReportFieldDefinition, ReportSectionDefinition, ReportTemplateDefinition } from "./report-config";
import { buildJointCommissionSprinklerSeedRows } from "./report-requirements";

const checklistRowFields: Array<Exclude<ReportFieldDefinition, { type: "repeater" }>> = [
  { id: "requirementKey", label: "Requirement key", type: "text", hidden: true, readOnly: true },
  { id: "requirementProfileKey", label: "Requirement profile", type: "text", hidden: true, readOnly: true },
  { id: "requirementEditionLabel", label: "Requirement edition", type: "text", hidden: true, readOnly: true },
  { id: "itemLabel", label: "Inspection item", type: "text", readOnly: true },
  { id: "epLabel", label: "Element of performance", type: "text", readOnly: true },
  { id: "codeLabel", label: "Code reference", type: "text", readOnly: true },
  { id: "frequencyLabel", label: "Frequency", type: "text", readOnly: true },
  { id: "photoRequiredWhenFailed", label: "Photo required when failed", type: "text", hidden: true, readOnly: true },
  { id: "result", label: "Result", type: "select", optionProvider: "jointCommissionStatusOptions" },
  { id: "comments", label: "Comments", type: "text", placeholder: "Document findings, readings, limits, or notable observations for this item." },
  { id: "correctiveAction", label: "Corrective action note", type: "text", placeholder: "Document what was corrected on site or what action should follow." },
  { id: "photo", label: "Photo", type: "photo" }
];

function buildChecklistSection(input: {
  id: string;
  label: string;
  description: string;
  repeaterId: string;
  frequency: "quarterly" | "annual";
  visibleValues: string[];
}) : ReportSectionDefinition {
  return {
    id: input.id,
    label: input.label,
    description: input.description,
    fields: [
      {
        id: input.repeaterId,
        label: input.label,
        type: "repeater",
        addLabel: `Add ${input.frequency} item`,
        bulkActions: [
          { id: "mark_all_pass", label: "Mark All Pass", targets: [{ fieldId: "result", value: "pass" }] },
          { id: "mark_all_na", label: "Mark All N/A", targets: [{ fieldId: "result", value: "na" }] }
        ],
        completionFieldIds: ["result"],
        deficiencyFieldId: "result",
        seedRows: buildJointCommissionSprinklerSeedRows(input.frequency),
        visibleWhen: { fieldId: "inspectionMode", values: input.visibleValues },
        rowFields: checklistRowFields
      },
      {
        id: `${input.repeaterId}Completed`,
        label: `${input.label} completed`,
        type: "number",
        visibleWhen: { fieldId: "inspectionMode", values: input.visibleValues },
        calculation: {
          key: "countRowsMatchingAnyValues",
          sourceFieldId: input.repeaterId,
          rowFieldIds: ["result"],
          values: ["pass", "fail", "na"]
        },
        readOnly: true
      }
    ]
  };
}

const quarterlySection = buildChecklistSection({
  id: "quarterly-inspection",
  label: "Quarterly inspection items",
  description: "Quarterly sprinkler inspection items and quarterly test checkpoints grouped for TJC-friendly traceability.",
  repeaterId: "quarterlyItems",
  frequency: "quarterly",
  visibleValues: ["quarterly", "combined", "follow_up"]
});

const annualSection = buildChecklistSection({
  id: "annual-inspection",
  label: "Annual inspection items",
  description: "Annual sprinkler inspection items grouped separately so combined visits still read clearly during audit review.",
  repeaterId: "annualItems",
  frequency: "annual",
  visibleValues: ["annual", "combined", "follow_up"]
});

export const jointCommissionFireSprinklerReportTemplate: ReportTemplateDefinition = {
  label: "Joint Commission fire sprinkler",
  description: "Healthcare-oriented fire sprinkler inspection workflow with quarterly and annual sections, structured deficiencies, impairment tracking, and customer-facing compliance output.",
  pdf: {
    subtitle: "Joint Commission Fire Sprinkler Inspection Report",
    nfpaReferences: ["NFPA 25", "Joint Commission LS.02.01.35"]
  },
  sections: [
    {
      id: "header",
      label: "Header",
      description: "Document the facility, visit timing, technician attribution, and the adopted code basis for this compliance-sensitive inspection record.",
      fields: [
        { id: "facilityName", label: "Facility", type: "text", readOnly: true, prefill: [{ source: "siteDefault", key: "customerName" }] },
        { id: "siteName", label: "Site", type: "text", readOnly: true, prefill: [{ source: "siteDefault", key: "siteName" }] },
        { id: "address", label: "Address", type: "text", readOnly: true, prefill: [{ source: "siteDefault", key: "siteAddress" }, { source: "siteDefault", key: "siteName" }] },
        { id: "buildingNameOrTower", label: "Building / tower", type: "text", placeholder: "Patient tower, outpatient pavilion, MOB, or other building identifier" },
        { id: "floorOrArea", label: "Floor / area", type: "text", placeholder: "Levels, wing, floor, smoke compartment, or service area" },
        { id: "inspectionDate", label: "Inspection date", type: "text", readOnly: true, prefill: [{ source: "siteDefault", key: "scheduledDate" }] },
        { id: "inspectionStartTime", label: "Start time", type: "text", placeholder: "8:30 AM" },
        { id: "inspectionEndTime", label: "End time", type: "text", placeholder: "10:08 AM" },
        { id: "technicianName", label: "Technician", type: "text", placeholder: "Technician or inspector name" },
        { id: "technicianLicenseOrCertification", label: "License / certification", type: "text", placeholder: "Certification or tester number" },
        { id: "workOrderNumber", label: "Work order number", type: "text", placeholder: "Optional work order reference" },
        {
          id: "inspectionType",
          label: "Inspection type",
          type: "select",
          optionProvider: "jointCommissionInspectionTypeOptions",
          mappings: [
            {
              source: "optionMetadata",
              targets: [{ fieldId: "inspectionMode", sourceKey: "inspectionMode", mode: "always" }]
            }
          ]
        },
        { id: "inspectionMode", label: "Inspection mode", type: "text", hidden: true, readOnly: true, prefill: [{ source: "reportDefault", value: "quarterly" }] },
        { id: "ahj", label: "AHJ", type: "text", placeholder: "Authority having jurisdiction" },
        { id: "adoptedCodeEdition", label: "Adopted code edition", type: "select", optionProvider: "jointCommissionCodeEditionOptions" }
      ]
    },
    {
      id: "facility-context",
      label: "Facility context",
      description: "Capture occupancy, impairment, fire watch, recent changes, and activation history so the report holds up under healthcare documentation review.",
      fields: [
        {
          id: "requirementProfile",
          label: "Requirement profile",
          type: "select",
          optionProvider: "jointCommissionSprinklerRequirementProfiles",
          prefill: [{ source: "reportDefault", value: "tjc_nfpa25_2023_sprinkler" }]
        },
        { id: "occupancyType", label: "Occupancy type", type: "select", optionProvider: "jointCommissionOccupancyOptions" },
        { id: "isFacilityOccupied", label: "Facility occupied", type: "select", optionProvider: "backflowYesNoOptions" },
        { id: "impairmentStatusAtArrival", label: "Impairment status at arrival", type: "select", optionProvider: "jointCommissionImpairmentStatusOptions" },
        { id: "fireWatchInPlace", label: "Fire watch in place", type: "select", optionProvider: "backflowYesNoNAOptions" },
        { id: "lastInspectionDate", label: "Last inspection date", type: "text", placeholder: "Prior quarterly / annual inspection date" },
        { id: "anySystemChangesSinceLastInspection", label: "Any system changes since last inspection", type: "select", optionProvider: "backflowYesNoOptions" },
        { id: "descriptionOfChanges", label: "Description of changes", type: "text", placeholder: "Describe construction, modifications, shutdowns, or other system changes.", visibleWhen: { fieldId: "anySystemChangesSinceLastInspection", values: ["yes"] } },
        { id: "anyActivationsSinceLastInspection", label: "Any activations since last inspection", type: "select", optionProvider: "backflowYesNoOptions" },
        { id: "descriptionOfActivations", label: "Description of activations", type: "text", placeholder: "Describe alarm/trip activations or operational events since the last inspection.", visibleWhen: { fieldId: "anyActivationsSinceLastInspection", values: ["yes"] } }
      ]
    },
    {
      id: "system-identification",
      label: "System identification",
      description: "Tie the inspection to the exact sprinkler system, riser, water supply, and service area inspected during the visit.",
      fields: [
        { id: "systemType", label: "System type", type: "select", optionProvider: "jointCommissionSystemTypeOptions" },
        { id: "systemNameOrRiserID", label: "System / riser ID", type: "text", placeholder: "Riser name, floor control assembly, or system identifier" },
        { id: "systemLocation", label: "System location", type: "text", placeholder: "Riser room, valve room, mechanical room, or tower location" },
        { id: "waterSupplyType", label: "Water supply type", type: "select", optionProvider: "jointCommissionWaterSupplyTypeOptions" },
        { id: "riserType", label: "Riser type", type: "select", optionProvider: "jointCommissionRiserTypeOptions" },
        { id: "numberOfFloorsServed", label: "Floors served", type: "text", placeholder: "1-4, basement to roof, or similar service range" },
        { id: "hydraulicPlacardPresent", label: "Hydraulic placard present", type: "select", optionProvider: "backflowYesNoOptions" },
        { id: "systemInService", label: "System in service", type: "select", optionProvider: "backflowSystemLeftInServiceOptions" }
      ]
    },
    {
      id: "inspection-scope",
      label: "Inspection scope",
      description: "Capture the visit mode and audit context so the correct checklist sections appear without burdening the technician with unnecessary fields.",
      fields: [
        { id: "scopeSummary", label: "Scope summary", type: "text", placeholder: "Document the specific tower, riser, or healthcare area covered by this visit." },
        { id: "healthcareRiskNotes", label: "Healthcare risk notes", type: "text", placeholder: "Document infection control, patient care restrictions, escorts, or survey-sensitive access limits." }
      ]
    },
    quarterlySection,
    annualSection,
    {
      id: "test-results",
      label: "Test results",
      description: "Record main drain, waterflow, and valve supervisory results in structured form instead of hiding measurements in free text.",
      fields: [
        { id: "staticPressure", label: "Static pressure", type: "text", placeholder: "118 psi" },
        { id: "residualPressure", label: "Residual pressure", type: "text", placeholder: "102 psi" },
        { id: "previousComparison", label: "Compared to previous result", type: "text", placeholder: "Within expected range or describe variance" },
        { id: "inspectorTestResult", label: "Inspector's test result", type: "select", optionProvider: "jointCommissionStatusOptions" },
        { id: "bypassTestResult", label: "Bypass test result", type: "select", optionProvider: "jointCommissionStatusOptions" },
        { id: "timeToAlarm", label: "Time to alarm", type: "text", placeholder: "71 sec" },
        { id: "valveSupervisoryTest", label: "Valve supervisory test", type: "select", optionProvider: "jointCommissionStatusOptions" },
        { id: "testComments", label: "Test comments", type: "text", placeholder: "Document notable timing, comparisons, device issues, or access limitations." },
        {
          id: "waterflowSwitches",
          label: "Waterflow switches",
          type: "repeater",
          addLabel: "Add waterflow switch",
          rowFields: [
            { id: "switchId", label: "Switch ID", type: "text", placeholder: "WF-1" },
            { id: "location", label: "Location", type: "text", placeholder: "Patient Tower A - Riser 1" },
            { id: "deviceType", label: "Type", type: "text", placeholder: "Vane or pressure waterflow" },
            { id: "inspectorsTest", label: "Inspector's test", type: "select", optionProvider: "backflowYesNoNAOptions" },
            { id: "bypassTest", label: "Bypass test", type: "select", optionProvider: "backflowYesNoNAOptions" },
            { id: "timeToSignal", label: "Time to signal", type: "text", placeholder: "39 sec" },
            { id: "result", label: "Result", type: "select", optionProvider: "jointCommissionStatusOptions" },
            { id: "epLabel", label: "EP", type: "text", placeholder: "LS.02.01.35 EP 1" },
            { id: "notes", label: "Notes", type: "text", placeholder: "Device-specific notes" }
          ]
        },
        {
          id: "tamperSwitches",
          label: "Tamper switches",
          type: "repeater",
          addLabel: "Add tamper switch",
          rowFields: [
            { id: "switchId", label: "Switch ID", type: "text", placeholder: "TS-1" },
            { id: "location", label: "Location", type: "text", placeholder: "PIV north yard" },
            { id: "valveType", label: "Valve type", type: "text", placeholder: "PIV or butterfly" },
            { id: "supervisorySignal", label: "Supervisory signal", type: "text", placeholder: "Received" },
            { id: "travel", label: "Travel", type: "text", placeholder: "2 revs or 1/5 turn" },
            { id: "result", label: "Result", type: "select", optionProvider: "jointCommissionStatusOptions" },
            { id: "epLabel", label: "EP", type: "text", placeholder: "LS.02.01.35 EP 1" },
            { id: "notes", label: "Notes", type: "text", placeholder: "Switch-specific notes" }
          ]
        }
      ]
    },
    {
      id: "deficiencies",
      label: "Deficiencies",
      description: "Structured deficiency entries keep healthcare documentation defensible and separate customer language from internal service notes.",
      fields: [
        {
          id: "deficiencyItems",
          label: "Deficiency items",
          type: "repeater",
          addLabel: "Add deficiency",
          rowFields: [
            { id: "title", label: "Title", type: "text", placeholder: "Short deficiency title" },
            { id: "category", label: "Category", type: "text", placeholder: "Alarm, waterflow, clearance, piping, tags, or similar category" },
            { id: "severity", label: "Severity", type: "select", optionProvider: "jointCommissionSeverityOptions" },
            { id: "codeReference", label: "Code reference", type: "text", placeholder: "NFPA / EP / AHJ reference" },
            { id: "description", label: "Description", type: "text", placeholder: "Customer-facing plain-language deficiency description." },
            { id: "internalNotes", label: "Internal notes", type: "text", customerVisible: false, placeholder: "Internal service or dispatch notes not shown on customer output." },
            { id: "recommendedAction", label: "Recommended action", type: "select", optionProvider: "jointCommissionRecommendationOptions" },
            { id: "requiredTimeline", label: "Required timeline", type: "select", optionProvider: "jointCommissionRequiredTimelineOptions" },
            { id: "photo", label: "Photo", type: "photo" }
          ]
        }
      ]
    },
    {
      id: "impairments",
      label: "Impairments",
      description: "Separate impairment documentation from general deficiencies so outages, notifications, and fire watch decisions are explicit.",
      fields: [
        { id: "systemImpaired", label: "System impaired", type: "select", optionProvider: "backflowYesNoOptions" },
        { id: "impairmentType", label: "Impairment type", type: "text", placeholder: "Partial, full, planned shutdown, delayed signaling, or similar" },
        { id: "impairmentStartTime", label: "Impairment start time", type: "text", placeholder: "9:22 AM" },
        { id: "impairmentEndTime", label: "Impairment end time", type: "text", placeholder: "Open or restored time" },
        { id: "fireWatchRequired", label: "Fire watch required", type: "select", optionProvider: "backflowYesNoOptions" },
        { id: "fireWatchImplemented", label: "Fire watch implemented", type: "select", optionProvider: "backflowYesNoOptions" },
        { id: "ahjNotified", label: "AHJ notified", type: "select", optionProvider: "backflowYesNoOptions" },
        { id: "ownerNotified", label: "Owner notified", type: "select", optionProvider: "backflowYesNoOptions" },
        { id: "impairmentNotes", label: "Impairment notes", type: "text", placeholder: "Document owner notice, ILSM, fire watch, restoration, and operational impact." }
      ]
    },
    {
      id: "corrective-actions",
      label: "Corrective actions",
      description: "Document repairs, retests, remaining issues, and the handoff needed for follow-up service.",
      fields: [
        { id: "repairsPerformed", label: "Repairs performed", type: "text", placeholder: "Describe repairs completed on site" },
        { id: "partsReplaced", label: "Parts replaced", type: "text", placeholder: "List parts replaced or note none" },
        { id: "adjustmentsMade", label: "Adjustments made", type: "text", placeholder: "Record adjustments or maintenance performed" },
        { id: "retestPerformed", label: "Retest performed", type: "select", optionProvider: "backflowYesNoOptions" },
        { id: "retestResults", label: "Retest results", type: "text", placeholder: "Describe retest outcome" },
        { id: "remainingIssues", label: "Remaining issues", type: "text", placeholder: "Document any unresolved issues or follow-up scope" }
      ]
    },
    {
      id: "photos",
      label: "Photos",
      description: "Guided photo categories make it clear what needs to be documented for both the service record and the customer-facing packet.",
      fields: [
        {
          id: "photoItems",
          label: "Photo items",
          type: "repeater",
          addLabel: "Add photo",
          validation: [{ type: "minRows", value: 1, message: "Add at least one system overview photo before finalizing." }],
          rowFields: [
            { id: "category", label: "Category", type: "select", optionProvider: "jointCommissionPhotoCategoryOptions" },
            { id: "caption", label: "Caption", type: "text", placeholder: "Describe what the photo shows" },
            { id: "photo", label: "Photo", type: "photo" }
          ]
        }
      ]
    },
    {
      id: "final-summary",
      label: "Final summary",
      description: "Close the record with the system disposition, follow-up requirement, and a plain-language summary suitable for healthcare customers and surveys.",
      fields: [
        { id: "overallResult", label: "Overall result", type: "select", optionProvider: "jointCommissionOverallResultOptions" },
        { id: "systemLeftInService", label: "System left in service", type: "select", optionProvider: "backflowSystemLeftInServiceOptions" },
        { id: "followUpRequired", label: "Follow-up required", type: "select", optionProvider: "backflowYesNoOptions" },
        { id: "followUpDescription", label: "Follow-up description", type: "text", placeholder: "Describe the next required action", visibleWhen: { fieldId: "followUpRequired", values: ["yes"] } },
        { id: "nextInspectionDueDate", label: "Next inspection due date", type: "text", placeholder: "Next quarterly or annual due date" },
        { id: "complianceStatement", label: "Compliance statement", type: "text", readOnly: true, prefill: [{ source: "reportDefault", value: "This inspection record is documented against the adopted NFPA 25 requirement profile in use for this facility and organized to support Joint Commission documentation review." }] },
        { id: "customerFacingSummary", label: "Customer-facing summary", type: "text", placeholder: "Summarize what was inspected, what passed, what failed, and the next required action in plain language." }
      ]
    },
    {
      id: "signatures",
      label: "Signatures",
      description: "Capture the printed names and completion time surrounding the required technician and customer signature flow already used by the platform.",
      fields: [
        { id: "technicianName", label: "Technician printed name", type: "text", placeholder: "Technician printed name" },
        { id: "certificationNumber", label: "Certification number", type: "text", placeholder: "Certification number" },
        { id: "customerRepName", label: "Customer representative", type: "text", placeholder: "Customer representative" },
        { id: "completionTimestamp", label: "Completion timestamp", type: "text", placeholder: "Completion date and time" }
      ]
    }
  ]
};
