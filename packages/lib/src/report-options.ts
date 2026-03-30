import type { ReportAssetRecord, ReportOption, ReportPrimitiveValue } from "./report-config";
import { wetSprinklerRequirementProfiles } from "./report-requirements";

export type ReportOptionProviderKey =
  | "passFail"
  | "pass_fail"
  | "passFailNA"
  | "passFailDeficiency"
  | "yesNoNA"
  | "normalLowHighNA"
  | "pressure"
  | "extinguisherManufacturers"
  | "extinguisherUlRatings"
  | "extinguisherSizeTypes"
  | "extinguisher_types"
  | "extinguisherServiceTypes"
  | "extinguisher_service_performed"
  | "extinguisherStatus"
  | "backflowAssemblyTypes"
  | "alarmDeviceTypes"
  | "alarmNotificationApplianceTypes"
  | "communicationPathTypes"
  | "fireAlarmBatterySizes"
  | "quantity_0_10"
  | "quantityZeroToTen"
  | "quantity_0_5"
  | "quantityZeroToFive"
  | "quantityZeroToTwenty"
  | "quantityZeroToHundred"
  | "fusible_link_temperatures_common"
  | "caps_used_types"
  | "kitchen_suppression_manufacturers"
  | "emergency_light_types"
  | "emergency_light_battery_sizes"
  | "emergency_light_test_durations"
  | "deficiencySeverityOptions"
  | "deficiencyStatusOptions"
  | "panelConditionOptions"
  | "deviceFunctionalResultOptions"
  | "physicalConditionOptions"
  | "fireAlarmOverallStatusOptions"
  | "sprinklerComponentTypes"
  | "wetSprinklerRequirementProfiles"
  | "wetSprinklerVisitScopeOptions"
  | "wetSprinklerOverallResultOptions"
  | "assetSelect";

const passFailOptions: ReportOption[] = [
  { label: "Pass", value: "pass" },
  { label: "Attention", value: "attention" },
  { label: "Fail", value: "fail" }
];

const passFailStrictOptions: ReportOption[] = [
  { label: "Pass", value: "pass" },
  { label: "Fail", value: "fail" }
];

const passFailNAOptions: ReportOption[] = [
  { label: "Pass", value: "pass" },
  { label: "Fail", value: "fail" },
  { label: "N/A", value: "na" }
];

const passFailDeficiencyOptions: ReportOption[] = [
  { label: "Pass", value: "pass" },
  { label: "Fail", value: "fail" },
  { label: "Deficiency", value: "deficiency" },
  { label: "N/A", value: "na" }
];

const yesNoNAOptions: ReportOption[] = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
  { label: "N/A", value: "na" }
];

const normalLowHighNAOptions: ReportOption[] = [
  { label: "Normal", value: "normal" },
  { label: "Low", value: "low" },
  { label: "High", value: "high" },
  { label: "N/A", value: "na" }
];

const pressureOptions: ReportOption[] = [
  { label: "Stable", value: "stable" },
  { label: "Low", value: "low" },
  { label: "High", value: "high" }
];

const extinguisherManufacturers: ReportOption[] = [
  { label: "Amerex", value: "amerex" },
  { label: "Ansul", value: "ansul" },
  { label: "Badger", value: "badger" },
  { label: "Buckeye", value: "buckeye" },
  { label: "Kidde", value: "kidde" },
  { label: "Pyro-Chem", value: "pyro_chem" }
];

const extinguisherUlRatings: ReportOption[] = [
  { label: "1-A:10-B:C", value: "1-A:10-B:C" },
  { label: "2-A", value: "2-A" },
  { label: "3-A:40-B:C", value: "3-A:40-B:C" },
  { label: "4-A:80-B:C", value: "4-A:80-B:C" },
  { label: "5-B:C", value: "5-B:C" },
  { label: "10-A:120-B:C", value: "10-A:120-B:C" },
  { label: "10-B:C", value: "10-B:C" },
  { label: "20-B:C", value: "20-B:C" },
  { label: "K", value: "K" }
];

const extinguisherTypes: ReportOption[] = [
  { label: "2.5 lb ABC", value: "2.5 lb ABC", metadata: { ulRating: "1-A:10-B:C" } },
  { label: "5 lb ABC", value: "5 lb ABC", metadata: { ulRating: "3-A:40-B:C" } },
  { label: "10 lb ABC", value: "10 lb ABC", metadata: { ulRating: "4-A:80-B:C" } },
  { label: "20 lb ABC", value: "20 lb ABC", metadata: { ulRating: "10-A:120-B:C" } },
  { label: "5 lb CO2", value: "5 lb CO2", metadata: { ulRating: "5-B:C" } },
  { label: "10 lb CO2", value: "10 lb CO2", metadata: { ulRating: "10-B:C" } },
  { label: "15 lb CO2", value: "15 lb CO2", metadata: { ulRating: "10-B:C" } },
  { label: "20 lb CO2", value: "20 lb CO2", metadata: { ulRating: "20-B:C" } },
  { label: "1.5 gal Water", value: "1.5 gal Water", metadata: { ulRating: "2-A" } },
  { label: "2.5 gal Water", value: "2.5 gal Water", metadata: { ulRating: "2-A" } },
  { label: "6L Wet Chemical", value: "6L Wet Chemical", metadata: { ulRating: "K" } },
  { label: "Class K", value: "Class K", metadata: { ulRating: "K" } },
  { label: "Other", value: "other" }
];

const extinguisherServicePerformedOptions: ReportOption[] = [
  { label: "New", value: "New" },
  { label: "Annual Inspection", value: "Annual Inspection" },
  { label: "Maintenance", value: "Maintenance" },
  { label: "6-Year Maintenance", value: "6-Year Maintenance" },
  { label: "Hydro Test", value: "Hydro Test" },
  { label: "Recharge", value: "Recharge" },
  { label: "Repair", value: "Repair" },
  { label: "Removed from Service", value: "Removed from Service" },
  { label: "Other", value: "other" }
];

const extinguisherStatus: ReportOption[] = [
  { label: "Current", value: "current" },
  { label: "Due soon", value: "due_soon" },
  { label: "Overdue", value: "overdue" }
];

const backflowAssemblyTypes: ReportOption[] = [
  { label: "RPZ", value: "rpz" },
  { label: "DCDA", value: "dcda" },
  { label: "PVB", value: "pvb" },
  { label: "SVB", value: "svb" },
  { label: "Double check", value: "double_check" }
];

const alarmDeviceTypes: ReportOption[] = [
  { label: "Control panel", value: "control_panel" },
  { label: "Smoke detector", value: "smoke_detector" },
  { label: "Heat detector", value: "heat_detector" },
  { label: "Pull station", value: "pull_station" },
  { label: "Duct detector", value: "duct_detector" },
  { label: "Monitor module", value: "monitor_module" },
  { label: "Waterflow switch", value: "waterflow_switch" },
  { label: "Tamper switch", value: "tamper_switch" },
  { label: "Beam detector", value: "beam_detector" }
];

const alarmNotificationApplianceTypes: ReportOption[] = [
  { label: "Horn", value: "horn" },
  { label: "Strobe", value: "strobe" },
  { label: "Horn/strobe", value: "horn_strobe" },
  { label: "Speaker", value: "speaker" },
  { label: "Speaker/strobe", value: "speaker_strobe" },
  { label: "Bell", value: "bell" },
  { label: "Chime", value: "chime" },
  { label: "Other", value: "other" }
];

const communicationPathTypes: ReportOption[] = [
  { label: "IP", value: "ip" },
  { label: "Cellular", value: "cellular" },
  { label: "Phone", value: "phone" },
  { label: "Radio", value: "radio" },
  { label: "Dual path", value: "dual_path" },
  { label: "Other", value: "other" }
];

const fireAlarmBatterySizes: ReportOption[] = [
  { label: "12V 7AH", value: "12v_7ah" },
  { label: "12V 8AH", value: "12v_8ah" },
  { label: "12V 12AH", value: "12v_12ah" },
  { label: "12V 18AH", value: "12v_18ah" },
  { label: "12V 26AH", value: "12v_26ah" },
  { label: "12V 33AH", value: "12v_33ah" },
  { label: "12V 55AH", value: "12v_55ah" },
  { label: "Other", value: "other" }
];

const quantityZeroToTwenty: ReportOption[] = Array.from({ length: 21 }, (_, index) => ({ label: String(index), value: String(index) }));
const quantityZeroToTen: ReportOption[] = Array.from({ length: 11 }, (_, index) => ({ label: String(index), value: String(index) }));
const quantityZeroToFive: ReportOption[] = Array.from({ length: 6 }, (_, index) => ({ label: String(index), value: String(index) }));
const fusibleLinkTemperaturesCommon: ReportOption[] = [
  { label: "165°F", value: "165°F" },
  { label: "212°F", value: "212°F" },
  { label: "280°F", value: "280°F" },
  { label: "286°F", value: "286°F" },
  { label: "360°F", value: "360°F" },
  { label: "450°F", value: "450°F" },
  { label: "500°F", value: "500°F" }
];
const capsUsedTypes: ReportOption[] = [
  { label: "Rubber", value: "Rubber" },
  { label: "Metal", value: "Metal" }
];
const kitchenSuppressionManufacturers: ReportOption[] = [
  { label: "Ansul", value: "Ansul" },
  { label: "Amerex", value: "Amerex" },
  { label: "Range Guard", value: "Range Guard" },
  { label: "Badger", value: "Badger" },
  { label: "Kidde", value: "Kidde" },
  { label: "Pyro-Chem", value: "Pyro-Chem" },
  { label: "ProTex", value: "ProTex" },
  { label: "Buckeye", value: "Buckeye" },
  { label: "Guardian", value: "Guardian" },
  { label: "Denlar", value: "Denlar" },
  { label: "Greenheck", value: "Greenheck" },
  { label: "CaptiveAire", value: "CaptiveAire" },
  { label: "Other", value: "other" }
];
const emergencyLightTypes: ReportOption[] = [
  { label: "Emergency Light", value: "Emergency Light" },
  { label: "Exit Sign", value: "Exit Sign" },
  { label: "Combo Exit / Emergency", value: "Combo Exit / Emergency" },
  { label: "Remote Head Unit", value: "Remote Head Unit" },
  { label: "Other", value: "Other" }
];
const emergencyLightBatterySizes: ReportOption[] = [
  { label: "NiCad", value: "NiCad" },
  { label: "6V4.5AH", value: "6V4.5AH" },
  { label: "6V10AH", value: "6V10AH" },
  { label: "12V18AH", value: "12V18AH" },
  { label: "Other", value: "other" }
];
const emergencyLightTestDurations: ReportOption[] = [
  { label: "30 Second", value: "30_second" },
  { label: "90 Minute", value: "90_minute" }
];

const quantityZeroToHundred: ReportOption[] = [
  ...Array.from({ length: 101 }, (_, index) => ({ label: String(index), value: String(index) })),
  { label: "Other", value: "other" }
];

const deficiencySeverityOptions: ReportOption[] = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Critical", value: "critical" }
];

const deficiencyStatusOptions: ReportOption[] = [
  { label: "Open", value: "open" },
  { label: "Quoted", value: "quoted" },
  { label: "Approved", value: "approved" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Resolved", value: "resolved" },
  { label: "Ignored", value: "ignored" }
];

const panelConditionOptions: ReportOption[] = [
  { label: "Good", value: "good" },
  { label: "Attention needed", value: "attention" },
  { label: "Deficiency", value: "deficiency" },
  { label: "N/A", value: "na" }
];

const deviceFunctionalResultOptions: ReportOption[] = [
  { label: "Pass", value: "pass" },
  { label: "Fail", value: "fail" },
  { label: "Deficiency", value: "deficiency" },
  { label: "Limited test", value: "limited_test" },
  { label: "N/A", value: "na" }
];

const physicalConditionOptions: ReportOption[] = [
  { label: "Good", value: "good" },
  { label: "Needs attention", value: "attention" },
  { label: "Deficiency", value: "deficiency" },
  { label: "Damaged", value: "damaged" },
  { label: "N/A", value: "na" }
];

const fireAlarmOverallStatusOptions: ReportOption[] = [
  { label: "Pass", value: "pass" },
  { label: "Pass with deficiencies", value: "pass_with_deficiencies" },
  { label: "Fail", value: "fail" },
  { label: "Further review required", value: "further_review_required" }
];

const sprinklerComponentTypes: ReportOption[] = [
  { label: "Riser", value: "riser" },
  { label: "Control valve", value: "control_valve" },
  { label: "Flow switch", value: "flow_switch" },
  { label: "Tamper switch", value: "tamper_switch" },
  { label: "Alarm gong", value: "alarm_gong" }
];

const wetSprinklerRequirementProfileOptions: ReportOption[] = wetSprinklerRequirementProfiles.map((profile) => ({
  label: profile.label,
  value: profile.key,
  metadata: {
    editionLabel: profile.editionLabel,
    description: profile.description
  }
}));

const wetSprinklerVisitScopeOptions: ReportOption[] = [
  { label: "Weekly visit", value: "weekly" },
  { label: "Monthly visit", value: "monthly" },
  { label: "Quarterly visit", value: "quarterly" },
  { label: "Combined visit", value: "combined" }
];

const wetSprinklerOverallResultOptions: ReportOption[] = [
  { label: "Pass", value: "pass" },
  { label: "Pass with deficiencies", value: "pass_with_deficiencies" },
  { label: "Impairment noted", value: "impairment_noted" },
  { label: "Out of service", value: "out_of_service" },
  { label: "Follow-up required", value: "follow_up_required" }
];

export const reportOptionProviders = {
  passFail: passFailOptions,
  pass_fail: passFailStrictOptions,
  passFailNA: passFailNAOptions,
  passFailDeficiency: passFailDeficiencyOptions,
  yesNoNA: yesNoNAOptions,
  normalLowHighNA: normalLowHighNAOptions,
  pressure: pressureOptions,
  extinguisherManufacturers,
  extinguisherUlRatings,
  extinguisherSizeTypes: extinguisherTypes,
  extinguisher_types: extinguisherTypes,
  extinguisherServiceTypes: extinguisherServicePerformedOptions,
  extinguisher_service_performed: extinguisherServicePerformedOptions,
  extinguisherStatus,
  backflowAssemblyTypes,
  alarmDeviceTypes,
  alarmNotificationApplianceTypes,
  communicationPathTypes,
  fireAlarmBatterySizes,
  quantity_0_10: quantityZeroToTen,
  quantityZeroToTen,
  quantity_0_5: quantityZeroToFive,
  quantityZeroToFive,
  quantityZeroToTwenty,
  quantityZeroToHundred,
  fusible_link_temperatures_common: fusibleLinkTemperaturesCommon,
  caps_used_types: capsUsedTypes,
  kitchen_suppression_manufacturers: kitchenSuppressionManufacturers,
  emergency_light_types: emergencyLightTypes,
  emergency_light_battery_sizes: emergencyLightBatterySizes,
  emergency_light_test_durations: emergencyLightTestDurations,
  deficiencySeverityOptions,
  deficiencyStatusOptions,
  panelConditionOptions,
  deviceFunctionalResultOptions,
  physicalConditionOptions,
  fireAlarmOverallStatusOptions,
  sprinklerComponentTypes,
  wetSprinklerRequirementProfiles: wetSprinklerRequirementProfileOptions,
  wetSprinklerVisitScopeOptions,
  wetSprinklerOverallResultOptions
} satisfies Record<Exclude<ReportOptionProviderKey, "assetSelect">, ReportOption[]>;

function coerceMetadata(value: unknown): ReportPrimitiveValue {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return null;
}

export function buildAssetOptions(assets: ReportAssetRecord[]) {
  return assets.map((asset) => {
    const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata as Record<string, unknown> : {};
    const location = coerceMetadata(metadata.location);
    return {
      label: typeof location === "string" && location.trim().length > 0 ? `${asset.name} - ${location}` : asset.name,
      value: asset.id,
      metadata: {
        assetId: asset.id,
        assetName: asset.name,
        assetTag: asset.assetTag,
        location: coerceMetadata(metadata.location),
        alarmRole: coerceMetadata(metadata.alarmRole),
        panelName: coerceMetadata(metadata.panelName),
        model: coerceMetadata(metadata.model),
        batteryConfiguration: coerceMetadata(metadata.batteryConfiguration),
        batterySize: coerceMetadata(metadata.batterySize),
        batteryQuantity: coerceMetadata(metadata.batteryQuantity),
        assemblyType: coerceMetadata(metadata.assemblyType),
        sizeInches: coerceMetadata(metadata.sizeInches),
        serialNumber: coerceMetadata(metadata.serialNumber),
        controller: coerceMetadata(metadata.controller),
        driverType: coerceMetadata(metadata.driverType),
        panelModel: coerceMetadata(metadata.panelModel),
        deviceType: coerceMetadata(metadata.deviceType),
        applianceType: coerceMetadata(metadata.applianceType),
        quantity: coerceMetadata(metadata.quantity),
        applianceQuantity: coerceMetadata(metadata.applianceQuantity),
        candelaOrType: coerceMetadata(metadata.candelaOrType),
        communicationPathType: coerceMetadata(metadata.communicationPathType),
        componentType: coerceMetadata(metadata.componentType),
        valveCount: coerceMetadata(metadata.valveCount),
        valveType: coerceMetadata(metadata.valveType),
        compressorType: coerceMetadata(metadata.compressorType),
        quickOpeningDevice: coerceMetadata(metadata.quickOpeningDevice),
        drainCount: coerceMetadata(metadata.drainCount),
        protectedArea: coerceMetadata(metadata.protectedArea),
        pullStationLocation: coerceMetadata(metadata.pullStationLocation),
        tankType: coerceMetadata(metadata.tankType),
        applianceCount: coerceMetadata(metadata.applianceCount),
        protectedProcess: coerceMetadata(metadata.protectedProcess),
        releasePanel: coerceMetadata(metadata.releasePanel),
        shutdownDependency: coerceMetadata(metadata.shutdownDependency),
        cylinderCount: coerceMetadata(metadata.cylinderCount),
        fixtureArea: coerceMetadata(metadata.fixtureArea),
        fixtureType: coerceMetadata(metadata.fixtureType),
        batteryType: coerceMetadata(metadata.batteryType),
        fixtureCount: coerceMetadata(metadata.fixtureCount),
        manufacturer: coerceMetadata(metadata.manufacturer),
        ulRating: coerceMetadata(metadata.ulRating),
        sizeType: coerceMetadata(metadata.sizeType),
        serviceType: coerceMetadata(metadata.serviceType),
        extinguisherType: coerceMetadata(metadata.extinguisherType),
        manufactureDate: coerceMetadata(metadata.manufactureDate),
        lastHydroDate: coerceMetadata(metadata.lastHydroDate),
        lastSixYearDate: coerceMetadata(metadata.lastSixYearDate)
      }
    } satisfies ReportOption;
  });
}

export function resolveOptionProvider(provider: ReportOptionProviderKey, assets: ReportAssetRecord[] = []) {
  if (provider === "assetSelect") {
    return buildAssetOptions(assets);
  }

  return reportOptionProviders[provider] ?? [];
}
