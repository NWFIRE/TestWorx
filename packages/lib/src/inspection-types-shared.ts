export const inspectionTypeRegistry = {
  fire_extinguisher: {
    label: "Fire Extinguisher",
    description: "Portable extinguisher inspection and service.",
    defaultRecurrenceFrequency: "ANNUAL"
  },
  fire_alarm: {
    label: "Fire Alarm",
    description: "Inspection and testing for the fire alarm system.",
    defaultRecurrenceFrequency: "ANNUAL"
  },
  wet_chemical_acceptance_test: {
    label: "Wet Chemical Acceptance Test",
    description: "Acceptance testing for wet chemical suppression systems.",
    defaultRecurrenceFrequency: "ONCE"
  },
  wet_fire_sprinkler: {
    label: "Wet Fire Sprinkler",
    description: "Annual wet sprinkler inspection and testing.",
    defaultRecurrenceFrequency: "ANNUAL"
  },
  joint_commission_fire_sprinkler: {
    label: "Joint Commission Fire Sprinkler",
    description: "Joint Commission-aligned sprinkler inspection.",
    defaultRecurrenceFrequency: "ANNUAL"
  },
  backflow: {
    label: "Backflow",
    description: "Certified backflow testing and documentation.",
    defaultRecurrenceFrequency: "ANNUAL"
  },
  fire_pump: {
    label: "Fire Pump",
    description: "Inspection and operational testing for fire pumps.",
    defaultRecurrenceFrequency: "ANNUAL"
  },
  dry_fire_sprinkler: {
    label: "Dry Fire Sprinkler",
    description: "Annual dry sprinkler inspection and testing.",
    defaultRecurrenceFrequency: "ANNUAL"
  },
  kitchen_suppression: {
    label: "Kitchen Suppression",
    description: "Semi-annual hood and kitchen suppression inspection.",
    defaultRecurrenceFrequency: "SEMI_ANNUAL"
  },
  industrial_suppression: {
    label: "Industrial Suppression",
    description: "Inspection for industrial suppression systems.",
    defaultRecurrenceFrequency: "ANNUAL"
  },
  emergency_exit_lighting: {
    label: "Emergency Exit Lighting",
    description: "Inspection and service for exit and emergency lighting.",
    defaultRecurrenceFrequency: "ANNUAL"
  },
  work_order: {
    label: "Work Order",
    description: "General service work not tied to an inspection template.",
    defaultRecurrenceFrequency: "ONCE"
  }
} as const;

export type BrowserInspectionType = keyof typeof inspectionTypeRegistry;
export type BrowserRecurrenceFrequency =
  | "ONCE"
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMI_ANNUAL"
  | "ANNUAL";

export function getDefaultInspectionRecurrenceFrequency(inspectionType: BrowserInspectionType): BrowserRecurrenceFrequency {
  return inspectionTypeRegistry[inspectionType].defaultRecurrenceFrequency;
}
