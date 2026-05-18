import type { InspectionType } from "@testworx/types";

import { formatComplianceReferenceList } from "../compliance-references";

export const reportComplianceMap: Partial<Record<InspectionType, string[]>> = {
  fire_alarm: formatComplianceReferenceList({ inspectionType: "fire_alarm" }),
  joint_commission_fire_alarm: formatComplianceReferenceList({ inspectionType: "joint_commission_fire_alarm" }),
  joint_commission_fire_sprinkler: formatComplianceReferenceList({ inspectionType: "joint_commission_fire_sprinkler" }),
  wet_chemical_acceptance_test: formatComplianceReferenceList({ inspectionType: "wet_chemical_acceptance_test" }),
  kitchen_suppression: formatComplianceReferenceList({ inspectionType: "kitchen_suppression" }),
  industrial_suppression: formatComplianceReferenceList({ inspectionType: "industrial_suppression" }),
  fire_extinguisher: formatComplianceReferenceList({ inspectionType: "fire_extinguisher" }),
  wet_fire_sprinkler: formatComplianceReferenceList({ inspectionType: "wet_fire_sprinkler" }),
  dry_fire_sprinkler: formatComplianceReferenceList({ inspectionType: "dry_fire_sprinkler" }),
  fire_pump: formatComplianceReferenceList({ inspectionType: "fire_pump" }),
  emergency_exit_lighting: formatComplianceReferenceList({ inspectionType: "emergency_exit_lighting" }),
  backflow: formatComplianceReferenceList({ inspectionType: "backflow" }),
  work_order: formatComplianceReferenceList({ inspectionType: "work_order" })
};

export function resolveComplianceCodes(type: InspectionType, codes?: string[]) {
  return (codes && codes.length > 0 ? codes : reportComplianceMap[type] ?? []).filter(Boolean);
}
