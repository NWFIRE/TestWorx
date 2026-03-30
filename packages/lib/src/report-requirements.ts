export type WetSprinklerRequirementFrequency = "weekly" | "monthly" | "quarterly";

export type WetSprinklerRequirementItem = {
  requirementKey: string;
  itemLabel: string;
  referenceLabel: string;
  frequency: WetSprinklerRequirementFrequency;
  defaultSeverity?: "low" | "medium" | "high" | "critical";
};

export type WetSprinklerRequirementProfile = {
  key: string;
  label: string;
  editionLabel: string;
  description: string;
  items: Record<WetSprinklerRequirementFrequency, WetSprinklerRequirementItem[]>;
};

const nfpa25_2023_baseline: WetSprinklerRequirementProfile = {
  key: "nfpa25_2023_baseline",
  label: "NFPA 25 (2023 baseline)",
  editionLabel: "2023 baseline",
  description: "Baseline weekly, monthly, and quarterly wet-pipe inspection checkpoints aligned to the current TradeWorx wet sprinkler workflow. Extend or swap this profile when a local AHJ adopts a different edition or amendment package.",
  items: {
    weekly: [
      {
        requirementKey: "weekly_control_valves_open",
        itemLabel: "Verify control valves are in the normal open position and secured, locked, or electronically supervised as required.",
        referenceLabel: "NFPA 25 weekly wet-pipe inspection baseline",
        frequency: "weekly",
        defaultSeverity: "high"
      },
      {
        requirementKey: "weekly_gauges_normal",
        itemLabel: "Confirm gauges indicate normal water supply and system pressure conditions with no abnormal fluctuation observed.",
        referenceLabel: "NFPA 25 weekly wet-pipe inspection baseline",
        frequency: "weekly",
        defaultSeverity: "medium"
      },
      {
        requirementKey: "weekly_riser_room_condition",
        itemLabel: "Inspect riser / valve room for leakage, corrosion, physical damage, freezing exposure, and general accessibility concerns.",
        referenceLabel: "NFPA 25 weekly wet-pipe inspection baseline",
        frequency: "weekly",
        defaultSeverity: "high"
      }
    ],
    monthly: [
      {
        requirementKey: "monthly_sprinklers_condition",
        itemLabel: "Inspect accessible sprinklers for loading, corrosion, paint, damage, or obstruction to discharge patterns.",
        referenceLabel: "NFPA 25 monthly wet-pipe inspection baseline",
        frequency: "monthly",
        defaultSeverity: "high"
      },
      {
        requirementKey: "monthly_pipe_hangers_condition",
        itemLabel: "Inspect visible piping, fittings, hangers, and seismic bracing for leaks, damage, loose supports, and impact concerns.",
        referenceLabel: "NFPA 25 monthly wet-pipe inspection baseline",
        frequency: "monthly",
        defaultSeverity: "high"
      },
      {
        requirementKey: "monthly_spare_heads",
        itemLabel: "Verify spare sprinklers and the proper sprinkler wrench are provided, protected, and available at the site.",
        referenceLabel: "NFPA 25 monthly wet-pipe inspection baseline",
        frequency: "monthly",
        defaultSeverity: "medium"
      },
      {
        requirementKey: "monthly_fdc_access",
        itemLabel: "Inspect the fire department connection for accessibility, visible condition, caps / plugs, signage, and protection from damage.",
        referenceLabel: "NFPA 25 monthly wet-pipe inspection baseline",
        frequency: "monthly",
        defaultSeverity: "medium"
      }
    ],
    quarterly: [
      {
        requirementKey: "quarterly_waterflow_test",
        itemLabel: "Perform and document waterflow alarm operation, including local indication and remote signal transmission where applicable.",
        referenceLabel: "NFPA 25 quarterly wet-pipe testing baseline",
        frequency: "quarterly",
        defaultSeverity: "high"
      },
      {
        requirementKey: "quarterly_supervisory_test",
        itemLabel: "Verify valve supervisory or tamper signal operation and confirm transmission to the supervising station when applicable.",
        referenceLabel: "NFPA 25 quarterly wet-pipe testing baseline",
        frequency: "quarterly",
        defaultSeverity: "high"
      },
      {
        requirementKey: "quarterly_main_drain",
        itemLabel: "Conduct the main drain test, compare to prior records when available, and note any adverse change in supply conditions.",
        referenceLabel: "NFPA 25 quarterly wet-pipe testing baseline",
        frequency: "quarterly",
        defaultSeverity: "high"
      },
      {
        requirementKey: "quarterly_valve_housekeeping",
        itemLabel: "Confirm valve identification, access, signage, and physical readiness at each wet system riser or control valve assembly.",
        referenceLabel: "NFPA 25 quarterly wet-pipe inspection baseline",
        frequency: "quarterly",
        defaultSeverity: "medium"
      }
    ]
  }
};

export const wetSprinklerRequirementProfiles: WetSprinklerRequirementProfile[] = [
  nfpa25_2023_baseline
];

export function resolveWetSprinklerRequirementProfile(profileKey?: string | null) {
  return wetSprinklerRequirementProfiles.find((profile) => profile.key === profileKey) ?? nfpa25_2023_baseline;
}

export function buildWetSprinklerChecklistSeedRows(
  frequency: WetSprinklerRequirementFrequency,
  profileKey?: string | null
) {
  const profile = resolveWetSprinklerRequirementProfile(profileKey);
  return profile.items[frequency].map((item) => ({
    requirementKey: item.requirementKey,
    itemLabel: item.itemLabel,
    referenceLabel: item.referenceLabel,
    frequency: item.frequency,
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
