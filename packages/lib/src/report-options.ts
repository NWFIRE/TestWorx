import type { ReportAssetRecord, ReportOption, ReportPrimitiveValue } from "./report-config";
import { backflowRequirementProfiles, jointCommissionSprinklerRequirementProfiles, wetSprinklerRequirementProfiles } from "./report-requirements";

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
  | "backflowRequirementProfiles"
  | "backflowManufacturers"
  | "backflowInspectionTypeOptions"
  | "backflowTagStatusOptions"
  | "backflowCodeEditionOptions"
  | "backflowSystemServedOptions"
  | "backflowSprinklerSystemTypeOptions"
  | "backflowWaterSupplyTypeOptions"
  | "backflowOccupancyTypeOptions"
  | "backflowSystemStatusOptions"
  | "backflowMonitoringStatusOptions"
  | "backflowAssemblySizeOptions"
  | "backflowOrientationOptions"
  | "backflowDetectorMeterOptions"
  | "backflowFireLineTypeOptions"
  | "backflowTestReasonOptions"
  | "backflowStatusOptions"
  | "backflowConditionOptions"
  | "backflowTestPerformedOptions"
  | "backflowInitialTestResultOptions"
  | "backflowReliefDischargeOptions"
  | "backflowYesNoOptions"
  | "backflowYesNoNAOptions"
  | "backflowUnknownYesNoOptions"
  | "backflowDeficiencyCategoryOptions"
  | "backflowSeverityOptions"
  | "backflowRecommendationOptions"
  | "backflowRepairPriorityOptions"
  | "backflowSystemLeftInServiceOptions"
  | "backflowFireWatchOptions"
  | "backflowRepairsPerformedOptions"
  | "backflowPhotoCategoryOptions"
  | "backflowFinalResultOptions"
  | "backflowFollowUpRecommendationOptions"
  | "jointCommissionSprinklerRequirementProfiles"
  | "jointCommissionInspectionTypeOptions"
  | "jointCommissionCodeEditionOptions"
  | "jointCommissionOccupancyOptions"
  | "jointCommissionImpairmentStatusOptions"
  | "jointCommissionMonitoringStatusOptions"
  | "jointCommissionSystemTypeOptions"
  | "jointCommissionWaterSupplyTypeOptions"
  | "jointCommissionRiserTypeOptions"
  | "jointCommissionTagStatusOptions"
  | "jointCommissionAlarmValveTypeOptions"
  | "jointCommissionSurveySensitivityOptions"
  | "jointCommissionInspectionModeOptions"
  | "jointCommissionStatusOptions"
  | "jointCommissionSeverityOptions"
  | "jointCommissionValveStateOptions"
  | "jointCommissionRecommendationOptions"
  | "jointCommissionRequiredTimelineOptions"
  | "jointCommissionOverallResultOptions"
  | "jointCommissionPhotoCategoryOptions"
  | "alarmDeviceTypes"
  | "alarmNotificationApplianceTypes"
  | "communicationPathTypes"
  | "workOrderJobsiteHours"
  | "workOrderPartsEquipmentOptions"
  | "workOrderServiceOptions"
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
  | "wetSprinklerServiceTypeOptions"
  | "wetSprinklerTagStatusOptions"
  | "wetSprinklerOverallResultOptions"
  | "sprinklerAlarmValveTypes"
  | "sprinklerHeadTypes"
  | "sprinklerHeadEscutcheonOptions"
  | "sprinklerHeadSizeOptions"
  | "sprinklerHeadTemperatureOptions"
  | "sprinklerHeadBulbConditionOptions"
  | "sprinklerManufacturers"
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
  { label: "RPZ", value: "rpz", metadata: { workflow: "RP workflow" } },
  { label: "DCDA", value: "dcda", metadata: { workflow: "DC workflow" } },
  { label: "DCVA", value: "dcva", metadata: { workflow: "DC workflow" } },
  { label: "RPDA", value: "rpda", metadata: { workflow: "RP workflow" } },
  { label: "RPZA", value: "rpza", metadata: { workflow: "RP workflow" } },
  { label: "Detector check", value: "detector_check", metadata: { workflow: "Detector check workflow" } },
  { label: "PVB", value: "pvb", metadata: { workflow: "Other backflow workflow" } },
  { label: "SVB", value: "svb", metadata: { workflow: "Other backflow workflow" } },
  { label: "Double check", value: "double_check", metadata: { workflow: "DC workflow" } },
  { label: "Reduced pressure", value: "reduced_pressure", metadata: { workflow: "RP workflow" } },
  { label: "Other", value: "other", metadata: { workflow: "Custom workflow" } }
];

const backflowRequirementProfileOptions: ReportOption[] = backflowRequirementProfiles.map((profile) => ({
  label: profile.label,
  value: profile.key,
  metadata: {
    editionLabel: profile.editionLabel,
    description: profile.description
  }
}));

const backflowManufacturers: ReportOption[] = [
  { label: "Ames", value: "ames" },
  { label: "Apollo", value: "apollo" },
  { label: "Cla-Val", value: "cla_val" },
  { label: "Conbraco", value: "conbraco" },
  { label: "Febco", value: "febco" },
  { label: "Watts", value: "watts" },
  { label: "Wilkins", value: "wilkins" },
  { label: "Other", value: "other" }
];

const backflowInspectionTypeOptions: ReportOption[] = [
  { label: "Annual test", value: "annual_test" },
  { label: "Initial acceptance support", value: "initial_acceptance_support" },
  { label: "Re-test", value: "re_test" },
  { label: "Deficiency follow-up", value: "deficiency_follow_up" },
  { label: "Repair verification", value: "repair_verification" },
  { label: "Inspection only", value: "inspection_only" },
  { label: "Other", value: "other" }
];

const backflowTagStatusOptions: ReportOption[] = [
  { label: "New tag installed", value: "new_tag_installed" },
  { label: "Existing tag updated", value: "existing_tag_updated" },
  { label: "No tag installed", value: "no_tag_installed" },
  { label: "Tag missing", value: "tag_missing" },
  { label: "Tag not applicable", value: "tag_not_applicable" }
];

const backflowCodeEditionOptions: ReportOption[] = [
  { label: "NFPA 25 2026", value: "nfpa25_2026" },
  { label: "NFPA 25 2023", value: "nfpa25_2023" },
  { label: "NFPA 25 2020", value: "nfpa25_2020" },
  { label: "NFPA 25 2017", value: "nfpa25_2017" },
  { label: "AHJ-specific requirement set", value: "ahj_specific" },
  { label: "Other", value: "other" }
];

const backflowSystemServedOptions: ReportOption[] = [
  { label: "Fire sprinkler system", value: "fire_sprinkler_system" },
  { label: "Standpipe system", value: "standpipe_system" },
  { label: "Combined fire sprinkler / standpipe", value: "combined_fire_sprinkler_standpipe" },
  { label: "Combined fire / domestic", value: "combined_fire_domestic" },
  { label: "Private fire service main", value: "private_fire_service_main" },
  { label: "Other", value: "other" }
];

const backflowSprinklerSystemTypeOptions: ReportOption[] = [
  { label: "Wet pipe", value: "wet_pipe" },
  { label: "Dry pipe", value: "dry_pipe" },
  { label: "Preaction", value: "preaction" },
  { label: "Deluge", value: "deluge" },
  { label: "Antifreeze", value: "antifreeze" },
  { label: "Mixed / multiple", value: "mixed_multiple" },
  { label: "Not applicable", value: "not_applicable" }
];

const backflowWaterSupplyTypeOptions: ReportOption[] = [
  { label: "Municipal", value: "municipal" },
  { label: "Private main", value: "private_main" },
  { label: "Tank supplied", value: "tank_supplied" },
  { label: "Pump supplied", value: "pump_supplied" },
  { label: "Combined sources", value: "combined_sources" },
  { label: "Other", value: "other" }
];

const backflowOccupancyTypeOptions: ReportOption[] = [
  { label: "Office", value: "office" },
  { label: "Retail", value: "retail" },
  { label: "Industrial", value: "industrial" },
  { label: "Warehouse", value: "warehouse" },
  { label: "Multifamily", value: "multifamily" },
  { label: "Healthcare", value: "healthcare" },
  { label: "Educational", value: "educational" },
  { label: "Mixed use", value: "mixed_use" },
  { label: "Other", value: "other" }
];

const backflowSystemStatusOptions: ReportOption[] = [
  { label: "In service", value: "in_service" },
  { label: "Out of service", value: "out_of_service" },
  { label: "Partially impaired", value: "partially_impaired" },
  { label: "Fully impaired", value: "fully_impaired" }
];

const backflowMonitoringStatusOptions: ReportOption[] = [
  { label: "Monitored", value: "monitored" },
  { label: "Not monitored", value: "not_monitored" },
  { label: "Supervisory only", value: "supervisory_only" },
  { label: "Unknown", value: "unknown" }
];

const backflowAssemblySizeOptions: ReportOption[] = [
  { label: "3/4 in", value: "0.75" },
  { label: "1 in", value: "1" },
  { label: "1 1/4 in", value: "1.25" },
  { label: "1 1/2 in", value: "1.5" },
  { label: "2 in", value: "2" },
  { label: "2 1/2 in", value: "2.5" },
  { label: "3 in", value: "3" },
  { label: "4 in", value: "4" },
  { label: "6 in", value: "6" },
  { label: "8 in", value: "8" },
  { label: "10 in", value: "10" },
  { label: "12 in", value: "12" },
  { label: "Other", value: "other" }
];

const backflowOrientationOptions: ReportOption[] = [
  { label: "Horizontal", value: "horizontal" },
  { label: "Vertical", value: "vertical" },
  { label: "Unknown", value: "unknown" },
  { label: "Other", value: "other" }
];

const backflowDetectorMeterOptions: ReportOption[] = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
  { label: "Not applicable", value: "not_applicable" }
];

const backflowFireLineTypeOptions: ReportOption[] = [
  { label: "Dedicated fire line", value: "dedicated_fire_line" },
  { label: "Combined fire / domestic", value: "combined_fire_domestic" },
  { label: "Detector line", value: "detector_line" },
  { label: "Other", value: "other" }
];

const backflowTestReasonOptions: ReportOption[] = [
  { label: "Scheduled annual test", value: "scheduled_annual_test" },
  { label: "New install / acceptance support", value: "new_install_acceptance_support" },
  { label: "Re-test after failure", value: "re_test_after_failure" },
  { label: "Post-repair verification", value: "post_repair_verification" },
  { label: "Complaint / service call", value: "complaint_service_call" },
  { label: "AHJ request", value: "ahj_request" },
  { label: "Other", value: "other" }
];

const backflowStatusOptions: ReportOption[] = [
  { label: "Pass", value: "pass" },
  { label: "Fail", value: "fail" },
  { label: "N/A", value: "na" }
];

const backflowConditionOptions: ReportOption[] = [
  { label: "Good", value: "good" },
  { label: "Fair", value: "fair" },
  { label: "Poor", value: "poor" }
];

const backflowTestPerformedOptions: ReportOption[] = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
  { label: "Partial", value: "partial" },
  { label: "Could not complete", value: "could_not_complete" }
];

const backflowInitialTestResultOptions: ReportOption[] = [
  { label: "Pass", value: "pass" },
  { label: "Fail", value: "fail" },
  { label: "Unable to complete", value: "unable_to_complete" },
  { label: "Not tested", value: "not_tested" }
];

const backflowReliefDischargeOptions: ReportOption[] = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
  { label: "Intermittent", value: "intermittent" },
  { label: "N/A", value: "na" }
];

const backflowYesNoOptions: ReportOption[] = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" }
];

const backflowYesNoNAOptions: ReportOption[] = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
  { label: "Not applicable", value: "not_applicable" }
];

const backflowUnknownYesNoOptions: ReportOption[] = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
  { label: "Unknown", value: "unknown" }
];

const backflowDeficiencyCategoryOptions: ReportOption[] = [
  { label: "Leakage", value: "leakage" },
  { label: "Failed test", value: "failed_test" },
  { label: "Corrosion", value: "corrosion" },
  { label: "Mechanical damage", value: "mechanical_damage" },
  { label: "Improper valve position", value: "improper_valve_position" },
  { label: "Missing identification", value: "missing_identification" },
  { label: "Accessibility issue", value: "accessibility_issue" },
  { label: "Environmental exposure", value: "environmental_exposure" },
  { label: "Monitoring / tamper issue", value: "monitoring_tamper_issue" },
  { label: "Code documentation issue", value: "code_documentation_issue" },
  { label: "Other", value: "other" }
];

const backflowSeverityOptions: ReportOption[] = [
  { label: "None", value: "none" },
  { label: "Minor deficiency", value: "minor_deficiency" },
  { label: "Deficiency", value: "deficiency" },
  { label: "Critical impairment", value: "critical_impairment" }
];

const backflowRecommendationOptions: ReportOption[] = [
  { label: "Monitor", value: "monitor" },
  { label: "Repair", value: "repair" },
  { label: "Replace", value: "replace" },
  { label: "Re-test", value: "re_test" },
  { label: "Further evaluation", value: "further_evaluation" },
  { label: "Contact AHJ", value: "contact_ahj" },
  { label: "Contact water purveyor", value: "contact_water_purveyor" },
  { label: "Other", value: "other" }
];

const backflowRepairPriorityOptions: ReportOption[] = [
  { label: "Immediate", value: "immediate" },
  { label: "Prompt", value: "prompt" },
  { label: "Routine", value: "routine" },
  { label: "At next service", value: "at_next_service" }
];

const backflowSystemLeftInServiceOptions: ReportOption[] = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
  { label: "Partially", value: "partially" }
];

const backflowFireWatchOptions: ReportOption[] = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
  { label: "Not applicable", value: "not_applicable" }
];

const backflowRepairsPerformedOptions: ReportOption[] = [
  { label: "None", value: "none" },
  { label: "Minor adjustment", value: "minor_adjustment" },
  { label: "Cleaning", value: "cleaning" },
  { label: "Part replacement", value: "part_replacement" },
  { label: "Rebuild / internal repair", value: "rebuild_internal_repair" },
  { label: "Other", value: "other" }
];

const backflowPhotoCategoryOptions: ReportOption[] = [
  { label: "Assembly overview", value: "assembly_overview" },
  { label: "Nameplate / manufacturer tag", value: "nameplate_manufacturer_tag" },
  { label: "Serial / model identification", value: "serial_model_identification" },
  { label: "Test setup", value: "test_setup" },
  { label: "Gauge / reading evidence", value: "gauge_reading_evidence" },
  { label: "Relief discharge evidence", value: "relief_discharge_evidence" },
  { label: "Shutoff valves", value: "shutoff_valves" },
  { label: "Leakage / corrosion", value: "leakage_corrosion" },
  { label: "Deficiency detail", value: "deficiency_detail" },
  { label: "Repair completed", value: "repair_completed" },
  { label: "Final condition", value: "final_condition" }
];

const backflowFinalResultOptions: ReportOption[] = [
  { label: "Passed", value: "passed" },
  { label: "Failed", value: "failed" },
  { label: "Passed after repair", value: "passed_after_repair" },
  { label: "Incomplete", value: "incomplete" },
  { label: "Not tested", value: "not_tested" }
];

const backflowFollowUpRecommendationOptions: ReportOption[] = [
  { label: "No further action", value: "no_further_action" },
  { label: "Repair deficiency", value: "repair_deficiency" },
  { label: "Replace assembly", value: "replace_assembly" },
  { label: "Re-test assembly", value: "re_test_assembly" },
  { label: "Additional evaluation", value: "additional_evaluation" },
  { label: "Coordinate with AHJ / water purveyor", value: "coordinate_with_ahj_or_water_purveyor" },
  { label: "Other", value: "other" }
];

const jointCommissionRequirementProfileOptions: ReportOption[] = jointCommissionSprinklerRequirementProfiles.map((profile) => ({
  label: profile.label,
  value: profile.key,
  metadata: {
    editionLabel: profile.editionLabel,
    description: profile.description
  }
}));

const jointCommissionInspectionTypeOptions: ReportOption[] = [
  { label: "Quarterly inspection", value: "quarterly_inspection", metadata: { inspectionMode: "quarterly" } },
  { label: "Annual inspection", value: "annual_inspection", metadata: { inspectionMode: "annual" } },
  { label: "Combined quarterly + annual", value: "combined_quarterly_annual", metadata: { inspectionMode: "combined" } },
  { label: "Follow-up / reinspection", value: "follow_up_reinspection", metadata: { inspectionMode: "follow_up" } }
];

const jointCommissionCodeEditionOptions: ReportOption[] = [
  { label: "NFPA 25 2026", value: "nfpa25_2026" },
  { label: "NFPA 25 2023", value: "nfpa25_2023" },
  { label: "NFPA 25 2020", value: "nfpa25_2020" },
  { label: "NFPA 25 2017", value: "nfpa25_2017" },
  { label: "AHJ-specific", value: "ahj_specific" }
];

const jointCommissionOccupancyOptions: ReportOption[] = [
  { label: "Healthcare", value: "healthcare" },
  { label: "Hospital", value: "hospital" },
  { label: "Outpatient", value: "outpatient" },
  { label: "Medical office", value: "medical_office" },
  { label: "Behavioral health", value: "behavioral_health" },
  { label: "Skilled nursing", value: "skilled_nursing" },
  { label: "Other", value: "other" }
];

const jointCommissionImpairmentStatusOptions: ReportOption[] = [
  { label: "No impairment", value: "no_impairment" },
  { label: "Partial impairment", value: "partial_impairment" },
  { label: "Full impairment", value: "full_impairment" },
  { label: "Unknown", value: "unknown" }
];

const jointCommissionMonitoringStatusOptions: ReportOption[] = [
  { label: "Monitored", value: "monitored" },
  { label: "Not monitored", value: "not_monitored" },
  { label: "Supervisory only", value: "supervisory_only" },
  { label: "Unknown", value: "unknown" }
];

const jointCommissionSystemTypeOptions: ReportOption[] = [
  { label: "Wet", value: "wet" },
  { label: "Dry", value: "dry" },
  { label: "Preaction", value: "preaction" },
  { label: "Deluge", value: "deluge" }
];

const jointCommissionWaterSupplyTypeOptions: ReportOption[] = [
  { label: "Municipal", value: "municipal" },
  { label: "Municipal + fire pump", value: "municipal_fire_pump" },
  { label: "Tank + fire pump", value: "tank_fire_pump" },
  { label: "Other", value: "other" }
];

const jointCommissionRiserTypeOptions: ReportOption[] = [
  { label: "Wet riser", value: "wet_riser" },
  { label: "Floor control assembly", value: "floor_control_assembly" },
  { label: "Combination standpipe / sprinkler", value: "combination" },
  { label: "Other", value: "other" }
];

const jointCommissionTagStatusOptions: ReportOption[] = [
  { label: "Existing tag updated", value: "existing_tag_updated" },
  { label: "New tag installed", value: "new_tag_installed" },
  { label: "No tag installed", value: "no_tag_installed" },
  { label: "Tag missing", value: "tag_missing" },
  { label: "Tag not applicable", value: "tag_not_applicable" }
];

const jointCommissionAlarmValveTypeOptions: ReportOption[] = [
  { label: "Wet alarm valve", value: "wet_alarm_valve" },
  { label: "Retard chamber trim", value: "retard_chamber_trim" },
  { label: "Floor control assembly", value: "floor_control_assembly" },
  { label: "Check valve trim", value: "check_valve_trim" },
  { label: "Other", value: "other" }
];

const jointCommissionSurveySensitivityOptions: ReportOption[] = [
  { label: "Standard clinical area", value: "standard_clinical_area" },
  { label: "High-acuity patient care area", value: "high_acuity_patient_care_area" },
  { label: "Surgery / procedure area", value: "surgery_procedure_area" },
  { label: "Life safety survey-sensitive area", value: "life_safety_survey_sensitive_area" },
  { label: "Construction / interim conditions", value: "construction_interim_conditions" },
  { label: "Other", value: "other" }
];

const jointCommissionInspectionModeOptions: ReportOption[] = [
  { label: "Quarterly", value: "quarterly" },
  { label: "Annual", value: "annual" },
  { label: "Combined", value: "combined" },
  { label: "Follow-up", value: "follow_up" }
];

const jointCommissionStatusOptions: ReportOption[] = [
  { label: "Pass", value: "pass" },
  { label: "Fail", value: "fail" },
  { label: "N/A", value: "na" }
];

const jointCommissionSeverityOptions: ReportOption[] = [
  { label: "Minor", value: "minor" },
  { label: "Deficiency", value: "deficiency" },
  { label: "Critical impairment", value: "critical_impairment" }
];

const jointCommissionValveStateOptions: ReportOption[] = [
  { label: "Open", value: "open" },
  { label: "Closed", value: "closed" },
  { label: "Supervised open", value: "supervised_open" },
  { label: "Locked open", value: "locked_open" },
  { label: "Tampered", value: "tampered" }
];

const jointCommissionRecommendationOptions: ReportOption[] = [
  { label: "Monitor", value: "monitor" },
  { label: "Repair", value: "repair" },
  { label: "Replace", value: "replace" },
  { label: "Further evaluation", value: "further_evaluation" },
  { label: "Immediate action required", value: "immediate_action_required" }
];

const jointCommissionRequiredTimelineOptions: ReportOption[] = [
  { label: "Immediate", value: "immediate" },
  { label: "24hr", value: "24hr" },
  { label: "7-day", value: "7_day" },
  { label: "Routine", value: "routine" }
];

const jointCommissionOverallResultOptions: ReportOption[] = [
  { label: "Pass", value: "pass" },
  { label: "Pass with deficiencies", value: "pass_with_deficiencies" },
  { label: "Fail", value: "fail" },
  { label: "Impaired", value: "impaired" }
];

const jointCommissionPhotoCategoryOptions: ReportOption[] = [
  { label: "System overview", value: "system_overview" },
  { label: "Riser", value: "riser" },
  { label: "Valves", value: "valves" },
  { label: "Gauges", value: "gauges" },
  { label: "Deficiencies", value: "deficiencies" },
  { label: "Repairs", value: "repairs" },
  { label: "Tags", value: "tags" },
  { label: "FDC", value: "fdc" },
  { label: "Obstruction issues", value: "obstruction_issues" }
];

const alarmDeviceTypes: ReportOption[] = [
  { label: "Control panel", value: "control_panel" },
  { label: "Smoke detector", value: "smoke_detector" },
  { label: "Heat detector", value: "heat_detector" },
  { label: "Pull station", value: "pull_station" },
  { label: "Duct detector", value: "duct_detector" },
  { label: "Monitor module", value: "monitor_module" },
  { label: "Control module", value: "control_module" },
  { label: "Relay module", value: "relay_module" },
  { label: "Waterflow switch", value: "waterflow_switch" },
  { label: "Tamper switch", value: "tamper_switch" },
  { label: "Beam detector", value: "beam_detector" },
  { label: "Other", value: "other" }
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
const workOrderJobsiteHours: ReportOption[] = [
  { label: "0.5 hours", value: "0.5" },
  { label: "1 hour", value: "1" },
  { label: "1.5 hours", value: "1.5" },
  { label: "2 hours", value: "2" },
  { label: "2.5 hours", value: "2.5" },
  { label: "3 hours", value: "3" },
  { label: "4 hours", value: "4" },
  { label: "5 hours", value: "5" },
  { label: "6 hours", value: "6" },
  { label: "8 hours", value: "8" },
  { label: "Other", value: "other" }
];
const workOrderPartsEquipmentOptions: ReportOption[] = [
  ...extinguisherTypes
    .filter((option) => option.value !== "other")
    .map((option) => ({
      ...option,
      metadata: {
        ...(option.metadata ?? {}),
        category: "Fire extinguisher"
      }
    })),
  ...emergencyLightTypes
    .filter((option) => option.value !== "Other")
    .map((option) => ({
      ...option,
      metadata: {
        ...(option.metadata ?? {}),
        category: option.label.includes("Exit") ? "Exit / emergency lighting" : "Emergency lighting"
      }
    })),
  { label: "Other", value: "other", metadata: { category: "Custom" } }
];
const workOrderServiceOptions: ReportOption[] = [
  { label: "Annual Inspection", value: "Annual Inspection" },
  { label: "Recharge", value: "Recharge" },
  { label: "6-Year Maintenance", value: "6-Year Maintenance" },
  { label: "Hydro Test", value: "Hydro Test" },
  { label: "Installation", value: "Installation" },
  { label: "Replacement", value: "Replacement" },
  { label: "Repair", value: "Repair" },
  { label: "Troubleshooting", value: "Troubleshooting" },
  { label: "Emergency Light Service", value: "Emergency Light Service" },
  { label: "Exit Sign / Light Service", value: "Exit Sign / Light Service" },
  { label: "Other", value: "other" }
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
  { label: "Semi-annual visit", value: "semi_annual" },
  { label: "Annual visit", value: "annual" },
  { label: "Five-year internal", value: "five_year_internal" },
  { label: "Five-year test", value: "five_year_test" },
  { label: "Combined visit", value: "combined" }
];

const wetSprinklerServiceTypeOptions: ReportOption[] = [
  { label: "Weekly", value: "weekly", metadata: { visitScope: "weekly" } },
  { label: "Monthly", value: "monthly", metadata: { visitScope: "monthly" } },
  { label: "Quarterly", value: "quarterly", metadata: { visitScope: "quarterly" } },
  { label: "Semi-Annual", value: "semi_annual", metadata: { visitScope: "semi_annual" } },
  { label: "Annual", value: "annual", metadata: { visitScope: "annual" } },
  { label: "5 Year Internal", value: "five_year_internal", metadata: { visitScope: "five_year_internal" } },
  { label: "5 Year Test", value: "five_year_test", metadata: { visitScope: "five_year_test" } },
  { label: "Combined Service", value: "combined", metadata: { visitScope: "combined" } }
];

const wetSprinklerTagStatusOptions: ReportOption[] = [
  { label: "Green", value: "green" },
  { label: "Yellow", value: "yellow" },
  { label: "Red", value: "red" }
];

const wetSprinklerOverallResultOptions: ReportOption[] = [
  { label: "Pass", value: "pass" },
  { label: "Pass with deficiencies", value: "pass_with_deficiencies" },
  { label: "Impairment noted", value: "impairment_noted" },
  { label: "Out of service", value: "out_of_service" },
  { label: "Follow-up required", value: "follow_up_required" }
];

const sprinklerAlarmValveTypes: ReportOption[] = [
  { label: "Alarm check valve", value: "alarm_check_valve" },
  { label: "Retard chamber trim", value: "retard_chamber_trim" },
  { label: "Water motor gong", value: "water_motor_gong" },
  { label: "Pressure switch", value: "pressure_switch" },
  { label: "Wet alarm valve assembly", value: "wet_alarm_valve_assembly" },
  { label: "Other", value: "other" }
];

const sprinklerHeadTypes: ReportOption[] = [
  { label: "Pendant", value: "pendant" },
  { label: "Upright", value: "upright" },
  { label: "Sidewall", value: "sidewall" },
  { label: "Concealed", value: "concealed" },
  { label: "Dry pendent", value: "dry_pendent" },
  { label: "Other", value: "other" }
];

const sprinklerHeadEscutcheonOptions: ReportOption[] = [
  { label: "Flush", value: "flush" },
  { label: "Recessed", value: "recessed" },
  { label: "Concealed cover plate", value: "concealed_cover_plate" },
  { label: "None", value: "none" },
  { label: "Damaged / missing", value: "damaged_or_missing" },
  { label: "Other", value: "other" }
];

const sprinklerHeadSizeOptions: ReportOption[] = [
  { label: "1/2 in", value: "1_2_in" },
  { label: "3/4 in", value: "3_4_in" },
  { label: "K5.6", value: "k5_6" },
  { label: "K8.0", value: "k8_0" },
  { label: "K11.2", value: "k11_2" },
  { label: "Other", value: "other" }
];

const sprinklerHeadTemperatureOptions: ReportOption[] = [
  { label: "135F", value: "135f" },
  { label: "155F", value: "155f" },
  { label: "175F", value: "175f" },
  { label: "200F", value: "200f" },
  { label: "286F", value: "286f" },
  { label: "Other", value: "other" }
];

const sprinklerHeadBulbConditionOptions: ReportOption[] = [
  { label: "Normal / clear", value: "normal_clear" },
  { label: "Loaded", value: "loaded" },
  { label: "Painted", value: "painted" },
  { label: "Corroded", value: "corroded" },
  { label: "Broken / damaged", value: "damaged" },
  { label: "Other", value: "other" }
];

const sprinklerManufacturers: ReportOption[] = [
  { label: "Reliable", value: "reliable" },
  { label: "Tyco", value: "tyco" },
  { label: "Viking", value: "viking" },
  { label: "Globe", value: "globe" },
  { label: "Victaulic", value: "victaulic" },
  { label: "Central", value: "central" },
  { label: "Other", value: "other" }
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
  backflowRequirementProfiles: backflowRequirementProfileOptions,
  backflowManufacturers,
  backflowInspectionTypeOptions,
  backflowTagStatusOptions,
  backflowCodeEditionOptions,
  backflowSystemServedOptions,
  backflowSprinklerSystemTypeOptions,
  backflowWaterSupplyTypeOptions,
  backflowOccupancyTypeOptions,
  backflowSystemStatusOptions,
  backflowMonitoringStatusOptions,
  backflowAssemblySizeOptions,
  backflowOrientationOptions,
  backflowDetectorMeterOptions,
  backflowFireLineTypeOptions,
  backflowTestReasonOptions,
  backflowStatusOptions,
  backflowConditionOptions,
  backflowTestPerformedOptions,
  backflowInitialTestResultOptions,
  backflowReliefDischargeOptions,
  backflowYesNoOptions,
  backflowYesNoNAOptions,
  backflowUnknownYesNoOptions,
  backflowDeficiencyCategoryOptions,
  backflowSeverityOptions,
  backflowRecommendationOptions,
  backflowRepairPriorityOptions,
  backflowSystemLeftInServiceOptions,
  backflowFireWatchOptions,
  backflowRepairsPerformedOptions,
  backflowPhotoCategoryOptions,
  backflowFinalResultOptions,
  backflowFollowUpRecommendationOptions,
  jointCommissionSprinklerRequirementProfiles: jointCommissionRequirementProfileOptions,
  jointCommissionInspectionTypeOptions,
  jointCommissionCodeEditionOptions,
  jointCommissionOccupancyOptions,
  jointCommissionImpairmentStatusOptions,
  jointCommissionMonitoringStatusOptions,
  jointCommissionSystemTypeOptions,
  jointCommissionWaterSupplyTypeOptions,
  jointCommissionRiserTypeOptions,
  jointCommissionTagStatusOptions,
  jointCommissionAlarmValveTypeOptions,
  jointCommissionSurveySensitivityOptions,
  jointCommissionInspectionModeOptions,
  jointCommissionStatusOptions,
  jointCommissionSeverityOptions,
  jointCommissionValveStateOptions,
  jointCommissionRecommendationOptions,
  jointCommissionRequiredTimelineOptions,
  jointCommissionOverallResultOptions,
  jointCommissionPhotoCategoryOptions,
  workOrderJobsiteHours,
  workOrderPartsEquipmentOptions,
  workOrderServiceOptions,
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
  wetSprinklerServiceTypeOptions,
  wetSprinklerTagStatusOptions,
  wetSprinklerOverallResultOptions,
  sprinklerAlarmValveTypes,
  sprinklerHeadTypes,
  sprinklerHeadEscutcheonOptions,
  sprinklerHeadSizeOptions,
  sprinklerHeadTemperatureOptions,
  sprinklerHeadBulbConditionOptions,
  sprinklerManufacturers
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
        sizeInches: typeof metadata.sizeInches === "number" ? String(metadata.sizeInches) : coerceMetadata(metadata.sizeInches),
        serialNumber: coerceMetadata(metadata.serialNumber),
        installationOrientation: coerceMetadata(metadata.installationOrientation),
        detectorMeterPresent: coerceMetadata(metadata.detectorMeterPresent),
        fireLineType: coerceMetadata(metadata.fireLineType),
        installYear: coerceMetadata(metadata.installYear),
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
        manufacturer: coerceMetadata(metadata.manufacturer),
        headType: coerceMetadata(metadata.headType),
        escutcheon: coerceMetadata(metadata.escutcheon),
        headSize: coerceMetadata(metadata.headSize),
        temperatureRating: coerceMetadata(metadata.temperatureRating),
        bulbCondition: coerceMetadata(metadata.bulbCondition),
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
