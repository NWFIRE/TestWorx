export type WetSprinklerRequirementGroupKey =
  | "weekly_inspection"
  | "monthly_inspection"
  | "quarterly_inspection"
  | "quarterly_test"
  | "semi_annual_test"
  | "annual_inspection"
  | "five_year_internal_inspection"
  | "five_year_test";

export type WetSprinklerRequirementItem = {
  requirementKey: string;
  itemLabel: string;
  referenceLabel: string;
  frequencyLabel: string;
  groupKey: WetSprinklerRequirementGroupKey;
  defaultSeverity?: "low" | "medium" | "high" | "critical";
};

export type WetSprinklerRequirementProfile = {
  key: string;
  label: string;
  editionLabel: string;
  description: string;
  items: Record<WetSprinklerRequirementGroupKey, WetSprinklerRequirementItem[]>;
};

export type BackflowRequirementItem = {
  requirementKey: string;
  displayLabel: string;
  codeRef: string;
  frequencyLabel: string;
  defaultSeverity?: "low" | "medium" | "high" | "critical";
};

export type BackflowRequirementProfile = {
  key: string;
  label: string;
  editionLabel: string;
  description: string;
  visualInspectionItems: BackflowRequirementItem[];
};

export type JointCommissionSprinklerFrequency = "quarterly" | "annual";

export type JointCommissionSprinklerRequirementItem = {
  requirementKey: string;
  itemLabel: string;
  epLabel: string;
  codeLabel: string;
  frequencyLabel: string;
  frequency: JointCommissionSprinklerFrequency;
  photoRequiredWhenFailed?: boolean;
};

export type JointCommissionSprinklerRequirementProfile = {
  key: string;
  label: string;
  editionLabel: string;
  description: string;
  items: Record<JointCommissionSprinklerFrequency, JointCommissionSprinklerRequirementItem[]>;
};

const nfpa25_2023_baseline: WetSprinklerRequirementProfile = {
  key: "nfpa25_2023_baseline",
  label: "NFPA 25 (2023 baseline)",
  editionLabel: "2023 baseline",
  description: "Baseline wet-pipe inspection, testing, and maintenance checkpoints aligned to the current TradeWorx wet sprinkler workflow and the source inspection form. Extend or swap this profile when a local AHJ adopts a different edition or amendment package.",
  items: {
    weekly_inspection: [
      {
        requirementKey: "weekly_control_valves_open",
        itemLabel: "Verify control valves are in the normal open position and secured, locked, sealed, or electronically supervised as required.",
        referenceLabel: "Weekly wet-pipe inspection baseline",
        frequencyLabel: "Weekly inspection",
        groupKey: "weekly_inspection",
        defaultSeverity: "high"
      },
      {
        requirementKey: "weekly_gauges_normal",
        itemLabel: "Confirm system and supply gauges indicate normal pressure conditions with no unexplained change from expected readings.",
        referenceLabel: "Weekly wet-pipe inspection baseline",
        frequencyLabel: "Weekly inspection",
        groupKey: "weekly_inspection",
        defaultSeverity: "medium"
      },
      {
        requirementKey: "weekly_riser_room_condition",
        itemLabel: "Inspect the riser / valve room for leakage, corrosion, physical damage, freezing exposure, housekeeping, and access concerns.",
        referenceLabel: "Weekly wet-pipe inspection baseline",
        frequencyLabel: "Weekly inspection",
        groupKey: "weekly_inspection",
        defaultSeverity: "high"
      }
    ],
    monthly_inspection: [
      {
        requirementKey: "monthly_sprinklers_condition",
        itemLabel: "Inspect accessible sprinklers for loading, paint, corrosion, damage, missing escutcheons, or obstruction to discharge patterns.",
        referenceLabel: "Monthly wet-pipe inspection baseline",
        frequencyLabel: "Monthly inspection",
        groupKey: "monthly_inspection",
        defaultSeverity: "high"
      },
      {
        requirementKey: "monthly_pipe_hangers_condition",
        itemLabel: "Inspect visible piping, fittings, hangers, and seismic bracing for leaks, impact damage, loose supports, or corrosion.",
        referenceLabel: "Monthly wet-pipe inspection baseline",
        frequencyLabel: "Monthly inspection",
        groupKey: "monthly_inspection",
        defaultSeverity: "high"
      },
      {
        requirementKey: "monthly_spare_heads",
        itemLabel: "Verify spare sprinklers and the proper sprinkler wrench are provided, protected, and available at the site.",
        referenceLabel: "Monthly wet-pipe inspection baseline",
        frequencyLabel: "Monthly inspection",
        groupKey: "monthly_inspection",
        defaultSeverity: "medium"
      },
      {
        requirementKey: "monthly_fdc_access",
        itemLabel: "Inspect the fire department connection for accessibility, caps / plugs, visible condition, signage, and protection from damage.",
        referenceLabel: "Monthly wet-pipe inspection baseline",
        frequencyLabel: "Monthly inspection",
        groupKey: "monthly_inspection",
        defaultSeverity: "medium"
      },
      {
        requirementKey: "monthly_alarm_valve_exterior",
        itemLabel: "Inspect alarm valve trim, drain arrangements, gauges, signage, and exterior condition where present on the wet system.",
        referenceLabel: "Monthly wet-pipe inspection baseline",
        frequencyLabel: "Monthly inspection",
        groupKey: "monthly_inspection",
        defaultSeverity: "medium"
      }
    ],
    quarterly_inspection: [
      {
        requirementKey: "quarterly_valve_supervision_readiness",
        itemLabel: "Confirm valve supervisory readiness, signage, and access at each wet system control point.",
        referenceLabel: "Quarterly wet-pipe inspection baseline",
        frequencyLabel: "Quarterly inspection",
        groupKey: "quarterly_inspection",
        defaultSeverity: "high"
      },
      {
        requirementKey: "quarterly_alarm_devices_condition",
        itemLabel: "Inspect local alarm devices, trim, and associated components for physical condition and readiness before testing.",
        referenceLabel: "Quarterly wet-pipe inspection baseline",
        frequencyLabel: "Quarterly inspection",
        groupKey: "quarterly_inspection",
        defaultSeverity: "medium"
      },
      {
        requirementKey: "quarterly_hydraulic_nameplate_records",
        itemLabel: "Verify required hydraulic nameplates, identification, and test record references are present and legible where applicable.",
        referenceLabel: "Quarterly wet-pipe inspection baseline",
        frequencyLabel: "Quarterly inspection",
        groupKey: "quarterly_inspection",
        defaultSeverity: "medium"
      }
    ],
    quarterly_test: [
      {
        requirementKey: "quarterly_waterflow_test",
        itemLabel: "Perform and document waterflow alarm operation, including local indication and remote signal transmission where applicable.",
        referenceLabel: "Quarterly wet-pipe testing baseline",
        frequencyLabel: "Quarterly test",
        groupKey: "quarterly_test",
        defaultSeverity: "high"
      },
      {
        requirementKey: "quarterly_supervisory_test",
        itemLabel: "Verify valve supervisory / tamper signal operation and confirm transmission to the supervising station when applicable.",
        referenceLabel: "Quarterly wet-pipe testing baseline",
        frequencyLabel: "Quarterly test",
        groupKey: "quarterly_test",
        defaultSeverity: "high"
      },
      {
        requirementKey: "quarterly_main_drain",
        itemLabel: "Conduct the main drain test, compare to prior records when available, and document any adverse change in supply conditions.",
        referenceLabel: "Quarterly wet-pipe testing baseline",
        frequencyLabel: "Quarterly test",
        groupKey: "quarterly_test",
        defaultSeverity: "high"
      }
    ],
    semi_annual_test: [
      {
        requirementKey: "semiannual_mechanical_alarm",
        itemLabel: "Test mechanical alarm devices, water motor gongs, or equivalent local alarm appliances where provided and required by the adopted profile.",
        referenceLabel: "Semi-annual wet-pipe testing baseline",
        frequencyLabel: "Semi-annual test",
        groupKey: "semi_annual_test",
        defaultSeverity: "medium"
      },
      {
        requirementKey: "semiannual_drain_devices",
        itemLabel: "Inspect and operate auxiliary or low-point drain arrangements where applicable, documenting drain condition and restoration to service.",
        referenceLabel: "Semi-annual wet-pipe testing baseline",
        frequencyLabel: "Semi-annual test",
        groupKey: "semi_annual_test",
        defaultSeverity: "medium"
      },
      {
        requirementKey: "semiannual_alarm_valve_function",
        itemLabel: "Verify alarm valve function, trim readiness, and associated control condition where semi-annual testing applies.",
        referenceLabel: "Semi-annual wet-pipe testing baseline",
        frequencyLabel: "Semi-annual test",
        groupKey: "semi_annual_test",
        defaultSeverity: "high"
      }
    ],
    annual_inspection: [
      {
        requirementKey: "annual_system_walkthrough",
        itemLabel: "Perform an annual visual system walkthrough for sprinklers, piping, hangers, bracing, signs, valves, and related wet system accessories.",
        referenceLabel: "Annual wet-pipe inspection baseline",
        frequencyLabel: "Annual inspection / test",
        groupKey: "annual_inspection",
        defaultSeverity: "high"
      },
      {
        requirementKey: "annual_fdc_components",
        itemLabel: "Inspect the fire department connection body, clappers, plugs/caps, gaskets, and identification for annual readiness documentation.",
        referenceLabel: "Annual wet-pipe inspection baseline",
        frequencyLabel: "Annual inspection / test",
        groupKey: "annual_inspection",
        defaultSeverity: "medium"
      },
      {
        requirementKey: "annual_alarm_valve_trim",
        itemLabel: "Inspect alarm valve trim, retard chamber, drains, and associated devices for annual condition and operability documentation.",
        referenceLabel: "Annual wet-pipe inspection baseline",
        frequencyLabel: "Annual inspection / test",
        groupKey: "annual_inspection",
        defaultSeverity: "medium"
      },
      {
        requirementKey: "annual_spare_sprinkler_cabinet",
        itemLabel: "Verify spare sprinkler cabinet stock, wrench compatibility, and temperature / listing suitability for the system hazards served.",
        referenceLabel: "Annual wet-pipe inspection baseline",
        frequencyLabel: "Annual inspection / test",
        groupKey: "annual_inspection",
        defaultSeverity: "medium"
      }
    ],
    five_year_internal_inspection: [
      {
        requirementKey: "fiveyear_internal_pipe_obstruction",
        itemLabel: "Document five-year internal inspection findings for obstruction, microbiologically influenced corrosion, tuberculation, or foreign material in piping.",
        referenceLabel: "Five-year internal inspection baseline",
        frequencyLabel: "Five-year internal inspection",
        groupKey: "five_year_internal_inspection",
        defaultSeverity: "high"
      },
      {
        requirementKey: "fiveyear_internal_check_alarm_valves",
        itemLabel: "Inspect check valves / alarm valves internally for corrosion, deposits, damage, and unrestricted movement where applicable.",
        referenceLabel: "Five-year internal inspection baseline",
        frequencyLabel: "Five-year internal inspection",
        groupKey: "five_year_internal_inspection",
        defaultSeverity: "high"
      },
      {
        requirementKey: "fiveyear_internal_branch_samples",
        itemLabel: "Record branch-line, drain, or auxiliary sample findings and any recommendation for additional internal investigation or flushing.",
        referenceLabel: "Five-year internal inspection baseline",
        frequencyLabel: "Five-year internal inspection",
        groupKey: "five_year_internal_inspection",
        defaultSeverity: "medium"
      }
    ],
    five_year_test: [
      {
        requirementKey: "fiveyear_gauge_replacement",
        itemLabel: "Document gauge replacement / calibration interval compliance and any five-year gauge service performed during this visit.",
        referenceLabel: "Five-year wet-pipe testing baseline",
        frequencyLabel: "Five-year test",
        groupKey: "five_year_test",
        defaultSeverity: "medium"
      },
      {
        requirementKey: "fiveyear_component_testing",
        itemLabel: "Record additional five-year wet system tests required by the adopted profile, including component-specific testing or investigation results.",
        referenceLabel: "Five-year wet-pipe testing baseline",
        frequencyLabel: "Five-year test",
        groupKey: "five_year_test",
        defaultSeverity: "high"
      },
      {
        requirementKey: "fiveyear_followup_findings",
        itemLabel: "Summarize five-year test findings, corrective work recommended, and any impairment, shutdown, or follow-up coordination triggered by the results.",
        referenceLabel: "Five-year wet-pipe testing baseline",
        frequencyLabel: "Five-year test",
        groupKey: "five_year_test",
        defaultSeverity: "high"
      }
    ]
  }
};

const nfpa25_2023_backflow: BackflowRequirementProfile = {
  key: "nfpa25_2023_backflow",
  label: "NFPA 25 (2023 baseline)",
  editionLabel: "2023 baseline",
  description: "Baseline backflow prevention inspection and testing checkpoints for fire protection service, structured so adopted edition or AHJ-specific profiles can be swapped later.",
  visualInspectionItems: [
    {
      requirementKey: "assembly_accessible",
      displayLabel: "Assembly is accessible for inspection, testing, and service.",
      codeRef: "NFPA 25 backflow visual inspection baseline",
      frequencyLabel: "Annual inspection / test",
      defaultSeverity: "high"
    },
    {
      requirementKey: "protected_from_damage",
      displayLabel: "Assembly is protected from physical damage and environmental exposure.",
      codeRef: "NFPA 25 backflow visual inspection baseline",
      frequencyLabel: "Annual inspection / test",
      defaultSeverity: "high"
    },
    {
      requirementKey: "no_external_leakage",
      displayLabel: "No visible external leakage is present at the assembly or trim.",
      codeRef: "NFPA 25 backflow visual inspection baseline",
      frequencyLabel: "Annual inspection / test",
      defaultSeverity: "high"
    },
    {
      requirementKey: "caps_and_plugs_present",
      displayLabel: "Required caps, plugs, and protective fittings are present and in acceptable condition.",
      codeRef: "NFPA 25 backflow visual inspection baseline",
      frequencyLabel: "Annual inspection / test",
      defaultSeverity: "medium"
    },
    {
      requirementKey: "test_cocks_acceptable",
      displayLabel: "Test cocks are intact, accessible, and in acceptable condition.",
      codeRef: "NFPA 25 backflow visual inspection baseline",
      frequencyLabel: "Annual inspection / test",
      defaultSeverity: "medium"
    },
    {
      requirementKey: "shutoff_valves_accessible",
      displayLabel: "Required shutoff valves are accessible and operable.",
      codeRef: "NFPA 25 backflow visual inspection baseline",
      frequencyLabel: "Annual inspection / test",
      defaultSeverity: "high"
    },
    {
      requirementKey: "shutoff_valves_position",
      displayLabel: "Shutoff valves are in the required position and indicate normal service readiness.",
      codeRef: "NFPA 25 backflow visual inspection baseline",
      frequencyLabel: "Annual inspection / test",
      defaultSeverity: "high"
    },
    {
      requirementKey: "supervisory_condition",
      displayLabel: "Supervisory / tamper condition is acceptable where provided.",
      codeRef: "NFPA 25 backflow visual inspection baseline",
      frequencyLabel: "Annual inspection / test",
      defaultSeverity: "high"
    },
    {
      requirementKey: "gauges_legible",
      displayLabel: "Gauges are present, legible, and suitable for inspection/testing.",
      codeRef: "NFPA 25 backflow visual inspection baseline",
      frequencyLabel: "Annual inspection / test",
      defaultSeverity: "medium"
    },
    {
      requirementKey: "no_visible_corrosion",
      displayLabel: "No visible corrosion, scaling, or abnormal deterioration is present.",
      codeRef: "NFPA 25 backflow visual inspection baseline",
      frequencyLabel: "Annual inspection / test",
      defaultSeverity: "medium"
    },
    {
      requirementKey: "no_freeze_damage",
      displayLabel: "No evidence of freeze damage or thermal exposure is observed.",
      codeRef: "NFPA 25 backflow visual inspection baseline",
      frequencyLabel: "Annual inspection / test",
      defaultSeverity: "high"
    },
    {
      requirementKey: "relief_discharge_acceptable",
      displayLabel: "Relief discharge arrangement is acceptable where applicable.",
      codeRef: "NFPA 25 backflow visual inspection baseline",
      frequencyLabel: "Annual inspection / test",
      defaultSeverity: "high"
    },
    {
      requirementKey: "identification_present",
      displayLabel: "Required identification tag, label, or assembly markings are present and legible.",
      codeRef: "NFPA 25 backflow visual inspection baseline",
      frequencyLabel: "Annual inspection / test",
      defaultSeverity: "medium"
    },
    {
      requirementKey: "support_mounting_acceptable",
      displayLabel: "Assembly support, bracing, or mounting condition is acceptable.",
      codeRef: "NFPA 25 backflow visual inspection baseline",
      frequencyLabel: "Annual inspection / test",
      defaultSeverity: "medium"
    },
    {
      requirementKey: "room_or_vault_acceptable",
      displayLabel: "Vault, room, or enclosure condition is acceptable for the assembly.",
      codeRef: "NFPA 25 backflow visual inspection baseline",
      frequencyLabel: "Annual inspection / test",
      defaultSeverity: "medium"
    },
    {
      requirementKey: "drainage_adequate",
      displayLabel: "Drainage is adequate where applicable for testing, relief discharge, and service conditions.",
      codeRef: "NFPA 25 backflow visual inspection baseline",
      frequencyLabel: "Annual inspection / test",
      defaultSeverity: "high"
    }
  ]
};

export const backflowRequirementProfiles: BackflowRequirementProfile[] = [nfpa25_2023_backflow];

export function buildBackflowChecklistSeedRows(profileKey = "nfpa25_2023_backflow") {
  const profile = backflowRequirementProfiles.find((candidate) => candidate.key === profileKey) ?? nfpa25_2023_backflow;
  return profile.visualInspectionItems.map((item) => ({
    requirementKey: item.requirementKey,
    requirementProfileKey: profile.key,
    requirementEditionLabel: profile.editionLabel,
    frequencyLabel: item.frequencyLabel,
    displayLabel: item.displayLabel,
    codeRef: item.codeRef,
    result: "",
    condition: "",
    comments: "",
    customerComment: "",
    correctiveAction: "",
    photo: ""
  }));
}

const tjc_nfpa25_2023_sprinkler: JointCommissionSprinklerRequirementProfile = {
  key: "tjc_nfpa25_2023_sprinkler",
  label: "Joint Commission / NFPA 25 (2023 baseline)",
  editionLabel: "2023 baseline",
  description: "Healthcare-focused quarterly and annual sprinkler documentation baseline aligned to NFPA 25 inspection/testing expectations and TJC-style traceability needs.",
  items: {
    quarterly: [
      {
        requirementKey: "control_valves_in_correct_position",
        itemLabel: "Control valves in correct position",
        epLabel: "LS.02.01.35 EP 1",
        codeLabel: "NFPA 25 quarterly inspection baseline",
        frequencyLabel: "Quarterly",
        frequency: "quarterly"
      },
      {
        requirementKey: "valves_locked_or_supervised",
        itemLabel: "Valves locked or supervised",
        epLabel: "LS.02.01.35 EP 1",
        codeLabel: "NFPA 25 quarterly inspection baseline",
        frequencyLabel: "Quarterly",
        frequency: "quarterly"
      },
      {
        requirementKey: "alarm_devices_free_of_damage",
        itemLabel: "Alarm devices free of damage",
        epLabel: "LS.02.01.35 EP 1",
        codeLabel: "NFPA 25 quarterly inspection baseline",
        frequencyLabel: "Quarterly",
        frequency: "quarterly"
      },
      {
        requirementKey: "fdc_condition",
        itemLabel: "Fire department connection condition acceptable",
        epLabel: "LS.02.01.35 EP 1",
        codeLabel: "NFPA 25 quarterly inspection baseline",
        frequencyLabel: "Quarterly",
        frequency: "quarterly",
        photoRequiredWhenFailed: true
      },
      {
        requirementKey: "hydraulic_placard_legible",
        itemLabel: "Hydraulic placard present and legible",
        epLabel: "LS.02.01.35 EP 1",
        codeLabel: "NFPA 25 quarterly inspection baseline",
        frequencyLabel: "Quarterly",
        frequency: "quarterly"
      },
      {
        requirementKey: "main_drain_test_performed",
        itemLabel: "Main drain test performed",
        epLabel: "LS.02.01.35 EP 1",
        codeLabel: "NFPA 25 quarterly test baseline",
        frequencyLabel: "Quarterly",
        frequency: "quarterly"
      },
      {
        requirementKey: "static_pressure_recorded",
        itemLabel: "Static pressure recorded",
        epLabel: "LS.02.01.35 EP 1",
        codeLabel: "NFPA 25 quarterly test baseline",
        frequencyLabel: "Quarterly",
        frequency: "quarterly"
      },
      {
        requirementKey: "residual_pressure_recorded",
        itemLabel: "Residual pressure recorded",
        epLabel: "LS.02.01.35 EP 1",
        codeLabel: "NFPA 25 quarterly test baseline",
        frequencyLabel: "Quarterly",
        frequency: "quarterly"
      },
      {
        requirementKey: "results_comparable_to_previous",
        itemLabel: "Results comparable to previous test",
        epLabel: "LS.02.01.35 EP 1",
        codeLabel: "NFPA 25 quarterly test baseline",
        frequencyLabel: "Quarterly",
        frequency: "quarterly"
      },
      {
        requirementKey: "waterflow_alarm_tested",
        itemLabel: "Waterflow alarm tested",
        epLabel: "LS.02.01.35 EP 1",
        codeLabel: "NFPA 25 quarterly test baseline",
        frequencyLabel: "Quarterly",
        frequency: "quarterly"
      },
      {
        requirementKey: "alarm_operates_with_inspectors_test",
        itemLabel: "Alarm operates from inspector's test",
        epLabel: "LS.02.01.35 EP 1",
        codeLabel: "NFPA 25 quarterly test baseline",
        frequencyLabel: "Quarterly",
        frequency: "quarterly",
        photoRequiredWhenFailed: true
      },
      {
        requirementKey: "alarm_operates_with_bypass",
        itemLabel: "Alarm operates from bypass",
        epLabel: "LS.02.01.35 EP 1",
        codeLabel: "NFPA 25 quarterly test baseline",
        frequencyLabel: "Quarterly",
        frequency: "quarterly"
      },
      {
        requirementKey: "full_flow_observed",
        itemLabel: "Full flow observed",
        epLabel: "LS.02.01.35 EP 1",
        codeLabel: "NFPA 25 quarterly test baseline",
        frequencyLabel: "Quarterly",
        frequency: "quarterly"
      }
    ],
    annual: [
      {
        requirementKey: "sprinklers_free_of_corrosion_paint_damage",
        itemLabel: "Sprinklers free of corrosion, paint, and damage",
        epLabel: "LS.02.01.35 EP 2",
        codeLabel: "NFPA 25 annual inspection baseline",
        frequencyLabel: "Annual",
        frequency: "annual"
      },
      {
        requirementKey: "no_obstructions_to_sprinklers",
        itemLabel: "No obstructions to sprinklers",
        epLabel: "LS.02.01.35 EP 2",
        codeLabel: "NFPA 25 annual inspection baseline",
        frequencyLabel: "Annual",
        frequency: "annual"
      },
      {
        requirementKey: "proper_clearance_maintained",
        itemLabel: "Required clearance maintained",
        epLabel: "LS.02.01.35 EP 2",
        codeLabel: "NFPA 25 annual inspection baseline",
        frequencyLabel: "Annual",
        frequency: "annual",
        photoRequiredWhenFailed: true
      },
      {
        requirementKey: "piping_free_of_corrosion",
        itemLabel: "Visible piping free of corrosion",
        epLabel: "LS.02.01.35 EP 2",
        codeLabel: "NFPA 25 annual inspection baseline",
        frequencyLabel: "Annual",
        frequency: "annual"
      },
      {
        requirementKey: "piping_properly_aligned",
        itemLabel: "Piping properly aligned and supported",
        epLabel: "LS.02.01.35 EP 2",
        codeLabel: "NFPA 25 annual inspection baseline",
        frequencyLabel: "Annual",
        frequency: "annual"
      },
      {
        requirementKey: "pipe_hangers_in_good_condition",
        itemLabel: "Pipe hangers in good condition",
        epLabel: "LS.02.01.35 EP 2",
        codeLabel: "NFPA 25 annual inspection baseline",
        frequencyLabel: "Annual",
        frequency: "annual"
      },
      {
        requirementKey: "no_leaks_observed",
        itemLabel: "No leaks observed",
        epLabel: "LS.02.01.35 EP 2",
        codeLabel: "NFPA 25 annual inspection baseline",
        frequencyLabel: "Annual",
        frequency: "annual"
      },
      {
        requirementKey: "gauges_accurate_or_replaced",
        itemLabel: "Gauges accurate or replaced as needed",
        epLabel: "LS.02.01.35 EP 2",
        codeLabel: "NFPA 25 annual inspection baseline",
        frequencyLabel: "Annual",
        frequency: "annual"
      },
      {
        requirementKey: "control_valves_operate_properly",
        itemLabel: "Control valves operate properly",
        epLabel: "LS.02.01.35 EP 2",
        codeLabel: "NFPA 25 annual inspection baseline",
        frequencyLabel: "Annual",
        frequency: "annual"
      },
      {
        requirementKey: "supervisory_switches_operational",
        itemLabel: "Supervisory switches operational",
        epLabel: "LS.02.01.35 EP 2",
        codeLabel: "NFPA 25 annual inspection baseline",
        frequencyLabel: "Annual",
        frequency: "annual"
      },
      {
        requirementKey: "waterflow_devices_pass_test",
        itemLabel: "Waterflow devices pass test",
        epLabel: "LS.02.01.35 EP 2",
        codeLabel: "NFPA 25 annual inspection baseline",
        frequencyLabel: "Annual",
        frequency: "annual",
        photoRequiredWhenFailed: true
      },
      {
        requirementKey: "spare_heads_present_correct_type_quantity",
        itemLabel: "Spare heads present in correct quantity/type",
        epLabel: "LS.02.01.35 EP 2",
        codeLabel: "NFPA 25 annual inspection baseline",
        frequencyLabel: "Annual",
        frequency: "annual"
      },
      {
        requirementKey: "wrench_and_cabinet_present",
        itemLabel: "Wrench and cabinet present",
        epLabel: "LS.02.01.35 EP 2",
        codeLabel: "NFPA 25 annual inspection baseline",
        frequencyLabel: "Annual",
        frequency: "annual"
      },
      {
        requirementKey: "system_tag_present_and_updated",
        itemLabel: "System tag present and updated",
        epLabel: "LS.02.01.35 EP 2",
        codeLabel: "NFPA 25 annual inspection baseline",
        frequencyLabel: "Annual",
        frequency: "annual",
        photoRequiredWhenFailed: true
      },
      {
        requirementKey: "system_remains_in_service",
        itemLabel: "System remains in service",
        epLabel: "LS.02.01.35 EP 2",
        codeLabel: "NFPA 25 annual inspection baseline",
        frequencyLabel: "Annual",
        frequency: "annual"
      }
    ]
  }
};

export const jointCommissionSprinklerRequirementProfiles: JointCommissionSprinklerRequirementProfile[] = [tjc_nfpa25_2023_sprinkler];

export function buildJointCommissionSprinklerSeedRows(
  frequency: JointCommissionSprinklerFrequency,
  profileKey = "tjc_nfpa25_2023_sprinkler"
) {
  const profile = jointCommissionSprinklerRequirementProfiles.find((candidate) => candidate.key === profileKey) ?? tjc_nfpa25_2023_sprinkler;
  return profile.items[frequency].map((item) => ({
    requirementKey: item.requirementKey,
    requirementProfileKey: profile.key,
    requirementEditionLabel: profile.editionLabel,
    itemLabel: item.itemLabel,
    epLabel: item.epLabel,
    codeLabel: item.codeLabel,
    frequencyLabel: item.frequencyLabel,
    photoRequiredWhenFailed: item.photoRequiredWhenFailed ? "yes" : "no",
    result: "",
    comments: "",
    correctiveAction: "",
    photo: ""
  }));
}

export const wetSprinklerRequirementProfiles: WetSprinklerRequirementProfile[] = [
  nfpa25_2023_baseline
];

export function resolveWetSprinklerRequirementProfile(profileKey?: string | null) {
  return wetSprinklerRequirementProfiles.find((profile) => profile.key === profileKey) ?? nfpa25_2023_baseline;
}

export function buildWetSprinklerChecklistSeedRows(
  groupKey: WetSprinklerRequirementGroupKey,
  profileKey?: string | null
) {
  const profile = resolveWetSprinklerRequirementProfile(profileKey);
  return profile.items[groupKey].map((item) => ({
    requirementKey: item.requirementKey,
    itemLabel: item.itemLabel,
    referenceLabel: item.referenceLabel,
    frequencyLabel: item.frequencyLabel,
    groupKey: item.groupKey,
    requirementProfileKey: profile.key,
    requirementEditionLabel: profile.editionLabel,
    result: "",
    deficiencySeverity: item.defaultSeverity ?? "medium",
    deficiencyNotes: "",
    correctiveAction: "",
    comments: "",
    deficiencyPhoto: ""
  }));
}
