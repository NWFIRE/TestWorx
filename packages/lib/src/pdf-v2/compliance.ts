import type { InspectionType } from "@testworx/types";

export const reportComplianceMap: Partial<Record<InspectionType, string[]>> = {
  fire_alarm: ["NFPA 72", "NFPA 70"],
  wet_chemical_acceptance_test: ["NFPA 17A"],
  kitchen_suppression: ["NFPA 17A", "NFPA 96"],
  fire_extinguisher: ["NFPA 10"]
};

export function resolveComplianceCodes(type: InspectionType, codes?: string[]) {
  return (codes && codes.length > 0 ? codes : reportComplianceMap[type] ?? []).filter(Boolean);
}
