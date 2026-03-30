import type { ReportFieldDefinition, ReportSectionDefinition, ReportTemplateDefinition } from "./report-config";
import { buildWetSprinklerChecklistSeedRows, type WetSprinklerRequirementGroupKey } from "./report-requirements";

const wetSprinklerChecklistRowFields: Array<Exclude<ReportFieldDefinition, { type: "repeater" }>> = [
  { id: "requirementKey", label: "Requirement key", type: "text", hidden: true, readOnly: true },
  { id: "groupKey", label: "Requirement group", type: "text", hidden: true, readOnly: true },
  { id: "frequencyLabel", label: "Frequency", type: "text", hidden: true, readOnly: true },
  { id: "requirementProfileKey", label: "Requirement profile", type: "text", hidden: true, readOnly: true },
  { id: "requirementEditionLabel", label: "Requirement edition", type: "text", hidden: true, readOnly: true },
  { id: "itemLabel", label: "Inspection item", type: "text", readOnly: true },
  { id: "referenceLabel", label: "Reference", type: "text", readOnly: true },
  { id: "result", label: "Result", type: "select", optionProvider: "passFailNA" },
  { id: "deficiencySeverity", label: "Deficiency severity", type: "select", hidden: true, optionProvider: "deficiencySeverityOptions" },
  { id: "deficiencyNotes", label: "Deficiency notes", type: "text", placeholder: "Describe the deficiency, impairment, or exception noted for this item" },
  { id: "correctiveAction", label: "Corrective action notes", type: "text", placeholder: "Document repairs made, safeguards used, or corrective work recommended" },
  { id: "comments", label: "Inspector comments", type: "text", placeholder: "Capture readings, observations, access limits, or supporting notes" },
  { id: "deficiencyPhoto", label: "Item photo", type: "photo" }
];

function buildWetSprinklerRequirementSection(input: {
  id: string;
  label: string;
  description: string;
  repeaterId: string;
  completedFieldId: string;
  deficiencyCountFieldId: string;
  commentsFieldId: string;
  groupKey: WetSprinklerRequirementGroupKey;
}): ReportSectionDefinition {
  return {
    id: input.id,
    label: input.label,
    description: input.description,
    fields: [
      {
        id: input.repeaterId,
        label: input.label,
        type: "repeater",
        addLabel: `Add ${input.label.toLowerCase()} item`,
        bulkActions: [
          { id: "mark_all_pass", label: "Mark All Pass", targets: [{ fieldId: "result", value: "pass" }] },
          { id: "mark_all_na", label: "Mark All N/A", targets: [{ fieldId: "result", value: "na" }] },
          { id: "clear_results", label: "Clear Results", targets: [{ fieldId: "result", value: "" }] }
        ],
        completionFieldIds: ["result"],
        deficiencyFieldId: "result",
        seedRows: buildWetSprinklerChecklistSeedRows(input.groupKey),
        rowFields: wetSprinklerChecklistRowFields
      },
      {
        id: input.completedFieldId,
        label: `${input.label} completed`,
        type: "number",
        calculation: {
          key: "countRowsMatchingAnyValues",
          sourceFieldId: input.repeaterId,
          rowFieldIds: ["result"],
          values: ["pass", "fail", "na"]
        },
        readOnly: true
      },
      {
        id: input.deficiencyCountFieldId,
        label: `${input.label} deficiencies`,
        type: "number",
        calculation: {
          key: "countRowsMatchingAnyValues",
          sourceFieldId: input.repeaterId,
          rowFieldIds: ["result"],
          values: ["fail", "deficiency"]
        },
        readOnly: true
      },
      {
        id: input.commentsFieldId,
        label: `${input.label} comments`,
        type: "text",
        placeholder: "Summarize this inspection/testing pass, any access limitations, and the most important field observations.",
        prefill: [{ source: "priorField", sectionId: input.id, fieldId: input.commentsFieldId }]
      }
    ]
  };
}

const monthlyInspectionSection = buildWetSprinklerRequirementSection({
  id: "sprinkler-heads",
  label: "Monthly inspection items",
  description: "",
  repeaterId: "monthlyItems",
  completedFieldId: "monthlyItemsCompleted",
  deficiencyCountFieldId: "monthlyDeficiencyCount",
  commentsFieldId: "monthlySectionComments",
  groupKey: "monthly_inspection"
});

const quarterlyInspectionSection = buildWetSprinklerRequirementSection({
  id: "system-checklist",
  label: "Quarterly inspection items",
  description: "",
  repeaterId: "quarterlyInspectionItems",
  completedFieldId: "quarterlyInspectionItemsCompleted",
  deficiencyCountFieldId: "quarterlyInspectionDeficiencyCount",
  commentsFieldId: "quarterlyInspectionComments",
  groupKey: "quarterly_inspection"
});

const quarterlyTestSection = buildWetSprinklerRequirementSection({
  id: "system-checklist",
  label: "Quarterly test items",
  description: "",
  repeaterId: "quarterlyTestItems",
  completedFieldId: "quarterlyTestItemsCompleted",
  deficiencyCountFieldId: "quarterlyTestDeficiencyCount",
  commentsFieldId: "quarterlyTestComments",
  groupKey: "quarterly_test"
});

export const wetSprinklerReportTemplate: ReportTemplateDefinition = {
  label: "Wet fire sprinkler",
  description: "Comprehensive wet-pipe inspection workflow that preserves the existing form coverage while adding smarter frequency-based inspection, testing, maintenance, and deficiency documentation.",
  pdf: {
    subtitle: "Wet Fire Sprinkler Inspection Report",
    nfpaReferences: ["NFPA 13", "NFPA 25"]
  },
  sections: [
    {
      id: "service-summary",
      label: "Owner, occupancy, and service metadata",
      description: "Preserve the owner / occupancy and tag metadata from the current form while adding smarter system context for the visit.",
      fields: [
        {
          id: "requirementProfile",
          label: "Requirement profile",
          type: "select",
          optionProvider: "wetSprinklerRequirementProfiles",
          prefill: [
            { source: "priorField", sectionId: "service-summary", fieldId: "requirementProfile" },
            { source: "reportDefault", value: "nfpa25_2023_baseline" }
          ]
        },
        {
          id: "typeOfService",
          label: "Type of service",
          type: "select",
          optionProvider: "wetSprinklerServiceTypeOptions",
          prefill: [
            { source: "priorField", sectionId: "service-summary", fieldId: "typeOfService" },
            { source: "priorField", sectionId: "service-summary", fieldId: "visitScope" },
            { source: "reportDefault", value: "quarterly" }
          ],
          mappings: [
            {
              source: "optionMetadata",
              targets: [
                { fieldId: "visitScope", sourceKey: "visitScope", mode: "always" }
              ]
            }
          ]
        },
        { id: "visitScope", label: "Visit scope", type: "text", hidden: true, readOnly: true, prefill: [{ source: "priorField", sectionId: "service-summary", fieldId: "visitScope" }] },
        { id: "tagStatus", label: "Tag status", type: "select", optionProvider: "wetSprinklerTagStatusOptions", prefill: [{ source: "priorField", sectionId: "service-summary", fieldId: "tagStatus" }] },
        { id: "clientName", label: "Client", type: "text", readOnly: true, prefill: [{ source: "priorField", sectionId: "service-summary", fieldId: "clientName" }, { source: "siteDefault", key: "customerName" }] },
        { id: "serviceAddress", label: "Address", type: "text", readOnly: true, prefill: [{ source: "priorField", sectionId: "service-summary", fieldId: "serviceAddress" }, { source: "siteDefault", key: "siteAddress" }, { source: "siteDefault", key: "siteName" }] },
        { id: "inspectionDate", label: "Inspection date", type: "text", readOnly: true, prefill: [{ source: "priorField", sectionId: "service-summary", fieldId: "inspectionDate" }, { source: "siteDefault", key: "scheduledDate" }] },
        { id: "ownerRepresentative", label: "Owner / representative", type: "text", placeholder: "On-site customer or property representative", prefill: [{ source: "priorField", sectionId: "service-summary", fieldId: "ownerRepresentative" }] },
        { id: "occupancyType", label: "Occupancy", type: "text", placeholder: "Hospital, warehouse, office, mixed-use, or other occupancy served by the system", prefill: [{ source: "priorField", sectionId: "service-summary", fieldId: "occupancyType" }] },
        { id: "buildingArea", label: "Building / area", type: "text", placeholder: "Tower, wing, riser room, warehouse bay, or protected area", prefill: [{ source: "priorField", sectionId: "service-summary", fieldId: "buildingArea" }, { source: "siteDefault", key: "siteName" }] },
        { id: "inspectorName", label: "Inspector", type: "text", placeholder: "Technician or inspector name", prefill: [{ source: "priorField", sectionId: "service-summary", fieldId: "inspectorName" }] },
        { id: "inspectorLicense", label: "License", type: "text", placeholder: "State or company license number", prefill: [{ source: "priorField", sectionId: "service-summary", fieldId: "inspectorLicense" }] },
        {
          id: "serviceSummary",
          label: "Visit summary",
          type: "text",
          placeholder: "Summarize systems covered, access conditions, inspection scope, and any important coordination notes for the inspection record.",
          prefill: [
            { source: "priorField", sectionId: "service-summary", fieldId: "serviceSummary" },
            { source: "priorField", sectionId: "service-summary", fieldId: "systemSummary" }
          ]
        },
        {
          id: "systemZones",
          label: "Wet sprinkler systems / risers",
          description: "Identify each wet sprinkler system, riser, or primary assembly covered during this visit.",
          type: "repeater",
          addLabel: "Add system / riser",
          repeatableSource: "siteAssets",
          rowIdentityField: "assetId",
          validation: [{ type: "minRows", value: 1, message: "Add at least one wet sprinkler system or riser before finalizing." }],
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
                    { fieldId: "assetTag", sourceKey: "assetTag", mode: "always" },
                    { fieldId: "systemIdentifier", sourceKey: "assetName", mode: "if_empty" },
                    { fieldId: "location", sourceKey: "location", mode: "always" },
                    { fieldId: "componentType", sourceKey: "componentType", mode: "if_empty" },
                    { fieldId: "controlValveCount", sourceKey: "valveCount", mode: "if_empty" }
                  ]
                }
              ]
            },
            { id: "assetTag", label: "Asset tag", type: "text", placeholder: "SPR-200", prefill: [{ source: "asset", key: "assetTag" }] },
            { id: "systemIdentifier", label: "System / riser ID", type: "text", placeholder: "Wet riser A", prefill: [{ source: "asset", key: "name" }] },
            { id: "location", label: "Location", type: "text", placeholder: "Central riser room", prefill: [{ source: "assetMetadata", key: "location" }, { source: "siteDefault", key: "siteName" }] },
            { id: "componentType", label: "Primary component", type: "select", optionProvider: "sprinklerComponentTypes", prefill: [{ source: "assetMetadata", key: "componentType" }] },
            { id: "controlValveCount", label: "Control valves", type: "number", placeholder: "0", prefill: [{ source: "assetMetadata", key: "valveCount" }] },
            { id: "comments", label: "Inspector comments", type: "text", placeholder: "Zone coverage, riser ID notes, access limitations, or coordination details" }
          ]
        },
        { id: "systemsInspected", label: "Systems / risers inspected", type: "number", calculation: { key: "assetCountFromRepeater", sourceFieldId: "systemZones" }, readOnly: true },
        { id: "controlValvesObserved", label: "Control valves observed", type: "number", calculation: { key: "sumNumberFieldFromRepeater", sourceFieldId: "systemZones", rowFieldId: "controlValveCount" }, readOnly: true }
      ]
    },
    {
      id: "sprinkler-heads",
      label: "Monthly inspection items and sprinkler heads",
      description: "Document monthly visual wet-pipe inspection items and preserve the existing sprinkler head information table inside a smarter report workflow.",
      fields: [
        ...monthlyInspectionSection.fields,
        {
          id: "sprinklerHeadInformation",
          label: "Sprinkler head information",
          description: "Capture representative sprinkler head details from the source form with structured dropdowns and room for notes/photos.",
          type: "repeater",
          addLabel: "Add sprinkler head detail",
          carryForwardPriorRows: true,
          rowFields: [
            { id: "assetId", label: "Linked asset", type: "select", hidden: true, optionProvider: "assetSelect" },
            { id: "location", label: "Location", type: "text", placeholder: "Corridor, office, canopy, or hazard area", prefill: [{ source: "assetMetadata", key: "location" }] },
            { id: "headType", label: "Type", type: "select", optionProvider: "sprinklerHeadTypes", customValueFieldId: "headTypeOther", customValueTrigger: "other", prefill: [{ source: "assetMetadata", key: "headType" }] },
            { id: "headTypeOther", label: "Type other", type: "text", placeholder: "Describe head type", visibleWhen: { fieldId: "headType", values: ["other"] } },
            { id: "escutcheon", label: "Escutcheon", type: "select", optionProvider: "sprinklerHeadEscutcheonOptions", customValueFieldId: "escutcheonOther", customValueTrigger: "other", prefill: [{ source: "assetMetadata", key: "escutcheon" }] },
            { id: "escutcheonOther", label: "Escutcheon other", type: "text", placeholder: "Describe escutcheon", visibleWhen: { fieldId: "escutcheon", values: ["other"] } },
            { id: "headSize", label: "Size", type: "select", optionProvider: "sprinklerHeadSizeOptions", customValueFieldId: "headSizeOther", customValueTrigger: "other", prefill: [{ source: "assetMetadata", key: "headSize" }] },
            { id: "headSizeOther", label: "Size other", type: "text", placeholder: "Describe head size", visibleWhen: { fieldId: "headSize", values: ["other"] } },
            { id: "temperatureRating", label: "Temp", type: "select", optionProvider: "sprinklerHeadTemperatureOptions", customValueFieldId: "temperatureRatingOther", customValueTrigger: "other", prefill: [{ source: "assetMetadata", key: "temperatureRating" }] },
            { id: "temperatureRatingOther", label: "Temp other", type: "text", placeholder: "Describe temperature rating", visibleWhen: { fieldId: "temperatureRating", values: ["other"] } },
            { id: "bulbCondition", label: "Bulb condition", type: "select", optionProvider: "sprinklerHeadBulbConditionOptions", customValueFieldId: "bulbConditionOther", customValueTrigger: "other", prefill: [{ source: "assetMetadata", key: "bulbCondition" }] },
            { id: "bulbConditionOther", label: "Bulb condition other", type: "text", placeholder: "Describe bulb condition", visibleWhen: { fieldId: "bulbCondition", values: ["other"] } },
            { id: "manufacturer", label: "Manufacturer", type: "select", optionProvider: "sprinklerManufacturers", customValueFieldId: "manufacturerOther", customValueTrigger: "other", prefill: [{ source: "assetMetadata", key: "manufacturer" }] },
            { id: "manufacturerOther", label: "Manufacturer other", type: "text", placeholder: "Describe manufacturer", visibleWhen: { fieldId: "manufacturer", values: ["other"] } },
            { id: "result", label: "Result", type: "select", optionProvider: "passFailNA" },
            { id: "deficiencyNotes", label: "Deficiency notes", type: "text", placeholder: "Loading, corrosion, paint, obstruction, missing escutcheon, or replacement need" },
            { id: "comments", label: "Inspector comments", type: "text", placeholder: "Additional head details, orientation, quantity, or replacement notes" },
            { id: "deficiencyPhoto", label: "Head photo", type: "photo" }
          ]
        },
        { id: "sprinklerHeadRowsReviewed", label: "Sprinkler head rows reviewed", type: "number", calculation: { key: "assetCountFromRepeater", sourceFieldId: "sprinklerHeadInformation" }, readOnly: true },
        { id: "sprinklerHeadNotes", label: "Sprinkler head notes", type: "text", placeholder: "Capture overall sprinkler head observations, sample size, representative conditions, and any replacement priorities.", prefill: [{ source: "priorField", sectionId: "sprinkler-heads", fieldId: "sprinklerHeadNotes" }] }
      ]
    },
    {
      id: "system-checklist",
      label: "Quarterly inspection and test items",
      description: "Keep the quarterly inspection/test substance from the current form, but separate readiness checks from functional testing.",
      fields: [
        ...quarterlyInspectionSection.fields,
        ...quarterlyTestSection.fields
      ]
    },
    buildWetSprinklerRequirementSection({
      id: "semi-annual",
      label: "Semi-annual test items",
      description: "Preserve the semi-annual testing coverage from the current form inside a structured repeater workflow.",
      repeaterId: "semiAnnualTestItems",
      completedFieldId: "semiAnnualTestItemsCompleted",
      deficiencyCountFieldId: "semiAnnualTestDeficiencyCount",
      commentsFieldId: "semiAnnualTestComments",
      groupKey: "semi_annual_test"
    }),
    buildWetSprinklerRequirementSection({
      id: "annual",
      label: "Annual inspection / test items",
      description: "Document the broader annual wet system inspection and testing activities from the source form with the same structured deficiency flow.",
      repeaterId: "annualInspectionItems",
      completedFieldId: "annualInspectionItemsCompleted",
      deficiencyCountFieldId: "annualInspectionDeficiencyCount",
      commentsFieldId: "annualInspectionComments",
      groupKey: "annual_inspection"
    }),
    buildWetSprinklerRequirementSection({
      id: "five-year-internal",
      label: "Five-year internal inspection items",
      description: "Capture internal inspection findings and obstruction-related documentation without losing the existing source-form coverage.",
      repeaterId: "fiveYearInternalInspectionItems",
      completedFieldId: "fiveYearInternalInspectionItemsCompleted",
      deficiencyCountFieldId: "fiveYearInternalInspectionDeficiencyCount",
      commentsFieldId: "fiveYearInternalInspectionComments",
      groupKey: "five_year_internal_inspection"
    }),
    buildWetSprinklerRequirementSection({
      id: "five-year-test",
      label: "Five-year test items",
      description: "Capture five-year testing, gauge service, and component-specific documentation as part of the same wet sprinkler record.",
      repeaterId: "fiveYearTestItems",
      completedFieldId: "fiveYearTestItemsCompleted",
      deficiencyCountFieldId: "fiveYearTestDeficiencyCount",
      commentsFieldId: "fiveYearTestComments",
      groupKey: "five_year_test"
    }),
    {
      id: "alarm-valves",
      label: "Alarm valve information",
      description: "Preserve the existing alarm valve information coverage with structured dropdowns, test outcomes, and notes.",
      fields: [
        {
          id: "alarmValveInformation",
          label: "Alarm valve information",
          type: "repeater",
          addLabel: "Add alarm valve detail",
          repeatableSource: "siteAssets",
          rowIdentityField: "assetId",
          carryForwardPriorRows: true,
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
                    { fieldId: "assetTag", sourceKey: "assetTag", mode: "always" },
                    { fieldId: "valveIdentifier", sourceKey: "assetName", mode: "if_empty" },
                    { fieldId: "location", sourceKey: "location", mode: "always" },
                    { fieldId: "valveType", sourceKey: "valveType", mode: "if_empty" },
                    { fieldId: "manufacturer", sourceKey: "manufacturer", mode: "if_empty" }
                  ]
                }
              ]
            },
            { id: "assetTag", label: "Asset tag", type: "text", placeholder: "VAL-100", prefill: [{ source: "asset", key: "assetTag" }] },
            { id: "valveIdentifier", label: "Valve / assembly", type: "text", placeholder: "Alarm valve A", prefill: [{ source: "asset", key: "name" }] },
            { id: "location", label: "Location", type: "text", placeholder: "Riser room or mechanical room", prefill: [{ source: "assetMetadata", key: "location" }, { source: "siteDefault", key: "siteName" }] },
            { id: "valveType", label: "Valve type", type: "select", optionProvider: "sprinklerAlarmValveTypes", customValueFieldId: "valveTypeOther", customValueTrigger: "other", prefill: [{ source: "assetMetadata", key: "valveType" }] },
            { id: "valveTypeOther", label: "Valve type other", type: "text", placeholder: "Describe alarm valve type", visibleWhen: { fieldId: "valveType", values: ["other"] } },
            { id: "manufacturer", label: "Manufacturer", type: "select", optionProvider: "sprinklerManufacturers", customValueFieldId: "manufacturerOther", customValueTrigger: "other", prefill: [{ source: "assetMetadata", key: "manufacturer" }] },
            { id: "manufacturerOther", label: "Manufacturer other", type: "text", placeholder: "Describe manufacturer", visibleWhen: { fieldId: "manufacturer", values: ["other"] } },
            { id: "trimCondition", label: "Trim condition", type: "select", optionProvider: "physicalConditionOptions", prefill: [{ source: "reportDefault", value: "good" }] },
            { id: "waterMotorGongTest", label: "Water motor gong / local alarm", type: "select", optionProvider: "passFailNA" },
            { id: "remoteTransmissionResult", label: "Remote transmission", type: "select", optionProvider: "passFailNA" },
            { id: "deficiencyNotes", label: "Deficiency notes", type: "text", placeholder: "Alarm valve or trim issues, drainage concerns, or signal problems" },
            { id: "comments", label: "Inspector comments", type: "text", placeholder: "Trip test notes, trim observations, restoration details, or associated system comments" },
            { id: "deficiencyPhoto", label: "Valve photo", type: "photo" }
          ]
        },
        { id: "alarmValveRowsReviewed", label: "Alarm valve rows reviewed", type: "number", calculation: { key: "assetCountFromRepeater", sourceFieldId: "alarmValveInformation" }, readOnly: true }
      ]
    },
    {
      id: "valves",
      label: "Deficiencies and impairments",
      description: "Roll up deficiencies from all inspection frequencies, document impairments, and preserve defensible inspection-record notes.",
      fields: [
        {
          id: "deficiencyCount",
          label: "Detected deficiencies",
          type: "number",
          calculation: {
            key: "sumFields",
            sourceFields: [
              { sectionId: "sprinkler-heads", fieldId: "monthlyDeficiencyCount" },
              { sectionId: "system-checklist", fieldId: "quarterlyInspectionDeficiencyCount" },
              { sectionId: "system-checklist", fieldId: "quarterlyTestDeficiencyCount" },
              { sectionId: "semi-annual", fieldId: "semiAnnualTestDeficiencyCount" },
              { sectionId: "annual", fieldId: "annualInspectionDeficiencyCount" },
              { sectionId: "five-year-internal", fieldId: "fiveYearInternalInspectionDeficiencyCount" },
              { sectionId: "five-year-test", fieldId: "fiveYearTestDeficiencyCount" }
            ]
          },
          readOnly: true
        },
        { id: "impairmentObserved", label: "Impairment observed", type: "boolean", prefill: [{ source: "priorField", sectionId: "valves", fieldId: "impairmentObserved" }] },
        { id: "systemOutOfService", label: "System out of service", type: "boolean", prefill: [{ source: "priorField", sectionId: "valves", fieldId: "systemOutOfService" }] },
        { id: "impairmentSummary", label: "Impairment / deficiency summary", type: "text", placeholder: "Summarize major deficiencies, impaired areas, outage impact, and interim safeguards for the inspection record.", prefill: [{ source: "priorField", sectionId: "valves", fieldId: "impairmentSummary" }] },
        { id: "notificationsMade", label: "Notifications / interim safeguards", type: "text", placeholder: "Document notifications to the owner, monitoring station, AHJ, fire watch, or any safeguards placed in effect.", prefill: [{ source: "priorField", sectionId: "valves", fieldId: "notificationsMade" }] }
      ]
    },
    {
      id: "alarm-devices",
      label: "Maintenance, repairs, and follow-up",
      description: "Capture maintenance-related fields, recommended repairs, completed corrective work, and the overall customer-facing result.",
      fields: [
        { id: "maintenancePerformedOnSite", label: "Maintenance performed on site", type: "boolean", prefill: [{ source: "priorField", sectionId: "alarm-devices", fieldId: "maintenancePerformedOnSite" }] },
        { id: "maintenanceWorkSummary", label: "Maintenance work summary", type: "text", placeholder: "Document maintenance performed, minor adjustments, parts replaced, draining/restoration steps, or other service completed on site.", prefill: [{ source: "priorField", sectionId: "alarm-devices", fieldId: "maintenanceWorkSummary" }] },
        { id: "recommendedRepairs", label: "Recommended repairs / follow-up", type: "text", placeholder: "List recommended repairs, quoted work, added testing, or service follow-up still required.", prefill: [{ source: "priorField", sectionId: "alarm-devices", fieldId: "recommendedRepairs" }] },
        { id: "correctiveActionsCompleted", label: "Corrective actions completed on site", type: "text", placeholder: "Document corrective action completed during the visit and any restored conditions before departure.", prefill: [{ source: "priorField", sectionId: "alarm-devices", fieldId: "correctiveActionsCompleted" }] },
        { id: "followUpRequired", label: "Follow-up required", type: "boolean", prefill: [{ source: "priorField", sectionId: "alarm-devices", fieldId: "followUpRequired" }] },
        { id: "overallInspectionResult", label: "Overall inspection result", type: "select", optionProvider: "wetSprinklerOverallResultOptions", prefill: [{ source: "priorField", sectionId: "alarm-devices", fieldId: "overallInspectionResult" }] },
        { id: "customerFacingSummary", label: "Customer-facing summary", type: "text", placeholder: "Provide a concise inspection summary suitable for the customer record and final PDF.", prefill: [{ source: "priorField", sectionId: "alarm-devices", fieldId: "customerFacingSummary" }] }
      ]
    },
    {
      id: "system-photos",
      label: "System photos",
      description: "Preserve the source-form photo coverage with structured captions and related-system context.",
      fields: [
        {
          id: "systemPhotos",
          label: "System photos",
          type: "repeater",
          addLabel: "Add system photo",
          rowFields: [
            { id: "relatedSystem", label: "Related system / area", type: "text", placeholder: "Riser A, FDC, alarm valve trim, branch line, or protected area" },
            { id: "caption", label: "Caption", type: "text", placeholder: "Describe what the photo documents for the inspection record" },
            { id: "photo", label: "Photo", type: "photo" },
            { id: "comments", label: "Inspector comments", type: "text", placeholder: "Additional context for the customer record or follow-up team" }
          ]
        }
      ]
    },
    {
      id: "comment-sheet",
      label: "Comment sheet and out-of-scope notes",
      description: "Carry forward the comment-sheet function from the existing form for out-of-scope observations, customer requests, and recordkeeping notes.",
      fields: [
        { id: "outOfScopeComments", label: "Out-of-scope comments", type: "text", placeholder: "Document observed conditions, owner requests, or recommendations that fall outside the defined inspection scope.", prefill: [{ source: "priorField", sectionId: "comment-sheet", fieldId: "outOfScopeComments" }] },
        { id: "customerRequests", label: "Customer requests / coordination notes", type: "text", placeholder: "Capture requested follow-up, site coordination issues, escort needs, shutdown notes, or access restrictions.", prefill: [{ source: "priorField", sectionId: "comment-sheet", fieldId: "customerRequests" }] },
        { id: "inspectorComments", label: "Inspector comments", type: "text", placeholder: "Record final field observations, caveats, assumptions, or other defensible inspection record notes.", prefill: [{ source: "priorField", sectionId: "comment-sheet", fieldId: "inspectorComments" }] }
      ]
    }
  ]
};
