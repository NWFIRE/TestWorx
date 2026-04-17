import { RecurrenceFrequency } from "@prisma/client";
import type { InspectionType } from "@testworx/types";
import type { ReportCalculationKey } from "./report-calculations";
import { resolveOptionProvider } from "./report-options";
import type { ReportOptionProviderKey } from "./report-options";
import { backflowReportTemplate } from "./backflow-report";
import { acceptanceTestReportTemplate } from "./acceptance-test-report";
import { jointCommissionFireSprinklerReportTemplate } from "./joint-commission-fire-sprinkler-report";
import { wetSprinklerReportTemplate } from "./wet-sprinkler-report";
import { workOrderReportTemplate } from "./work-order-report";

export type ReportPrimitiveValue = string | number | boolean | null;

export type ReportOption = {
  label: string;
  value: string;
  metadata?: Record<string, ReportPrimitiveValue>;
};

export type ReportFieldType = "boolean" | "text" | "number" | "date" | "select" | "photo" | "repeater";

export type BillableCategory = "labor" | "material" | "service" | "fee";

type BillableFieldValueCondition = {
  field: string;
  values: ReportPrimitiveValue[];
};

export type BillableFieldMapping = {
  field: string;
  category: BillableCategory;
  description: string;
  descriptionTemplate?: string;
  code?: string;
  codeField?: string;
  unit?: string;
  unitPrice?: number | null;
  quantitySource: "fieldValue" | "constant";
  quantityConstant?: number;
  includeWhenTruthy?: boolean;
  includeWhenGreaterThanZero?: boolean;
  alwaysInclude?: boolean;
  includeWhenFieldValues?: BillableFieldValueCondition[];
  excludeWhenFieldValues?: BillableFieldValueCondition[];
  sourceSection?: string;
  displayGroup?: string;
  metadataFields?: string[];
};

export type BillableRepeaterMapping = {
  repeater: string;
  field: string;
  category: BillableCategory;
  descriptionTemplate: string;
  code?: string;
  codeField?: string;
  codeTemplate?: string;
  unit?: string;
  unitPrice?: number | null;
  quantitySource: "fieldValue" | "constant";
  quantityConstant?: number;
  includeWhenTruthy?: boolean;
  includeWhenGreaterThanZero?: boolean;
  alwaysInclude?: boolean;
  includeWhenFieldValues?: BillableFieldValueCondition[];
  excludeWhenFieldValues?: BillableFieldValueCondition[];
  sourceSection?: string;
  displayGroup?: string;
  metadataFields?: string[];
  expandValues?: boolean;
  includeValues?: string[];
  excludeValues?: string[];
  valueCodeMap?: Record<string, string>;
  staticCodeByValue?: Record<string, string>;
  otherValue?: string;
  otherDetailField?: string;
  includePerRow?: boolean;
};

export type ReportAssetFilterDefinition = {
  source: "assetMetadata";
  key: string;
  equals?: ReportPrimitiveValue;
  oneOf?: ReportPrimitiveValue[];
};

export type ReportFieldPrefillDefinition =
  | { source: "asset"; key: "id" | "name" | "assetTag" }
  | { source: "assetMetadata"; key: string }
  | { source: "priorField"; sectionId: string; fieldId: string }
  | { source: "priorFirstField"; sectionId: string; fieldIds: string[] }
  | { source: "priorAnyField"; sectionId: string; fieldIds: string[]; value: ReportPrimitiveValue }
  | { source: "priorFieldsJoined"; sectionId: string; fieldIds: string[]; separator?: string }
  | { source: "siteDefault"; key: string }
  | { source: "tenantBranding"; key: string }
  | { source: "reportDefault"; value: ReportPrimitiveValue };

export type ReportFieldMappingDefinition = {
  source: "optionMetadata";
  targets: Array<{
    fieldId: string;
    sourceKey: string;
    mode?: "if_empty" | "always";
  }>;
};

export type ReportFieldCalculationDefinition =
  | {
      key: "assetCountFromRepeater";
      sourceFieldId: string;
      sourceSectionId?: string;
    }
  | {
      key: "allRowsEqual";
      sourceFieldId: string;
      sourceSectionId?: string;
      rowFieldId: string;
      equals: ReportPrimitiveValue;
      emptyValue?: ReportPrimitiveValue;
    }
  | {
      key: "sumNumberFieldFromRepeater";
      sourceFieldId: string;
      sourceSectionId?: string;
      rowFieldId: string;
    }
  | {
      key: "passFailFromNumberThreshold";
      sourceFieldId: string;
      sourceSectionId?: string;
      passAtOrAbove: number;
      attentionAtOrAbove?: number;
    }
  | {
      key: "countRowsMatchingAnyValues";
      sourceFieldId: string;
      sourceSectionId?: string;
      rowFieldIds: string[];
      values: ReportPrimitiveValue[];
    }
  | {
      key: "countFieldsMatchingValues";
      sourceFieldIds: string[];
      sourceSectionId?: string;
      values: ReportPrimitiveValue[];
    }
  | {
      key: "sumFields";
      sourceFields: Array<{
        fieldId: string;
        sectionId?: string;
      }>;
    }
  | {
      key: "extinguisherUlRatingFromType" | "nextHydroYearFromExtinguisher";
      sourceFields: Array<{
        fieldId: string;
        sectionId?: string;
      }>;
    }
  | {
      key: "booleanFromNumberThreshold";
      sourceFieldId: string;
      sourceSectionId?: string;
      atOrAbove: number;
    }
  | {
      key: "firstNonEmptyValue" | "kitchenSuppressionInspectionCodeFromManufacturer";
      sourceFieldIds: string[];
      sourceSectionId?: string;
    }
  | {
      key: Exclude<ReportCalculationKey, "assetCountFromRepeater" | "allRowsEqual" | "sumNumberFieldFromRepeater" | "passFailFromNumberThreshold" | "countRowsMatchingAnyValues" | "countFieldsMatchingValues" | "sumFields" | "extinguisherUlRatingFromType" | "nextHydroYearFromExtinguisher" | "booleanFromNumberThreshold" | "firstNonEmptyValue">;
      sourceFieldId: string;
      sourceSectionId?: string;
    };

export type ReportFieldValidationDefinition =
  | {
      type: "required";
      message: string;
    }
  | {
      type: "minRows";
      value: number;
      message: string;
    };

export type ReportRepeaterBulkActionDefinition = {
  id: string;
  label: string;
  targets: Array<{
    fieldId: string;
    value: ReportPrimitiveValue;
  }>;
};

type BaseFieldDefinition = {
  id: string;
  label: string;
  placeholder?: string;
  description?: string;
  hidden?: boolean;
  customerVisible?: boolean;
  visibleWhen?: {
    fieldId: string;
    values: ReportPrimitiveValue[];
  };
  options?: ReportOption[];
  optionProvider?: ReportOptionProviderKey;
  legacyValueMap?: Record<string, string>;
  normalizeAs?: "twoDigitYear";
  normalizeEmptyToDefault?: boolean;
  customValueFieldId?: string;
  customValueTrigger?: string;
  sequentialDefault?: {
    prefix: string;
  };
  prefill?: ReportFieldPrefillDefinition[];
  mappings?: ReportFieldMappingDefinition[];
  calculation?: ReportFieldCalculationDefinition;
  readOnly?: boolean;
  repeatableSource?: "siteAssets";
  assetFilter?: ReportAssetFilterDefinition[];
  rowIdentityField?: string;
  allowDuplicate?: boolean;
  validation?: ReportFieldValidationDefinition[];
};

export type ReportFieldDefinition =
  | (BaseFieldDefinition & {
      type: "boolean" | "text" | "number" | "date" | "select" | "photo";
    })
  | (BaseFieldDefinition & {
      type: "repeater";
      addLabel?: string;
      duplicateLabel?: string;
      bulkActions?: ReportRepeaterBulkActionDefinition[];
      completionFieldIds?: string[];
      deficiencyFieldId?: string;
      deficiencyFieldIds?: string[];
      carryForwardPriorRows?: boolean;
      seedRows?: Array<Record<string, ReportPrimitiveValue>>;
      rowFields: Array<Exclude<ReportFieldDefinition, { type: "repeater" }>>;
    });

export type ReportSectionDefinition = {
  id: string;
  label: string;
  description: string;
  fields: ReportFieldDefinition[];
};

export type ReportTemplateDefinition = {
  label: string;
  description: string;
  defaultRecurrenceFrequency?: RecurrenceFrequency;
  pdf?: {
    subtitle?: string;
    nfpaReferences?: string[];
  };
  sections: ReportSectionDefinition[];
  billableMappings?: {
    fields?: BillableFieldMapping[];
    repeaters?: BillableRepeaterMapping[];
  };
};

export type ReportAssetRecord = {
  id: string;
  name: string;
  assetTag: string | null;
  metadata: Record<string, unknown> | null;
};

export type ReportTemplateResolutionContext = {
  inspectionType: InspectionType;
  assets?: ReportAssetRecord[];
};

function assetMatchesFilter(asset: ReportAssetRecord, filter: ReportAssetFilterDefinition) {
  const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata as Record<string, unknown> : {};
  const candidate = metadata[filter.key];

  if (filter.equals !== undefined) {
    return candidate === filter.equals;
  }

  if (filter.oneOf) {
    return filter.oneOf.includes((candidate ?? null) as ReportPrimitiveValue);
  }

  return true;
}

function filterAssets(assets: ReportAssetRecord[], filters?: ReportAssetFilterDefinition[]) {
  if (!filters || filters.length === 0) {
    return assets;
  }

  return assets.filter((asset) => filters.every((filter) => assetMatchesFilter(asset, filter)));
}

function resolveField(field: ReportFieldDefinition, context: ReportTemplateResolutionContext): ReportFieldDefinition {
  const scopedAssets = filterAssets(context.assets ?? [], field.assetFilter);
  const resolvedOptions = field.optionProvider
    ? resolveOptionProvider(field.optionProvider, scopedAssets)
    : field.options;

  if (field.type !== "repeater") {
    return {
      ...field,
      options: resolvedOptions
    };
  }

  return {
    ...field,
    options: resolvedOptions,
    rowFields: field.rowFields.map((rowField) => resolveField(rowField, context) as Exclude<ReportFieldDefinition, { type: "repeater" }>)
  };
}

export function resolveReportTemplate(input: ReportTemplateResolutionContext): ReportTemplateDefinition {
  const template = inspectionTypeRegistry[input.inspectionType];
  return {
    ...template,
    sections: template.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => resolveField(field, input))
    }))
  };
}

export function getReportPdfMetadata(inspectionType: InspectionType) {
  return inspectionTypeRegistry[inspectionType].pdf ?? { nfpaReferences: [] };
}

export const inspectionTypeRegistry: Record<InspectionType, ReportTemplateDefinition> = {
  fire_extinguisher: {
    label: "Fire extinguisher",
    description: "Portable extinguisher inventory, visual condition, and service readiness.",
    pdf: {
      subtitle: "Portable Fire Extinguisher Inspection Report",
      nfpaReferences: ["NFPA 10"]
    },
    sections: [
      {
        id: "inventory",
        label: "Inventory",
        description: "Verify extinguisher details, inspection status, dates, and service needs.",
        fields: [
          {
            id: "extinguishers",
            label: "Extinguisher inventory",
            description: "Each row tracks one extinguisher at the site.",
            type: "repeater",
            addLabel: "Add extinguisher",
            duplicateLabel: "Duplicate Extinguisher",
            repeatableSource: "siteAssets",
            rowIdentityField: "assetId",
            allowDuplicate: true,
            validation: [{ type: "minRows", value: 1, message: "Add at least one extinguisher row before finalizing." }],
            rowFields: [
              {
                id: "assetId",
                label: "Linked asset",
                type: "select",
                hidden: true,
                optionProvider: "assetSelect",
                mappings: [
                  {
                    source: "optionMetadata",
                    targets: [
                      { fieldId: "assetTag", sourceKey: "assetTag", mode: "always" },
                      { fieldId: "location", sourceKey: "location", mode: "always" },
                      { fieldId: "manufacturer", sourceKey: "manufacturer", mode: "if_empty" },
                      { fieldId: "ulRating", sourceKey: "ulRating", mode: "if_empty" },
                      { fieldId: "serialNumber", sourceKey: "serialNumber", mode: "if_empty" },
                      { fieldId: "extinguisherType", sourceKey: "extinguisherType", mode: "if_empty" },
                      { fieldId: "mfgDate", sourceKey: "manufactureDate", mode: "if_empty" },
                      { fieldId: "lastHydro", sourceKey: "lastHydroDate", mode: "if_empty" },
                      { fieldId: "lastSixYear", sourceKey: "lastSixYearDate", mode: "if_empty" }
                    ]
                  }
                ]
              },
              {
                id: "assetTag",
                label: "Asset tag",
                type: "text",
                placeholder: "EXT-100",
                prefill: [
                  { source: "asset", key: "assetTag" },
                  { source: "priorField", sectionId: "inventory", fieldId: "assetTag" }
                ]
              },
              {
                id: "location",
                label: "Location",
                type: "text",
                placeholder: "Lobby by east stair",
                prefill: [
                  { source: "assetMetadata", key: "location" },
                  { source: "priorField", sectionId: "inventory", fieldId: "location" },
                  { source: "siteDefault", key: "siteName" }
                ]
              },
              {
                id: "serialNumber",
                label: "Serial number",
                type: "text",
                placeholder: "SN-0001",
                prefill: [
                  { source: "assetMetadata", key: "serialNumber" },
                  { source: "priorField", sectionId: "inventory", fieldId: "serialNumber" }
                ]
              },
              {
                id: "extinguisherType",
                label: "Extinguisher type",
                type: "select",
                optionProvider: "extinguisher_types",
                customValueFieldId: "extinguisherTypeOther",
                customValueTrigger: "other",
                legacyValueMap: {
                  "2_5_lb": "2.5 lb ABC",
                  "5_lb": "5 lb ABC",
                  "10_lb": "10 lb ABC",
                  "15_lb": "15 lb CO2",
                  "20_lb": "20 lb ABC",
                  "k_class": "Class K"
                },
                prefill: [
                  { source: "assetMetadata", key: "extinguisherType" },
                  { source: "priorField", sectionId: "inventory", fieldId: "extinguisherType" }
                ]
              },
              {
                id: "extinguisherTypeOther",
                label: "Extinguisher type other",
                type: "text",
                placeholder: "Enter extinguisher type",
                visibleWhen: {
                  fieldId: "extinguisherType",
                  values: ["other"]
                }
              },
              {
                id: "ulRating",
                label: "UL rating",
                type: "select",
                optionProvider: "extinguisherUlRatings",
                legacyValueMap: {
                  "1a_10bc": "1-A:10-B:C",
                  "2a_10bc": "2-A",
                  "2a_20bc": "2-A",
                  "3a_40bc": "3-A:40-B:C",
                  "4a_60bc": "4-A:80-B:C",
                  "k_class": "K"
                },
                prefill: [
                  { source: "assetMetadata", key: "ulRating" },
                  { source: "priorField", sectionId: "inventory", fieldId: "ulRating" }
                ],
                calculation: {
                  key: "extinguisherUlRatingFromType",
                  sourceFields: [
                    { fieldId: "extinguisherType" },
                    { fieldId: "ulRating" }
                  ]
                },
                readOnly: true
              },
              {
                id: "manufacturer",
                label: "Manufacturer",
                type: "select",
                optionProvider: "extinguisherManufacturers",
                prefill: [
                  { source: "assetMetadata", key: "manufacturer" },
                  { source: "priorField", sectionId: "inventory", fieldId: "manufacturer" }
                ]
              },
              {
                id: "mfgDate",
                label: "MFG Date",
                type: "text",
                placeholder: "YY",
                normalizeAs: "twoDigitYear",
                prefill: [
                  { source: "assetMetadata", key: "manufactureDate" },
                  { source: "priorFirstField", sectionId: "inventory", fieldIds: ["mfgDate", "manufactureDate"] }
                ]
              },
              {
                id: "lastHydro",
                label: "Last Hydro",
                type: "text",
                placeholder: "YY",
                normalizeAs: "twoDigitYear",
                prefill: [
                  { source: "assetMetadata", key: "lastHydroDate" },
                  { source: "priorFirstField", sectionId: "inventory", fieldIds: ["lastHydro", "lastHydroDate"] }
                ]
              },
              {
                id: "lastSixYear",
                label: "Last 6 Year",
                type: "text",
                placeholder: "YY",
                normalizeAs: "twoDigitYear",
                prefill: [
                  { source: "assetMetadata", key: "lastSixYearDate" },
                  { source: "priorFirstField", sectionId: "inventory", fieldIds: ["lastSixYear", "lastSixYearDate"] }
                ]
              },
              {
                id: "nextHydro",
                label: "Next Hydro",
                type: "text",
                placeholder: "YY",
                normalizeAs: "twoDigitYear",
                calculation: {
                  key: "nextHydroYearFromExtinguisher",
                  sourceFields: [
                    { fieldId: "lastHydro" },
                    { fieldId: "extinguisherType" },
                    { fieldId: "nextHydro" }
                  ]
                },
                readOnly: true
              },
              {
                id: "servicePerformed",
                label: "Service performed",
                type: "select",
                optionProvider: "extinguisher_service_performed",
                customValueFieldId: "servicePerformedOther",
                customValueTrigger: "other",
                prefill: [
                  { source: "priorField", sectionId: "inventory", fieldId: "servicePerformed" },
                  { source: "reportDefault", value: "Annual Inspection" }
                ]
              },
              {
                id: "servicePerformedOther",
                label: "Other service performed",
                type: "text",
                placeholder: "Describe other service",
                visibleWhen: {
                  fieldId: "servicePerformed",
                  values: ["other"]
                },
                prefill: [
                  { source: "priorField", sectionId: "inventory", fieldId: "servicePerformedOther" }
                ]
              },
              {
                id: "billingExtinguisherType",
                label: "Billing extinguisher type",
                type: "text",
                hidden: true,
                readOnly: true,
                calculation: {
                  key: "firstNonEmptyValue",
                  sourceFieldIds: ["extinguisherTypeOther", "extinguisherType"]
                }
              },
              {
                id: "gaugeStatus",
                label: "Gauge status",
                type: "select",
                optionProvider: "pass_fail",
                prefill: [{ source: "reportDefault", value: "pass" }]
              },
              {
                id: "mountingSecure",
                label: "Mounting secure",
                type: "select",
                optionProvider: "pass_fail",
                prefill: [{ source: "reportDefault", value: "pass" }]
              },
              {
                id: "notes",
                label: "Notes",
                type: "text",
                placeholder: "Add extinguisher notes"
              }
            ]
          },
          {
            id: "unitsInspected",
            label: "Units inspected",
            type: "number",
            placeholder: "0",
            calculation: { key: "assetCountFromRepeater", sourceFieldId: "extinguishers" },
            readOnly: true
          }
        ]
      },
      {
        id: "service",
        label: "Service findings",
        description: "Record work performed and any follow-up recommendation.",
        fields: [
          { id: "followUpRecommended", label: "Follow-up recommended", type: "boolean" },
          { id: "jurisdictionNotes", label: "Jurisdiction notes", type: "text", placeholder: "AHJ notes or code references" }
        ]
      }
    ],
    billableMappings: {
      repeaters: [
        {
          sourceSection: "inventory",
          repeater: "extinguishers",
          field: "servicePerformed",
          category: "service",
          descriptionTemplate: "Annual Inspection",
          code: "FE-ANNUAL",
          unit: "ea",
          quantitySource: "constant",
          quantityConstant: 1,
          includePerRow: true
        },
        {
          sourceSection: "inventory",
          repeater: "extinguishers",
          field: "servicePerformed",
          category: "service",
          descriptionTemplate: "{{billingValueDescription}} ({{billingExtinguisherType}})",
          codeTemplate: "FE-{{billingValueCode}}-{{billingExtinguisherType}}",
          unit: "ea",
          quantitySource: "constant",
          quantityConstant: 1,
          includeWhenTruthy: true,
          expandValues: true,
          excludeValues: ["Annual Inspection"],
          valueCodeMap: {
            "Maintenance": "MAINTENANCE",
            "6-Year Maintenance": "6YR",
            "Hydro Test": "HYDRO",
            "Recharge": "RECHARGE",
            "Repair": "REPAIR",
            "New": "NEW",
            "Removed from Service": "REMOVED",
            "other": "OTHER"
          },
          otherValue: "other",
          otherDetailField: "servicePerformedOther"
        }
      ]
    }
  },
  fire_alarm: {
    label: "Fire alarm",
    description: "Control panel, device, notification, monitoring, and system-summary inspection workflow.",
    pdf: {
      subtitle: "Fire Alarm Inspection and Testing Report",
      nfpaReferences: ["NFPA 72", "NFPA 70"]
    },
    billableMappings: {
      fields: [
        {
          sourceSection: "system-summary",
          field: "laborHours",
          category: "labor",
          description: "On-site labor",
          unit: "hours",
          quantitySource: "fieldValue",
          includeWhenGreaterThanZero: true
        }
      ]
    },
    sections: [
      {
        id: "control-panel",
        label: "Control panel",
        description: "Inspect panel identification, power supplies, indications, communication, annunciation, and physical condition.",
        fields: [
          {
            id: "controlPanels",
            label: "Control panels",
            description: "Track each fire alarm control panel inspected for this visit.",
            type: "repeater",
            addLabel: "Add control panel",
            repeatableSource: "siteAssets",
            assetFilter: [{ source: "assetMetadata", key: "alarmRole", oneOf: ["control_panel"] }],
            rowIdentityField: "assetId",
            validation: [{ type: "minRows", value: 1, message: "Add at least one fire alarm control panel before finalizing." }],
            rowFields: [
              {
                id: "assetId",
                label: "Linked asset",
                type: "select",
                optionProvider: "assetSelect",
                assetFilter: [{ source: "assetMetadata", key: "alarmRole", oneOf: ["control_panel"] }],
                mappings: [
                  {
                    source: "optionMetadata",
                    targets: [
                      { fieldId: "assetTag", sourceKey: "assetTag", mode: "always" },
                      { fieldId: "panelName", sourceKey: "panelName", mode: "if_empty" },
                      { fieldId: "manufacturer", sourceKey: "manufacturer", mode: "if_empty" },
                      { fieldId: "model", sourceKey: "model", mode: "if_empty" },
                      { fieldId: "serialNumber", sourceKey: "serialNumber", mode: "if_empty" },
                      { fieldId: "location", sourceKey: "location", mode: "always" },
                      { fieldId: "communicationPathType", sourceKey: "communicationPathType", mode: "if_empty" }
                    ]
                  }
                ]
              },
              { id: "assetTag", label: "Asset tag", type: "text", placeholder: "FAP-100", prefill: [{ source: "asset", key: "assetTag" }, { source: "priorField", sectionId: "control-panel", fieldId: "assetTag" }] },
              { id: "panelName", label: "Panel name", type: "text", placeholder: "Main fire alarm panel", prefill: [{ source: "assetMetadata", key: "panelName" }, { source: "asset", key: "name" }, { source: "priorField", sectionId: "control-panel", fieldId: "panelName" }] },
              { id: "manufacturer", label: "Manufacturer", type: "text", placeholder: "Notifier", prefill: [{ source: "assetMetadata", key: "manufacturer" }, { source: "priorField", sectionId: "control-panel", fieldId: "manufacturer" }] },
              { id: "model", label: "Model", type: "text", placeholder: "NFS2-3030", prefill: [{ source: "assetMetadata", key: "model" }, { source: "assetMetadata", key: "panelModel" }, { source: "priorField", sectionId: "control-panel", fieldId: "model" }] },
              { id: "serialNumber", label: "Serial number", type: "text", placeholder: "SN-0001", prefill: [{ source: "assetMetadata", key: "serialNumber" }, { source: "priorField", sectionId: "control-panel", fieldId: "serialNumber" }] },
              { id: "location", label: "Location", type: "text", placeholder: "Ground floor electrical room", prefill: [{ source: "assetMetadata", key: "location" }, { source: "priorField", sectionId: "control-panel", fieldId: "location" }, { source: "siteDefault", key: "siteName" }] },
              { id: "panelPhoto", label: "Panel photo reference", type: "text", placeholder: "Use report photo attachments below for panel photo capture", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "panelPhoto" }] },
              { id: "communicationPathType", label: "Communication path", type: "select", optionProvider: "communicationPathTypes", prefill: [{ source: "assetMetadata", key: "communicationPathType" }, { source: "priorField", sectionId: "control-panel", fieldId: "communicationPathType" }] }
            ]
          },
          { id: "controlPanelsInspected", label: "Control panels inspected", type: "number", placeholder: "0", calculation: { key: "assetCountFromRepeater", sourceFieldId: "controlPanels" }, readOnly: true },
          { id: "lineVoltageStatus", label: "Line voltage status", type: "select", optionProvider: "normalLowHighNA", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "lineVoltageStatus" }, { source: "reportDefault", value: "normal" }] },
          { id: "acPowerIndicator", label: "AC power indicator", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "acPowerIndicator" }, { source: "reportDefault", value: "yes" }] },
          { id: "acBreakerLocked", label: "AC breaker locked", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "acBreakerLocked" }] },
          { id: "powerSupplyCondition", label: "Power supply condition", type: "select", optionProvider: "panelConditionOptions", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "powerSupplyCondition" }] },
          { id: "batteryDateCode", label: "Battery date code", type: "text", placeholder: "2025-08", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "batteryDateCode" }] },
          {
            id: "batterySize",
            label: "Battery size",
            type: "select",
            optionProvider: "fireAlarmBatterySizes",
            customValueFieldId: "batterySizeOther",
            customValueTrigger: "other",
            prefill: [
              { source: "assetMetadata", key: "batterySize" },
              { source: "priorField", sectionId: "control-panel", fieldId: "batterySize" },
              { source: "priorAnyField", sectionId: "control-panel", fieldIds: ["batterySizeOther", "batteryConfiguration", "batteryConfigurationCustom", "batteryVoltage", "batteryAmpHourRating"], value: "other" }
            ]
          },
          {
            id: "batterySizeOther",
            label: "Other battery size",
            type: "text",
            placeholder: "Example: 12V 18AH",
            visibleWhen: { fieldId: "batterySize", values: ["other"] },
            prefill: [
              { source: "priorField", sectionId: "control-panel", fieldId: "batterySizeOther" },
              { source: "priorField", sectionId: "control-panel", fieldId: "batteryConfigurationCustom" },
              { source: "priorFieldsJoined", sectionId: "control-panel", fieldIds: ["batteryVoltage", "batteryAmpHourRating"], separator: " / " }
            ]
          },
          {
            id: "batteryQuantity",
            label: "Quantity",
            type: "select",
            optionProvider: "quantityZeroToTwenty",
            prefill: [
              { source: "assetMetadata", key: "batteryQuantity" },
              { source: "priorField", sectionId: "control-panel", fieldId: "batteryQuantity" }
            ]
          },
          { id: "batteryChargeLevel", label: "Battery charge level", type: "select", optionProvider: "normalLowHighNA", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "batteryChargeLevel" }] },
          { id: "batteryLoadTest", label: "Battery load test", type: "select", optionProvider: "passFailNA", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "batteryLoadTest" }] },
          { id: "batteriesReplacementNeeded", label: "Batteries Replaced During Inspection?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "batteriesReplacementNeeded" }] },
          {
            id: "replacementBatterySize",
            label: "Replacement battery size",
            type: "select",
            optionProvider: "fireAlarmBatterySizes",
            customValueFieldId: "replacementBatterySizeOther",
            customValueTrigger: "other",
            visibleWhen: { fieldId: "batteriesReplacementNeeded", values: ["yes"] },
            prefill: [
              { source: "priorField", sectionId: "control-panel", fieldId: "replacementBatterySize" },
              { source: "priorAnyField", sectionId: "control-panel", fieldIds: ["replacementBatterySizeOther"], value: "other" }
            ]
          },
          {
            id: "replacementBatterySizeOther",
            label: "Other replacement battery size",
            type: "text",
            placeholder: "Example: 12V 18AH",
            visibleWhen: { fieldId: "replacementBatterySize", values: ["other"] },
            prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "replacementBatterySizeOther" }]
          },
          {
            id: "replacementBatteryQuantity",
            label: "Replacement battery quantity",
            type: "select",
            optionProvider: "quantityZeroToTwenty",
            visibleWhen: { fieldId: "batteriesReplacementNeeded", values: ["yes"] },
            prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "replacementBatteryQuantity" }]
          },
          { id: "audibleAlarm", label: "Audible alarm indication", type: "select", optionProvider: "passFailNA", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "audibleAlarm" }] },
          { id: "visualAlarm", label: "Visual alarm indication", type: "select", optionProvider: "passFailNA", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "visualAlarm" }] },
          { id: "audibleTrouble", label: "Audible trouble indication", type: "select", optionProvider: "passFailNA", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "audibleTrouble" }] },
          { id: "visualTrouble", label: "Visual trouble indication", type: "select", optionProvider: "passFailNA", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "visualTrouble" }] },
          { id: "lcdDisplayFunctional", label: "LCD display functional", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "lcdDisplayFunctional" }] },
          { id: "remoteMonitoring", label: "Remote monitoring connected", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "remoteMonitoring" }] },
          { id: "centralStationSignalTest", label: "Central station signal test", type: "select", optionProvider: "passFailDeficiency", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "centralStationSignalTest" }] },
          { id: "remoteAnnunciator", label: "Remote annunciator present", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "remoteAnnunciator" }] },
          { id: "remoteIndicators", label: "Remote indicators", type: "select", optionProvider: "passFailNA", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "remoteIndicators" }] },
          { id: "doorAndLockCondition", label: "Door and lock condition", type: "select", optionProvider: "panelConditionOptions", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "doorAndLockCondition" }] },
          { id: "controlPanelCondition", label: "Control panel condition", type: "select", optionProvider: "passFailDeficiency", prefill: [{ source: "priorField", sectionId: "control-panel", fieldId: "controlPanelCondition" }] },
          { id: "controlPanelDeficiencyCount", label: "Control panel deficiencies", type: "number", calculation: { key: "countFieldsMatchingValues", sourceFieldIds: ["powerSupplyCondition", "batteryChargeLevel", "batteryLoadTest", "batteriesReplacementNeeded", "centralStationSignalTest", "doorAndLockCondition", "controlPanelCondition"], values: ["attention", "low", "high", "fail", "deficiency", "yes"] }, readOnly: true },
          { id: "controlPanelComments", label: "Control panel comments", type: "text", placeholder: "Document primary power, battery, indication, monitoring, or cabinet concerns" }
        ]
      },
      {
        id: "initiating-devices",
        label: "Initiating devices",
        description: "Record detectors, pull stations, and supervisory initiating devices tested during this visit.",
        fields: [
          {
            id: "initiatingDevices",
            label: "Initiating device rows",
            type: "repeater",
            addLabel: "Add initiating device",
            repeatableSource: "siteAssets",
            allowDuplicate: true,
            bulkActions: [
              {
                id: "mark_all_pass",
                label: "Mark All Pass",
                targets: [{ fieldId: "functionalTestResult", value: "pass" }]
              },
              {
                id: "mark_all_na",
                label: "Mark All N/A",
                targets: [{ fieldId: "functionalTestResult", value: "na" }]
              },
              {
                id: "clear_results",
                label: "Clear Results",
                targets: [{ fieldId: "functionalTestResult", value: "" }]
              }
            ],
            completionFieldIds: ["functionalTestResult"],
            deficiencyFieldId: "functionalTestResult",
            assetFilter: [{ source: "assetMetadata", key: "alarmRole", oneOf: ["initiating_device"] }],
            rowIdentityField: "assetId",
            validation: [{ type: "minRows", value: 1, message: "Add at least one initiating device row before finalizing." }],
            rowFields: [
              {
                id: "assetId",
                label: "Linked asset",
                type: "select",
                optionProvider: "assetSelect",
                assetFilter: [{ source: "assetMetadata", key: "alarmRole", oneOf: ["initiating_device"] }],
                mappings: [
                  {
                    source: "optionMetadata",
                    targets: [
                      { fieldId: "assetTag", sourceKey: "assetTag", mode: "always" },
                      { fieldId: "deviceType", sourceKey: "deviceType", mode: "if_empty" },
                      { fieldId: "location", sourceKey: "location", mode: "always" },
                      { fieldId: "serialNumber", sourceKey: "serialNumber", mode: "if_empty" }
                    ]
                  }
                ]
              },
              { id: "assetTag", label: "Asset tag", type: "text", placeholder: "FAI-101", prefill: [{ source: "asset", key: "assetTag" }, { source: "priorField", sectionId: "initiating-devices", fieldId: "assetTag" }] },
              {
                id: "deviceType",
                label: "Device type",
                type: "select",
                optionProvider: "alarmDeviceTypes",
                customValueFieldId: "deviceTypeOther",
                customValueTrigger: "other",
                prefill: [
                  { source: "assetMetadata", key: "deviceType" },
                  { source: "priorField", sectionId: "initiating-devices", fieldId: "deviceType" },
                  { source: "priorAnyField", sectionId: "initiating-devices", fieldIds: ["deviceTypeOther"], value: "other" }
                ]
              },
              {
                id: "deviceTypeOther",
                label: "Custom device type",
                type: "text",
                placeholder: "Enter initiating device type",
                visibleWhen: { fieldId: "deviceType", values: ["other"] }
              },
              { id: "location", label: "Device location", type: "text", placeholder: "Lobby north exit", prefill: [{ source: "assetMetadata", key: "location" }, { source: "priorField", sectionId: "initiating-devices", fieldId: "location" }, { source: "siteDefault", key: "siteName" }] },
              { id: "serialNumber", label: "Address / zone", type: "text", placeholder: "Address 17 / Zone 3", prefill: [{ source: "assetMetadata", key: "serialNumber" }, { source: "priorField", sectionId: "initiating-devices", fieldId: "serialNumber" }] },
              { id: "functionalTestResult", label: "Functional test result", type: "select", optionProvider: "deviceFunctionalResultOptions", prefill: [{ source: "priorField", sectionId: "initiating-devices", fieldId: "functionalTestResult" }, { source: "reportDefault", value: "pass" }] },
              { id: "physicalCondition", label: "Physical condition", type: "select", optionProvider: "physicalConditionOptions", prefill: [{ source: "priorField", sectionId: "initiating-devices", fieldId: "physicalCondition" }, { source: "reportDefault", value: "good" }] },
              { id: "sensitivityOrOperationResult", label: "Sensitivity / operation result", type: "select", optionProvider: "passFailDeficiency", prefill: [{ source: "priorField", sectionId: "initiating-devices", fieldId: "sensitivityOrOperationResult" }] },
              { id: "comments", label: "Comments", type: "text", placeholder: "Sensitivity, operation, access, or labeling notes" },
              { id: "deficiencySeverity", label: "Deficiency severity", type: "select", hidden: true, optionProvider: "deficiencySeverityOptions", prefill: [{ source: "priorField", sectionId: "initiating-devices", fieldId: "deficiencySeverity" }, { source: "reportDefault", value: "medium" }] },
              { id: "deficiencyNotes", label: "Deficiency notes", type: "text", hidden: true, placeholder: "Capture issue details or repair notes", prefill: [{ source: "priorField", sectionId: "initiating-devices", fieldId: "deficiencyNotes" }] },
              { id: "deficiencyPhoto", label: "Deficiency photo", type: "photo", hidden: true, prefill: [{ source: "priorField", sectionId: "initiating-devices", fieldId: "deficiencyPhoto" }] }
            ]
          },
          { id: "initiatingDevicesInspected", label: "Initiating devices inspected", type: "number", placeholder: "0", calculation: { key: "assetCountFromRepeater", sourceFieldId: "initiatingDevices" }, readOnly: true },
          { id: "initiatingDeviceDeficiencyCount", label: "Initiating device deficiencies", type: "number", calculation: { key: "countRowsMatchingAnyValues", sourceFieldId: "initiatingDevices", rowFieldIds: ["functionalTestResult", "physicalCondition", "sensitivityOrOperationResult"], values: ["fail", "deficiency", "damaged"] }, readOnly: true },
          { id: "initiatingDeviceNotes", label: "Initiating device notes", type: "text", placeholder: "Sampling approach, inaccessible devices, detector cleaning, or labeling notes" }
        ]
      },
      {
        id: "notification",
        label: "Notification appliances",
        description: "Inspect notification appliance performance, candela settings, and visible/audible operation.",
        fields: [
          {
            id: "notificationAppliances",
            label: "Notification appliance rows",
            type: "repeater",
            addLabel: "Add notification appliance",
            repeatableSource: "siteAssets",
            bulkActions: [
              {
                id: "mark_all_pass",
                label: "Mark All Pass",
                targets: [
                  { fieldId: "audibleOperation", value: "pass" },
                  { fieldId: "visualOperation", value: "pass" }
                ]
              },
              {
                id: "mark_all_na",
                label: "Mark All N/A",
                targets: [
                  { fieldId: "audibleOperation", value: "na" },
                  { fieldId: "visualOperation", value: "na" }
                ]
              },
              {
                id: "clear_results",
                label: "Clear Results",
                targets: [
                  { fieldId: "audibleOperation", value: "" },
                  { fieldId: "visualOperation", value: "" }
                ]
              }
            ],
            completionFieldIds: ["audibleOperation", "visualOperation"],
            deficiencyFieldIds: ["audibleOperation", "visualOperation"],
            assetFilter: [{ source: "assetMetadata", key: "alarmRole", oneOf: ["notification_appliance"] }],
            rowIdentityField: "assetId",
            validation: [{ type: "minRows", value: 1, message: "Add at least one notification appliance row before finalizing." }],
            rowFields: [
              {
                id: "assetId",
                label: "Linked asset",
                type: "select",
                optionProvider: "assetSelect",
                assetFilter: [{ source: "assetMetadata", key: "alarmRole", oneOf: ["notification_appliance"] }],
                mappings: [
                  {
                    source: "optionMetadata",
                    targets: [
                      { fieldId: "assetTag", sourceKey: "assetTag", mode: "always" },
                      { fieldId: "applianceType", sourceKey: "applianceType", mode: "if_empty" },
                      { fieldId: "quantity", sourceKey: "applianceQuantity", mode: "if_empty" }
                    ]
                  }
                ]
              },
              { id: "assetTag", label: "Asset tag", type: "text", hidden: true, placeholder: "FAN-201", prefill: [{ source: "asset", key: "assetTag" }, { source: "priorField", sectionId: "notification", fieldId: "assetTag" }] },
              {
                id: "applianceType",
                label: "Appliance type",
                type: "select",
                optionProvider: "alarmNotificationApplianceTypes",
                customValueFieldId: "applianceTypeCustom",
                customValueTrigger: "other",
                prefill: [
                  { source: "assetMetadata", key: "applianceType" },
                  { source: "priorField", sectionId: "notification", fieldId: "applianceType" },
                  { source: "priorAnyField", sectionId: "notification", fieldIds: ["applianceTypeCustom"], value: "other" }
                ]
              },
              {
                id: "applianceTypeCustom",
                label: "Custom appliance type",
                type: "text",
                visibleWhen: { fieldId: "applianceType", values: ["other"] },
                placeholder: "Describe appliance type"
              },
              {
                id: "quantity",
                label: "Quantity",
                type: "select",
                optionProvider: "quantityZeroToHundred",
                customValueFieldId: "quantityCustom",
                customValueTrigger: "other",
                prefill: [
                  { source: "assetMetadata", key: "applianceQuantity" },
                  { source: "assetMetadata", key: "quantity" },
                  { source: "priorField", sectionId: "notification", fieldId: "quantity" },
                  { source: "priorAnyField", sectionId: "notification", fieldIds: ["quantityCustom"], value: "other" },
                  { source: "reportDefault", value: "1" }
                ]
              },
              {
                id: "quantityCustom",
                label: "Custom quantity",
                type: "number",
                visibleWhen: { fieldId: "quantity", values: ["other"] },
                placeholder: "Enter custom quantity",
                prefill: [{ source: "priorField", sectionId: "notification", fieldId: "quantityCustom" }]
              },
              { id: "audibleOperation", label: "Audible operation", type: "select", optionProvider: "passFailNA", prefill: [{ source: "priorField", sectionId: "notification", fieldId: "audibleOperation" }, { source: "reportDefault", value: "pass" }] },
              { id: "visualOperation", label: "Visual operation", type: "select", optionProvider: "passFailNA", prefill: [{ source: "priorField", sectionId: "notification", fieldId: "visualOperation" }, { source: "reportDefault", value: "pass" }] },
              { id: "comments", label: "Comments", type: "text", placeholder: "Candela setting, lens condition, or performance notes" },
              { id: "deficiencySeverity", label: "Deficiency severity", type: "select", hidden: true, optionProvider: "deficiencySeverityOptions", prefill: [{ source: "priorField", sectionId: "notification", fieldId: "deficiencySeverity" }, { source: "reportDefault", value: "medium" }] },
              { id: "deficiencyNotes", label: "Deficiency notes", type: "text", hidden: true, placeholder: "Capture issue details or repair notes", prefill: [{ source: "priorField", sectionId: "notification", fieldId: "deficiencyNotes" }] },
              { id: "deficiencyPhoto", label: "Deficiency photo", type: "photo", hidden: true, prefill: [{ source: "priorField", sectionId: "notification", fieldId: "deficiencyPhoto" }] }
            ]
          },
          { id: "notificationAppliancesInspected", label: "Notification appliances inspected", type: "number", placeholder: "0", calculation: { key: "assetCountFromRepeater", sourceFieldId: "notificationAppliances" }, readOnly: true },
          { id: "notificationDeficiencyCount", label: "Notification appliance deficiencies", type: "number", calculation: { key: "countRowsMatchingAnyValues", sourceFieldId: "notificationAppliances", rowFieldIds: ["audibleOperation", "visualOperation"], values: ["fail", "deficiency", "damaged"] }, readOnly: true },
          { id: "notificationNotes", label: "Notification notes", type: "text", placeholder: "Audibility, visibility, candela, synchronization, or appliance notes" }
        ]
      },
      {
        id: "system-summary",
        label: "General system summary",
        description: "Capture overall system disposition, repair recommendations, and follow-up needs.",
        fields: [
          { id: "controlPanelsInspected", label: "Control panels inspected", type: "number", calculation: { key: "assetCountFromRepeater", sourceSectionId: "control-panel", sourceFieldId: "controlPanels" }, readOnly: true },
          { id: "initiatingDevicesInspected", label: "Initiating devices inspected", type: "number", calculation: { key: "assetCountFromRepeater", sourceSectionId: "initiating-devices", sourceFieldId: "initiatingDevices" }, readOnly: true },
          { id: "notificationAppliancesInspected", label: "Notification appliances inspected", type: "number", calculation: { key: "assetCountFromRepeater", sourceSectionId: "notification", sourceFieldId: "notificationAppliances" }, readOnly: true },
          { id: "deficiencyCount", label: "Deficiency count", type: "number", calculation: { key: "sumFields", sourceFields: [{ sectionId: "control-panel", fieldId: "controlPanelDeficiencyCount" }, { sectionId: "initiating-devices", fieldId: "initiatingDeviceDeficiencyCount" }, { sectionId: "notification", fieldId: "notificationDeficiencyCount" }] }, readOnly: true },
          { id: "deficienciesFound", label: "Deficiencies found", type: "boolean", calculation: { key: "booleanFromNumberThreshold", sourceFieldId: "deficiencyCount", atOrAbove: 1 }, readOnly: true },
          { id: "fireAlarmSystemStatus", label: "Fire alarm system status", type: "select", optionProvider: "fireAlarmOverallStatusOptions", prefill: [{ source: "priorField", sectionId: "system-summary", fieldId: "fireAlarmSystemStatus" }] },
          { id: "laborHours", label: "Labor hours", type: "number", placeholder: "0", prefill: [{ source: "priorField", sectionId: "system-summary", fieldId: "laborHours" }] },
          { id: "inspectorNotes", label: "Inspector notes", type: "text", placeholder: "Overall inspection notes, sampling notes, and system observations", prefill: [{ source: "priorField", sectionId: "system-summary", fieldId: "inspectorNotes" }] },
          { id: "recommendedRepairs", label: "Recommended repairs", type: "text", placeholder: "List recommended repair or service follow-up items", prefill: [{ source: "priorField", sectionId: "system-summary", fieldId: "recommendedRepairs" }] },
          { id: "followUpRequired", label: "Follow-up required", type: "boolean", prefill: [{ source: "priorField", sectionId: "system-summary", fieldId: "followUpRequired" }] }
        ]
      }
    ]
  },
  wet_chemical_acceptance_test: acceptanceTestReportTemplate,
  work_order: workOrderReportTemplate,
  wet_fire_sprinkler: wetSprinklerReportTemplate,
  joint_commission_fire_sprinkler: jointCommissionFireSprinklerReportTemplate,
  backflow: backflowReportTemplate,
  fire_pump: {
    label: "Fire pump",
    description: "Pump room readiness, controller status, and weekly/monthly operational checks.",
    pdf: {
      subtitle: "Fire Pump Inspection Report",
      nfpaReferences: ["NFPA 20", "NFPA 25"]
    },
    sections: [
      {
        id: "pump-room",
        label: "Pump room",
        description: "Inspect room condition, heat, lighting, and access.",
        fields: [
          {
            id: "pumpAssets",
            label: "Pump inventory",
            description: "Track the pump and controller assets inspected for this run test.",
            type: "repeater",
            addLabel: "Add pump asset",
            repeatableSource: "siteAssets",
            rowIdentityField: "assetId",
            validation: [{ type: "minRows", value: 1, message: "Add at least one fire pump asset before finalizing." }],
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
                      { fieldId: "location", sourceKey: "location", mode: "always" },
                      { fieldId: "controllerModel", sourceKey: "controller", mode: "if_empty" },
                      { fieldId: "driverType", sourceKey: "driverType", mode: "if_empty" }
                    ]
                  }
                ]
              },
              {
                id: "assetTag",
                label: "Asset tag",
                type: "text",
                placeholder: "PMP-220",
                prefill: [
                  { source: "asset", key: "assetTag" },
                  { source: "priorField", sectionId: "pump-room", fieldId: "assetTag" }
                ]
              },
              {
                id: "location",
                label: "Location",
                type: "text",
                placeholder: "Pump room",
                prefill: [
                  { source: "assetMetadata", key: "location" },
                  { source: "priorField", sectionId: "pump-room", fieldId: "location" },
                  { source: "siteDefault", key: "siteName" }
                ]
              },
              {
                id: "controllerModel",
                label: "Controller model",
                type: "text",
                placeholder: "Metron EconoMatic",
                prefill: [
                  { source: "assetMetadata", key: "controller" },
                  { source: "priorField", sectionId: "pump-room", fieldId: "controllerModel" }
                ]
              },
              {
                id: "driverType",
                label: "Driver type",
                type: "text",
                placeholder: "Electric",
                prefill: [
                  { source: "assetMetadata", key: "driverType" },
                  { source: "priorField", sectionId: "pump-room", fieldId: "driverType" }
                ]
              }
            ]
          },
          {
            id: "pumpsInspected",
            label: "Pump assets inspected",
            type: "number",
            placeholder: "0",
            calculation: { key: "assetCountFromRepeater", sourceFieldId: "pumpAssets" },
            readOnly: true
          },
          {
            id: "roomCondition",
            label: "Room condition",
            type: "select",
            optionProvider: "passFail",
            prefill: [{ source: "priorField", sectionId: "pump-room", fieldId: "roomCondition" }]
          },
          {
            id: "environmentNormal",
            label: "Environment suitable",
            type: "boolean",
            prefill: [{ source: "priorField", sectionId: "pump-room", fieldId: "environmentNormal" }]
          },
          { id: "roomNotes", label: "Room notes", type: "text", placeholder: "Leaks, drainage, heat, clearance" }
        ]
      },
      {
        id: "controller",
        label: "Controller and power",
        description: "Record controller condition, alarms, and power sources.",
        fields: [
          {
            id: "controllerNormal",
            label: "Controller normal",
            type: "boolean",
            prefill: [{ source: "priorField", sectionId: "controller", fieldId: "controllerNormal" }]
          },
          {
            id: "powerSourceStatus",
            label: "Power source status",
            type: "select",
            optionProvider: "passFail",
            prefill: [{ source: "priorField", sectionId: "controller", fieldId: "powerSourceStatus" }]
          },
          { id: "controllerNotes", label: "Controller notes", type: "text", placeholder: "Alarms, phase reversal, battery or transfer switch notes" }
        ]
      },
      {
        id: "run-test",
        label: "Run test",
        description: "Capture churn test readings and performance observations.",
        fields: [
          {
            id: "runDurationMinutes",
            label: "Run duration (minutes)",
            type: "number",
            placeholder: "0",
            prefill: [
              { source: "priorField", sectionId: "run-test", fieldId: "runDurationMinutes" },
              { source: "reportDefault", value: 30 }
            ]
          },
          {
            id: "suctionPressure",
            label: "Suction pressure",
            type: "select",
            optionProvider: "pressure",
            prefill: [{ source: "priorField", sectionId: "run-test", fieldId: "suctionPressure" }]
          },
          { id: "runTestNotes", label: "Run test notes", type: "text", placeholder: "RPM, vibration, leaks, diesel or electric observations" }
        ]
      }
    ]
  },
  dry_fire_sprinkler: {
    label: "Dry fire sprinkler",
    description: "Dry valve trim, air supply, low-point drains, and trip readiness.",
    pdf: {
      subtitle: "Dry Fire Sprinkler Inspection Report",
      nfpaReferences: ["NFPA 13", "NFPA 25"]
    },
    sections: [
      {
        id: "dry-valve",
        label: "Dry valve assembly",
        description: "Inspect valve trim, gauges, and general condition.",
        fields: [
          {
            id: "dryValveAssemblies",
            label: "Dry valve assemblies",
            description: "Track each dry valve assembly inspected for the system.",
            type: "repeater",
            addLabel: "Add dry valve assembly",
            repeatableSource: "siteAssets",
            rowIdentityField: "assetId",
            validation: [{ type: "minRows", value: 1, message: "Add at least one dry valve assembly before finalizing." }],
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
                      { fieldId: "location", sourceKey: "location", mode: "always" },
                      { fieldId: "valveType", sourceKey: "valveType", mode: "if_empty" },
                      { fieldId: "compressorType", sourceKey: "compressorType", mode: "if_empty" },
                      { fieldId: "quickOpeningDevice", sourceKey: "quickOpeningDevice", mode: "if_empty" },
                      { fieldId: "drainCount", sourceKey: "drainCount", mode: "if_empty" }
                    ]
                  }
                ]
              },
              {
                id: "assetTag",
                label: "Asset tag",
                type: "text",
                placeholder: "DRY-300",
                prefill: [
                  { source: "asset", key: "assetTag" },
                  { source: "priorField", sectionId: "dry-valve", fieldId: "assetTag" }
                ]
              },
              {
                id: "location",
                label: "Location",
                type: "text",
                placeholder: "North warehouse mezzanine",
                prefill: [
                  { source: "assetMetadata", key: "location" },
                  { source: "priorField", sectionId: "dry-valve", fieldId: "location" },
                  { source: "siteDefault", key: "siteName" }
                ]
              },
              {
                id: "valveType",
                label: "Valve type",
                type: "text",
                placeholder: "Dry pipe valve",
                prefill: [
                  { source: "assetMetadata", key: "valveType" },
                  { source: "priorField", sectionId: "dry-valve", fieldId: "valveType" }
                ]
              },
              {
                id: "compressorType",
                label: "Compressor type",
                type: "text",
                placeholder: "Tank-mounted air compressor",
                prefill: [
                  { source: "assetMetadata", key: "compressorType" },
                  { source: "priorField", sectionId: "dry-valve", fieldId: "compressorType" }
                ]
              },
              {
                id: "quickOpeningDevice",
                label: "Quick-opening device",
                type: "text",
                placeholder: "Accelerator installed",
                prefill: [
                  { source: "assetMetadata", key: "quickOpeningDevice" },
                  { source: "priorField", sectionId: "dry-valve", fieldId: "quickOpeningDevice" }
                ]
              },
              {
                id: "drainCount",
                label: "Auxiliary drain count",
                type: "number",
                placeholder: "0",
                prefill: [
                  { source: "assetMetadata", key: "drainCount" },
                  { source: "priorField", sectionId: "dry-valve", fieldId: "drainCount" }
                ]
              }
            ]
          },
          {
            id: "assembliesInspected",
            label: "Dry valve assemblies inspected",
            type: "number",
            placeholder: "0",
            calculation: { key: "assetCountFromRepeater", sourceFieldId: "dryValveAssemblies" },
            readOnly: true
          },
          {
            id: "valveCondition",
            label: "Valve condition",
            type: "select",
            optionProvider: "passFail",
            prefill: [{ source: "priorField", sectionId: "dry-valve", fieldId: "valveCondition" }]
          },
          {
            id: "trimSecure",
            label: "Trim secure",
            type: "boolean",
            prefill: [{ source: "priorField", sectionId: "dry-valve", fieldId: "trimSecure" }]
          },
          { id: "valveAssemblyNotes", label: "Assembly notes", type: "text", placeholder: "Leaks, corrosion, priming level, labels" }
        ]
      },
      {
        id: "air-supply",
        label: "Air supply",
        description: "Record compressor, supervisory air, and pressure maintenance condition.",
        fields: [
          {
            id: "compressorOperational",
            label: "Compressor operational",
            type: "boolean",
            prefill: [{ source: "priorField", sectionId: "air-supply", fieldId: "compressorOperational" }]
          },
          {
            id: "airPressureStatus",
            label: "Air pressure status",
            type: "select",
            optionProvider: "pressure",
            prefill: [{ source: "priorField", sectionId: "air-supply", fieldId: "airPressureStatus" }]
          },
          { id: "airSupplyNotes", label: "Air supply notes", type: "text", placeholder: "Compressor cycle, leaks, maintenance notes" }
        ]
      },
      {
        id: "drains-and-trip",
        label: "Drains and trip readiness",
        description: "Verify auxiliary drains and trip test readiness.",
        fields: [
          {
            id: "auxDrainsCleared",
            label: "Auxiliary drains cleared",
            type: "boolean",
            prefill: [{ source: "priorField", sectionId: "drains-and-trip", fieldId: "auxDrainsCleared" }]
          },
          {
            id: "tripReadiness",
            label: "Trip readiness",
            type: "select",
            optionProvider: "passFail",
            prefill: [{ source: "priorField", sectionId: "drains-and-trip", fieldId: "tripReadiness" }]
          },
          { id: "tripNotes", label: "Trip notes", type: "text", placeholder: "Cold weather concerns, drum drips, quick-opening devices" }
        ]
      }
    ]
  },
  kitchen_suppression: {
    label: "Kitchen suppression",
    description: "Commercial hood system coverage, checklist, and service/material tracking.",
    defaultRecurrenceFrequency: RecurrenceFrequency.SEMI_ANNUAL,
    pdf: {
      subtitle: "Kitchen Suppression Inspection Report",
      nfpaReferences: ["NFPA 17A", "NFPA 96"]
    },
    billableMappings: {
      fields: [
        {
          sourceSection: "system-details",
          field: "numberOfCylinders",
          category: "service",
          description: "Kitchen Suppression System Inspection",
          codeField: "billingInspectionCode",
          unit: "system",
          quantitySource: "constant",
          quantityConstant: 1,
          alwaysInclude: true,
          metadataFields: ["numberOfCylinders", "systemLocation", "systemSizeGallons", "billingManufacturer"]
        },
        {
          sourceSection: "tank-and-service",
          field: "fusibleLinksUsedQuantity",
          category: "material",
          description: "Fusible links used",
          descriptionTemplate: "Fusible links used ({{fusibleLinksUsedTemperature}})",
          code: "KS-FUSIBLE-LINK",
          unit: "ea",
          quantitySource: "fieldValue",
          includeWhenGreaterThanZero: true
        },
        {
          sourceSection: "tank-and-service",
          field: "capsUsedQuantity",
          category: "material",
          description: "Caps used",
          descriptionTemplate: "Caps used ({{capsUsedType}})",
          code: "KS-CAP",
          unit: "ea",
          quantitySource: "fieldValue",
          includeWhenGreaterThanZero: true
        },
        {
          sourceSection: "tank-and-service",
          field: "cartridgesUsedQuantity",
          category: "material",
          description: "Cartridges used",
          descriptionTemplate: "Cartridges used ({{cartridgesUsedType}})",
          code: "KS-CARTRIDGE",
          unit: "ea",
          quantitySource: "fieldValue",
          includeWhenGreaterThanZero: true
        }
      ],
      repeaters: [
        {
          sourceSection: "tank-and-service",
          repeater: "fusibleLinksUsed",
          field: "quantity",
          category: "material",
          descriptionTemplate: "Fusible links used ({{temperature}})",
          code: "KS-FUSIBLE-LINK",
          unit: "ea",
          quantitySource: "fieldValue",
          includeWhenGreaterThanZero: true
        },
        {
          sourceSection: "tank-and-service",
          repeater: "capsUsed",
          field: "quantity",
          category: "material",
          descriptionTemplate: "Caps used ({{type}})",
          code: "KS-CAP",
          unit: "ea",
          quantitySource: "fieldValue",
          includeWhenGreaterThanZero: true
        },
        {
          sourceSection: "tank-and-service",
          repeater: "cartridgesUsed",
          field: "quantity",
          category: "material",
          descriptionTemplate: "Cartridges used ({{type}})",
          code: "KS-CARTRIDGE",
          unit: "ea",
          quantitySource: "fieldValue",
          includeWhenGreaterThanZero: true
        }
      ]
    },
    sections: [
      {
        id: "system-details",
        label: "System Details",
        description: "Capture the core kitchen suppression system details for this hood system.",
        fields: [
          {
            id: "systemSizeGallons",
            label: "System Size (Gallons)",
            type: "number",
            placeholder: "0",
            prefill: [{ source: "priorField", sectionId: "system-details", fieldId: "systemSizeGallons" }]
          },
          {
            id: "numberOfCylinders",
            label: "Number of Cylinders",
            type: "number",
            placeholder: "0",
            prefill: [{ source: "priorField", sectionId: "system-details", fieldId: "numberOfCylinders" }]
          },
          {
            id: "ul300Compliant",
            label: "UL 300 Compliant",
            type: "boolean",
            prefill: [{ source: "priorField", sectionId: "system-details", fieldId: "ul300Compliant" }]
          },
          {
            id: "systemLocation",
            label: "System Location",
            type: "text",
            placeholder: "Main kitchen line",
            prefill: [
              { source: "priorField", sectionId: "system-details", fieldId: "systemLocation" },
              { source: "siteDefault", key: "siteName" }
            ]
          },
          {
            id: "areaProtected",
            label: "Area Protected",
            type: "text",
            placeholder: "Cook line and fry station",
            prefill: [{ source: "priorField", sectionId: "system-details", fieldId: "areaProtected" }]
          },
          {
            id: "manufacturer",
            label: "Manufacturer",
            type: "select",
            optionProvider: "kitchen_suppression_manufacturers",
            customValueFieldId: "manufacturerOther",
            customValueTrigger: "other",
            legacyValueMap: {
              ansul: "Ansul",
              amerex: "Amerex",
              "range guard": "Range Guard",
              badger: "Badger",
              kidde: "Kidde",
              "pyro-chem": "Pyro-Chem",
              "pyro chem": "Pyro-Chem",
              protex: "ProTex",
              buckeye: "Buckeye",
              guardian: "Guardian",
              denlar: "Denlar",
              greenheck: "Greenheck",
              captiveaire: "CaptiveAire"
            },
            prefill: [{ source: "priorField", sectionId: "system-details", fieldId: "manufacturer" }]
          },
          {
            id: "manufacturerOther",
            label: "Other Manufacturer",
            type: "text",
            placeholder: "Enter manufacturer",
            visibleWhen: { fieldId: "manufacturer", values: ["other"] },
            prefill: [{ source: "priorField", sectionId: "system-details", fieldId: "manufacturerOther" }]
          },
          {
            id: "billingManufacturer",
            label: "Billing Manufacturer",
            type: "text",
            hidden: true,
            readOnly: true,
            calculation: {
              key: "firstNonEmptyValue",
              sourceFieldIds: ["manufacturerOther", "manufacturer"]
            }
          },
          {
            id: "billingInspectionCode",
            label: "Billing Inspection Code",
            type: "text",
            hidden: true,
            readOnly: true,
            calculation: {
              key: "kitchenSuppressionInspectionCodeFromManufacturer",
              sourceFieldIds: ["manufacturer", "manufacturerOther"]
            }
          },
          {
            id: "model",
            label: "Model",
            type: "text",
            placeholder: "R-102",
            prefill: [{ source: "priorField", sectionId: "system-details", fieldId: "model" }]
          },
          {
            id: "cylinderDates",
            label: "Cylinder Dates",
            type: "text",
            placeholder: "e.g., 01/2023, 03/2024",
            prefill: [{ source: "priorField", sectionId: "system-details", fieldId: "cylinderDates" }]
          },
          {
            id: "lastCylinderHydroDate",
            label: "Last Cylinder Hydro Date",
            type: "date",
            prefill: [{ source: "priorField", sectionId: "system-details", fieldId: "lastCylinderHydroDate" }]
          }
        ]
      },
      {
        id: "appliance-coverage",
        label: "Appliance Coverage",
        description: "Capture hood groupings and the protected appliances under each hood.",
        fields: [
          {
            id: "hoods",
            label: "Hoods",
            description: "Add each protected hood system for this inspection.",
            type: "repeater",
            addLabel: "Add Hood",
            validation: [{ type: "minRows", value: 1, message: "Add at least one hood before finalizing." }],
            rowFields: [
              {
                id: "hoodName",
                label: "Hood",
                type: "text",
                placeholder: "Hood 1",
                sequentialDefault: { prefix: "Hood" },
                prefill: [
                  { source: "priorField", sectionId: "appliance-coverage", fieldId: "hoodName" }
                ]
              },
              {
                id: "hoodSize",
                label: "Hood Size",
                type: "text",
                placeholder: "12 ft",
                prefill: [{ source: "priorField", sectionId: "appliance-coverage", fieldId: "hoodSize" }]
              },
              {
                id: "ductSize",
                label: "Duct Size",
                type: "text",
                placeholder: "18 x 18",
                prefill: [{ source: "priorField", sectionId: "appliance-coverage", fieldId: "ductSize" }]
              },
              {
                id: "ductQuantity",
                label: "Duct Quantity",
                type: "select",
                optionProvider: "quantityZeroToTen",
                prefill: [{ source: "priorField", sectionId: "appliance-coverage", fieldId: "ductQuantity" }]
              },
              {
                id: "ductNozzleQuantity",
                label: "Duct Nozzle Quantity",
                type: "select",
                optionProvider: "quantityZeroToFive",
                prefill: [{ source: "priorField", sectionId: "appliance-coverage", fieldId: "ductNozzleQuantity" }]
              },
              {
                id: "ductNozzleType",
                label: "Duct Nozzle Type",
                type: "text",
                placeholder: "1W or 2W",
                prefill: [{ source: "priorField", sectionId: "appliance-coverage", fieldId: "ductNozzleType" }]
              }
            ]
          },
          {
            id: "hoodAppliances",
            label: "Appliances",
            description: "Add each appliance protected under the listed hoods.",
            type: "repeater",
            addLabel: "Add Appliance",
            validation: [{ type: "minRows", value: 1, message: "Add at least one appliance row before finalizing." }],
            rowFields: [
              {
                id: "hoodName",
                label: "Hood",
                type: "text",
                placeholder: "Hood 1",
                prefill: [{ source: "priorField", sectionId: "appliance-coverage", fieldId: "hoodName" }]
              },
              {
                id: "appliance",
                label: "Appliance",
                type: "text",
                placeholder: "Fryer",
                prefill: [{ source: "priorField", sectionId: "appliance-coverage", fieldId: "appliance" }]
              },
              {
                id: "size",
                label: "Size",
                type: "text",
                placeholder: "36 in",
                prefill: [{ source: "priorField", sectionId: "appliance-coverage", fieldId: "size" }]
              },
              {
                id: "applianceNozzleQuantity",
                label: "Appliance Nozzle Quantity",
                type: "select",
                optionProvider: "quantityZeroToFive",
                prefill: [{ source: "priorField", sectionId: "appliance-coverage", fieldId: "applianceNozzleQuantity" }]
              },
              {
                id: "applianceNozzleType",
                label: "Appliance Nozzle Type",
                type: "text",
                placeholder: "1N or 2N",
                prefill: [{ source: "priorField", sectionId: "appliance-coverage", fieldId: "applianceNozzleType" }]
              }
            ]
          },
          {
            id: "coverageNotes",
            label: "Coverage notes",
            type: "text",
            placeholder: "Missing caps, appliance layout, or nozzle issues",
            prefill: [{ source: "priorField", sectionId: "appliance-coverage", fieldId: "coverageNotes" }]
          }
        ]
      },
      {
        id: "system-checklist",
        label: "System Checklist",
        description: "Record the core kitchen suppression system checklist results for this inspection.",
        fields: [
          { id: "allAppliancesProtected", label: "All appliances properly protected?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "allAppliancesProtected" }, { source: "reportDefault", value: "na" }] },
          { id: "ductPlenumProtected", label: "Duct & plenum properly protected?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "ductPlenumProtected" }, { source: "reportDefault", value: "na" }] },
          { id: "nozzlePositioningCorrect", label: "Positioning of all system nozzles correct?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "nozzlePositioningCorrect" }, { source: "reportDefault", value: "na" }] },
          { id: "systemInstalledPerMfgUl", label: "System installed properly per MFG & UL?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "systemInstalledPerMfgUl" }, { source: "reportDefault", value: "na" }] },
          { id: "penetrationsSealedProperly", label: "Hood and duct penetrations sealed properly?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "penetrationsSealedProperly" }, { source: "reportDefault", value: "na" }] },
          { id: "pressureGaugeInRange", label: "Pressure gauge in operating range if equipped?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "pressureGaugeInRange" }, { source: "reportDefault", value: "na" }] },
          { id: "cartridgeWeightWithinSpec", label: "Cartridge weight within specifications if equipped?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "cartridgeWeightWithinSpec" }, { source: "reportDefault", value: "na" }] },
          { id: "cylinderChemicalCondition", label: "Cylinder chemical in good condition?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "cylinderChemicalCondition" }, { source: "reportDefault", value: "na" }] },
          { id: "manualPullStationTested", label: "Operated system via manual pull station?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "manualPullStationTested" }, { source: "reportDefault", value: "na" }] },
          { id: "testLinkOperated", label: "Operated system via test link?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "testLinkOperated" }, { source: "reportDefault", value: "na" }] },
          { id: "fuelShutdownVerified", label: "Verified shutdown of equipment fuel source?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "fuelShutdownVerified" }, { source: "reportDefault", value: "na" }] },
          { id: "nozzlesCleanCapped", label: "Nozzles clean & proper caps in place?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "nozzlesCleanCapped" }, { source: "reportDefault", value: "na" }] },
          { id: "detectionLinksPlacement", label: "Proper placement of detection links?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "detectionLinksPlacement" }, { source: "reportDefault", value: "na" }] },
          { id: "fusibleLinksReplaced", label: "Replaced fusible link(s)?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "fusibleLinksReplaced" }, { source: "reportDefault", value: "na" }] },
          { id: "cableTravelChecked", label: "Checked travel of cable/s-hooks?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "cableTravelChecked" }, { source: "reportDefault", value: "na" }] },
          { id: "pipingSecured", label: "Piping/conduit tight & securely bracketed?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "pipingSecured" }, { source: "reportDefault", value: "na" }] },
          { id: "flameFryerSeparation", label: "Proper separation between flame and fryer?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "flameFryerSeparation" }, { source: "reportDefault", value: "na" }] },
          { id: "fireAlarmInterconnectWorking", label: "Fire alarm interconnection functioning?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "fireAlarmInterconnectWorking" }, { source: "reportDefault", value: "na" }] },
          { id: "gasValveTestedReset", label: "Gas valve tested & reset to operating position?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "gasValveTestedReset" }, { source: "reportDefault", value: "na" }] },
          { id: "pipingObstructionTested", label: "Piping obstruction test performed?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "pipingObstructionTested" }, { source: "reportDefault", value: "na" }] },
          { id: "filtersInstalledCorrectly", label: "Proper filters installed & in correct position?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "filtersInstalledCorrectly" }, { source: "reportDefault", value: "na" }] },
          { id: "exhaustFanOperational", label: "Exhaust fan operational and warning sign on hood?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "exhaustFanOperational" }, { source: "reportDefault", value: "na" }] },
          { id: "kClassExtinguisherPresent", label: "K-Class fire extinguisher charged & in place?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "kClassExtinguisherPresent" }, { source: "reportDefault", value: "na" }] },
          { id: "hoodCleanedPerNFPA96", label: "Hood cleaned regularly in accordance with NFPA 96?", type: "select", optionProvider: "yesNoNA", prefill: [{ source: "priorField", sectionId: "system-checklist", fieldId: "hoodCleanedPerNFPA96" }, { source: "reportDefault", value: "na" }] }
        ]
      },
      {
        id: "tank-and-service",
        label: "Agent tank and service",
        description: "Track service materials used and related maintenance notes.",
        fields: [
          {
            id: "fusibleLinksUsed",
            label: "Fusible Links Used",
            type: "repeater",
            addLabel: "Add Additional Links",
            rowFields: [
              {
                id: "temperature",
                label: "Temperature",
                type: "select",
                optionProvider: "fusible_link_temperatures_common"
              },
              {
                id: "quantity",
                label: "Quantity",
                type: "select",
                optionProvider: "quantity_0_10"
              }
            ]
          },
          {
            id: "capsUsed",
            label: "Caps Used",
            type: "repeater",
            addLabel: "Add Additional Caps",
            rowFields: [
              {
                id: "type",
                label: "Cap Type",
                type: "select",
                optionProvider: "caps_used_types"
              },
              {
                id: "quantity",
                label: "Quantity",
                type: "select",
                optionProvider: "quantity_0_10"
              }
            ]
          },
          {
            id: "cartridgesUsed",
            label: "Cartridges Used",
            type: "repeater",
            addLabel: "Add Additional Cartridges",
            rowFields: [
              {
                id: "type",
                label: "Cartridge Type",
                type: "text",
                placeholder: "PK-2 cartridge"
              },
              {
                id: "quantity",
                label: "Quantity",
                type: "select",
                optionProvider: "quantity_0_10"
              }
            ]
          },
          {
            id: "serviceNotes",
            label: "Service notes",
            type: "text",
            placeholder: "Hydro date, cartridge, fusible links, maintenance notes",
            prefill: [{ source: "priorField", sectionId: "tank-and-service", fieldId: "serviceNotes" }]
          }
        ]
      }
    ]
  },
  industrial_suppression: {
    label: "Industrial suppression",
    description: "Protected process equipment, release controls, and special-hazard suppression readiness.",
    defaultRecurrenceFrequency: RecurrenceFrequency.SEMI_ANNUAL,
    pdf: {
      subtitle: "Industrial Suppression Inspection Report",
      nfpaReferences: ["NFPA 17"]
    },
    sections: [
      {
        id: "hazard-equipment",
        label: "Protected equipment",
        description: "Document the equipment protected and hazard boundary condition.",
        fields: [
          {
            id: "protectedSystems",
            label: "Protected systems",
            description: "Track each special-hazard suppression system inspected at the site.",
            type: "repeater",
            addLabel: "Add protected system",
            repeatableSource: "siteAssets",
            rowIdentityField: "assetId",
            validation: [{ type: "minRows", value: 1, message: "Add at least one industrial suppression system before finalizing." }],
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
                      { fieldId: "location", sourceKey: "location", mode: "always" },
                      { fieldId: "protectedProcess", sourceKey: "protectedProcess", mode: "if_empty" },
                      { fieldId: "releasePanel", sourceKey: "releasePanel", mode: "if_empty" },
                      { fieldId: "shutdownDependency", sourceKey: "shutdownDependency", mode: "if_empty" },
                      { fieldId: "cylinderCount", sourceKey: "cylinderCount", mode: "if_empty" }
                    ]
                  }
                ]
              },
              {
                id: "assetTag",
                label: "Asset tag",
                type: "text",
                placeholder: "IND-301",
                prefill: [
                  { source: "asset", key: "assetTag" },
                  { source: "priorField", sectionId: "hazard-equipment", fieldId: "assetTag" }
                ]
              },
              {
                id: "location",
                label: "Location",
                type: "text",
                placeholder: "Paint booth line 2",
                prefill: [
                  { source: "assetMetadata", key: "location" },
                  { source: "priorField", sectionId: "hazard-equipment", fieldId: "location" },
                  { source: "siteDefault", key: "siteName" }
                ]
              },
              {
                id: "protectedProcess",
                label: "Protected process",
                type: "text",
                placeholder: "Paint booth line 2",
                prefill: [
                  { source: "assetMetadata", key: "protectedProcess" },
                  { source: "priorField", sectionId: "hazard-equipment", fieldId: "protectedProcess" }
                ]
              },
              {
                id: "releasePanel",
                label: "Release panel",
                type: "text",
                placeholder: "Kidde ARIES",
                prefill: [
                  { source: "assetMetadata", key: "releasePanel" },
                  { source: "priorField", sectionId: "hazard-equipment", fieldId: "releasePanel" }
                ]
              },
              {
                id: "shutdownDependency",
                label: "Shutdown dependency",
                type: "text",
                placeholder: "Conveyor stop and exhaust fan shutdown",
                prefill: [
                  { source: "assetMetadata", key: "shutdownDependency" },
                  { source: "priorField", sectionId: "hazard-equipment", fieldId: "shutdownDependency" }
                ]
              },
              {
                id: "cylinderCount",
                label: "Cylinders connected",
                type: "number",
                placeholder: "0",
                prefill: [
                  { source: "assetMetadata", key: "cylinderCount" },
                  { source: "priorField", sectionId: "hazard-equipment", fieldId: "cylinderCount" }
                ]
              }
            ]
          },
          {
            id: "systemsInspected",
            label: "Protected systems inspected",
            type: "number",
            placeholder: "0",
            calculation: { key: "assetCountFromRepeater", sourceFieldId: "protectedSystems" },
            readOnly: true
          },
          {
            id: "equipmentProtected",
            label: "Equipment protected",
            type: "text",
            placeholder: "Describe process line or hazard",
            prefill: [{ source: "priorField", sectionId: "hazard-equipment", fieldId: "equipmentProtected" }]
          },
          {
            id: "hazardBoundarySecure",
            label: "Hazard boundary secure",
            type: "boolean",
            prefill: [{ source: "priorField", sectionId: "hazard-equipment", fieldId: "hazardBoundarySecure" }]
          },
          { id: "hazardNotes", label: "Hazard notes", type: "text", placeholder: "Interlocks, enclosure condition, shutdown dependencies" }
        ]
      },
      {
        id: "release-controls",
        label: "Release controls",
        description: "Inspect manual release, abort, detection, and control logic points.",
        fields: [
          {
            id: "manualReleaseAccessible",
            label: "Manual release accessible",
            type: "boolean",
            prefill: [{ source: "priorField", sectionId: "release-controls", fieldId: "manualReleaseAccessible" }]
          },
          {
            id: "controlLogicStatus",
            label: "Control logic status",
            type: "select",
            optionProvider: "passFail",
            prefill: [{ source: "priorField", sectionId: "release-controls", fieldId: "controlLogicStatus" }]
          },
          { id: "releaseControlNotes", label: "Release control notes", type: "text", placeholder: "Abort switch, panel, detector or shutdown notes" }
        ]
      },
      {
        id: "agent-and-cylinders",
        label: "Agent supply",
        description: "Record cylinder condition, pressures, and distribution readiness.",
        fields: [
          {
            id: "cylinderCount",
            label: "Cylinders inspected",
            type: "number",
            placeholder: "0",
            calculation: {
              key: "sumNumberFieldFromRepeater",
              sourceSectionId: "hazard-equipment",
              sourceFieldId: "protectedSystems",
              rowFieldId: "cylinderCount"
            },
            readOnly: true
          },
          {
            id: "agentPressureStatus",
            label: "Agent pressure status",
            type: "select",
            optionProvider: "pressure",
            prefill: [{ source: "priorField", sectionId: "agent-and-cylinders", fieldId: "agentPressureStatus" }]
          },
          { id: "agentNotes", label: "Agent notes", type: "text", placeholder: "Weight, piping, manifold, or nozzle notes" }
        ]
      }
    ]
  },
  emergency_exit_lighting: {
    label: "Emergency exit lighting",
    description: "Exit sign visibility, unit equipment readiness, and timed illumination testing.",
    pdf: {
      subtitle: "Emergency Exit Lighting Inspection Report",
      nfpaReferences: ["NFPA 101", "NFPA 70"]
    },
    billableMappings: {
      repeaters: [
        {
          sourceSection: "fixture-inventory",
          repeater: "fixtureGroups",
          field: "location",
          category: "service",
          descriptionTemplate: "Emergency Light Annual Inspection",
          code: "EL-ANNUAL",
          unit: "ea",
          quantitySource: "constant",
          quantityConstant: 1,
          includePerRow: true,
          alwaysInclude: true,
          excludeWhenFieldValues: [
            {
              field: "newUnit",
              values: [true]
            }
          ]
        },
        {
          sourceSection: "fixture-inventory",
          repeater: "fixtureGroups",
          field: "batteryQuantity",
          category: "material",
          descriptionTemplate: "Emergency light battery ({{billingBatterySize}}) - {{fixtureType}} at {{location}}",
          code: "EL-BATTERY",
          unit: "ea",
          quantitySource: "fieldValue",
          includeWhenGreaterThanZero: true
        },
        {
          sourceSection: "fixture-inventory",
          repeater: "fixtureGroups",
          field: "newUnit",
          category: "material",
          descriptionTemplate: "New emergency light unit - {{fixtureType}} at {{location}}",
          code: "EL-NEW-UNIT",
          unit: "ea",
          quantitySource: "constant",
          quantityConstant: 1,
          includeWhenTruthy: true
        }
      ]
    },
    sections: [
      {
        id: "fixture-inventory",
        label: "Fixture inventory",
        description: "Capture count, placement, and visibility of egress fixtures.",
        fields: [
          {
            id: "fixtureGroups",
            label: "Fixture groups",
            description: "Track each emergency or exit-lighting group inspected at the site.",
            type: "repeater",
            addLabel: "Add fixture group",
            repeatableSource: "siteAssets",
            rowIdentityField: "assetId",
            validation: [{ type: "minRows", value: 1, message: "Add at least one emergency lighting fixture group before finalizing." }],
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
                      { fieldId: "location", sourceKey: "location", mode: "always" },
                      { fieldId: "fixtureType", sourceKey: "fixtureType", mode: "if_empty" },
                      { fieldId: "batterySize", sourceKey: "batterySize", mode: "if_empty" },
                      { fieldId: "batterySize", sourceKey: "batteryType", mode: "if_empty" }
                    ]
                  }
                ]
              },
              {
                id: "assetTag",
                label: "Asset tag",
                type: "text",
                hidden: true,
                placeholder: "EEL-302",
                prefill: [
                  { source: "asset", key: "assetTag" },
                  { source: "priorField", sectionId: "fixture-inventory", fieldId: "assetTag" }
                ]
              },
              {
                id: "location",
                label: "Location",
                type: "text",
                placeholder: "Warehouse aisles A-C",
                prefill: [
                  { source: "assetMetadata", key: "location" },
                  { source: "priorField", sectionId: "fixture-inventory", fieldId: "location" },
                  { source: "siteDefault", key: "siteName" }
                ],
                validation: [{ type: "required", message: "Each emergency light row requires a location before finalizing." }]
              },
              {
                id: "fixtureType",
                label: "Type",
                type: "select",
                optionProvider: "emergency_light_types",
                legacyValueMap: {
                  "Combo exit/emergency unit": "Combo Exit / Emergency",
                  "Remote head unit": "Remote Head Unit",
                  "Emergency light": "Emergency Light",
                  "Exit sign": "Exit Sign"
                },
                prefill: [
                  { source: "assetMetadata", key: "fixtureType" },
                  { source: "priorField", sectionId: "fixture-inventory", fieldId: "fixtureType" }
                ],
                validation: [{ type: "required", message: "Each emergency light row requires a type before finalizing." }]
              },
              {
                id: "status",
                label: "Status",
                type: "select",
                optionProvider: "pass_fail",
                prefill: [
                  { source: "priorField", sectionId: "fixture-inventory", fieldId: "status" },
                  { source: "reportDefault", value: "pass" }
                ]
              },
              {
                id: "batteryQuantity",
                label: "Battery Quantity",
                type: "select",
                optionProvider: "quantity_0_10",
                prefill: [
                  { source: "assetMetadata", key: "batteryQuantity" },
                  { source: "priorField", sectionId: "fixture-inventory", fieldId: "batteryQuantity" }
                ]
              },
              {
                id: "batterySize",
                label: "Battery Size",
                type: "select",
                optionProvider: "emergency_light_battery_sizes",
                customValueFieldId: "batterySizeOther",
                customValueTrigger: "other",
                legacyValueMap: {
                  "Nickel cadmium": "NiCad",
                  NiCd: "NiCad"
                },
                prefill: [
                  { source: "assetMetadata", key: "batterySize" },
                  { source: "assetMetadata", key: "batteryType" },
                  { source: "priorFirstField", sectionId: "fixture-inventory", fieldIds: ["batterySize", "batteryType"] },
                  { source: "priorAnyField", sectionId: "fixture-inventory", fieldIds: ["batterySizeOther", "batteryTypeOther"], value: "other" }
                ]
              },
              {
                id: "batterySizeOther",
                label: "Other Battery Size",
                type: "text",
                placeholder: "Custom battery size",
                visibleWhen: { fieldId: "batterySize", values: ["other"] },
                prefill: [
                  { source: "priorFirstField", sectionId: "fixture-inventory", fieldIds: ["batterySizeOther", "batteryTypeOther", "batteryType"] }
                ]
              },
              {
                id: "billingBatterySize",
                label: "Billing Battery Size",
                type: "text",
                hidden: true,
                readOnly: true,
                calculation: {
                  key: "firstNonEmptyValue",
                  sourceFieldIds: ["batterySizeOther", "batterySize"]
                }
              },
              {
                id: "newUnit",
                label: "New Unit",
                type: "boolean",
                prefill: [
                  { source: "priorField", sectionId: "fixture-inventory", fieldId: "newUnit" },
                  { source: "reportDefault", value: false }
                ]
              },
              {
                id: "batteriesReplaced",
                label: "Batteries Replaced",
                type: "boolean",
                prefill: [
                  { source: "priorField", sectionId: "fixture-inventory", fieldId: "batteriesReplaced" },
                  { source: "reportDefault", value: false }
                ]
              },
              {
                id: "testDuration",
                label: "Test Duration",
                type: "select",
                optionProvider: "emergency_light_test_durations",
                normalizeEmptyToDefault: true,
                legacyValueMap: {
                  "30 Second": "30_second",
                  "90 Minute": "90_minute"
                },
                prefill: [
                  { source: "priorField", sectionId: "fixture-inventory", fieldId: "testDuration" },
                  { source: "reportDefault", value: "30_second" }
                ]
              },
              {
                id: "notes",
                label: "Notes",
                type: "text",
                placeholder: "Lens, charging, aiming, or unit notes",
                prefill: [
                  { source: "priorField", sectionId: "fixture-inventory", fieldId: "notes" }
                ]
              }
            ]
          },
          {
            id: "systemsInspected",
            label: "Fixture groups inspected",
            type: "number",
            placeholder: "0",
            calculation: { key: "assetCountFromRepeater", sourceFieldId: "fixtureGroups" },
            readOnly: true
          },
          {
            id: "fixturesInspected",
            label: "Fixtures inspected",
            type: "number",
            placeholder: "0",
            calculation: { key: "assetCountFromRepeater", sourceFieldId: "fixtureGroups" },
            readOnly: true
          },
          {
            id: "visibilityStatus",
            label: "Visibility status",
            type: "select",
            optionProvider: "passFail",
            prefill: [{ source: "priorField", sectionId: "fixture-inventory", fieldId: "visibilityStatus" }]
          },
          { id: "inventoryNotes", label: "Inventory notes", type: "text", placeholder: "Obstructions, damaged lenses, missing fixtures" }
        ]
      }
    ]
  }
};

export function getDefaultInspectionRecurrenceFrequency(inspectionType: InspectionType) {
  return inspectionTypeRegistry[inspectionType].defaultRecurrenceFrequency ?? RecurrenceFrequency.ANNUAL;
}
