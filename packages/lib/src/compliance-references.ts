import type { InspectionType } from "@testworx/types";

export type ComplianceReference = {
  id: string;
  standardCode: string;
  editionYear: string;
  fullTitle: string;
  shortTitle: string;
  applicableReportTypes: InspectionType[];
  applicableInspectionSections: string[];
  chapterReferences: string[];
  tableReferences: string[];
  nfpaSections: string[];
  jointCommissionEPReferences: string[];
  complianceExplanation: string;
  applicabilityReason: string;
  displayOrder: number;
  active: boolean;
  jurisdictionOverrideSupport: boolean;
};

export type ComplianceReferenceSnapshot = Omit<ComplianceReference, "active" | "applicableReportTypes"> & {
  formattedReference: string;
  snapshotSource: "registry" | "historical_snapshot";
};

export type ComplianceSectionSnapshot = {
  title: string;
  generatedAt: string;
  sourceVersion: string;
  healthcareContext: boolean;
  inspectionType: InspectionType | string;
  references: ComplianceReferenceSnapshot[];
};

type ComplianceContext = {
  inspectionType: InspectionType | string;
  draft?: unknown;
  customerCompany?: Record<string, unknown> | null;
  site?: Record<string, unknown> | null;
  generatedAt?: Date | string | null;
};

const COMPLIANCE_SOURCE_VERSION = "2026-05-joint-commission-compliance-registry";
export const COMPLIANCE_SECTION_TITLE = "Applicable Codes, Standards & Compliance References";

const sprinklerTypes: InspectionType[] = ["wet_fire_sprinkler", "dry_fire_sprinkler", "joint_commission_fire_sprinkler"];
const allReportTypes: InspectionType[] = [
  "fire_extinguisher",
  "fire_alarm",
  "joint_commission_fire_alarm",
  "wet_chemical_acceptance_test",
  "wet_fire_sprinkler",
  "joint_commission_fire_sprinkler",
  "work_order",
  "backflow",
  "fire_pump",
  "dry_fire_sprinkler",
  "kitchen_suppression",
  "industrial_suppression",
  "emergency_exit_lighting"
];

export const complianceReferenceRegistry: ComplianceReference[] = [
  {
    id: "nfpa-25-2026",
    standardCode: "NFPA 25",
    editionYear: "2026",
    fullTitle: "Standard for the Inspection, Testing, and Maintenance of Water-Based Fire Protection Systems",
    shortTitle: "Water-Based Fire Protection ITM",
    applicableReportTypes: [...sprinklerTypes, "fire_pump", "backflow"],
    applicableInspectionSections: ["sprinklers", "valves", "main drains", "waterflow devices", "tamper devices", "fire pumps", "backflow prevention"],
    chapterReferences: ["Chapter 4 - Owner responsibilities and documentation", "Chapter 5 - Sprinkler systems", "Chapter 8 - Fire pumps", "Chapter 13 - Valves, main drains, and alarm devices"],
    tableReferences: ["Table 4.1 - Summary of inspection, testing, and maintenance frequencies", "Table 13.1.1.2 - Valves, main drains, and alarm device frequencies"],
    nfpaSections: ["4.1", "5.2", "8.3", "13.2", "13.3"],
    jointCommissionEPReferences: ["EC.02.03.05 EP1", "EC.02.03.05 EP2", "EC.02.03.05 EP9", "EC.02.03.05 EP10"],
    complianceExplanation: "Documents inspection, testing, maintenance, observed deficiencies, and required follow-up for water-based fire protection systems.",
    applicabilityReason: "This report includes water-based fire protection equipment, sprinkler system components, valves, supervisory devices, fire pumps, drains, or related maintenance documentation.",
    displayOrder: 10,
    active: true,
    jurisdictionOverrideSupport: true
  },
  {
    id: "nfpa-72-2025",
    standardCode: "NFPA 72",
    editionYear: "2025",
    fullTitle: "National Fire Alarm and Signaling Code",
    shortTitle: "Fire Alarm and Signaling",
    applicableReportTypes: ["fire_alarm", "joint_commission_fire_alarm", "wet_fire_sprinkler", "dry_fire_sprinkler", "joint_commission_fire_sprinkler", "kitchen_suppression", "industrial_suppression", "fire_pump"],
    applicableInspectionSections: ["fire alarm systems", "monitoring", "waterflow devices", "tamper switches", "alarm interfaces", "shutdown interfaces", "central station communication"],
    chapterReferences: ["Chapter 10 - Fundamentals", "Chapter 14 - Inspection, testing, and maintenance", "Chapter 23 - Protected premises systems", "Chapter 26 - Supervising station alarm systems"],
    tableReferences: ["Table 14.3.1 - Visual inspection frequencies", "Table 14.4.3.2 - Testing frequencies"],
    nfpaSections: ["10.6", "14.3", "14.4", "23.8", "26.3"],
    jointCommissionEPReferences: ["EC.02.03.05 EP1", "EC.02.03.05 EP2"],
    complianceExplanation: "Documents fire alarm inspection, testing, signaling, monitoring, and interface results in a review-ready format.",
    applicabilityReason: "This report includes fire alarm devices, central station communication, supervisory signals, waterflow/tamper monitoring, or suppression system alarm interface testing.",
    displayOrder: 20,
    active: true,
    jurisdictionOverrideSupport: true
  },
  {
    id: "nfpa-17a-2024",
    standardCode: "NFPA 17A",
    editionYear: "2024",
    fullTitle: "Standard for Wet Chemical Extinguishing Systems",
    shortTitle: "Wet Chemical Extinguishing Systems",
    applicableReportTypes: ["kitchen_suppression", "wet_chemical_acceptance_test"],
    applicableInspectionSections: ["wet chemical systems", "cylinders", "nozzles", "fusible links", "manual pull stations", "fuel shutdowns", "acceptance testing"],
    chapterReferences: ["Chapter 4 - General requirements", "Chapter 5 - System requirements", "Chapter 6 - Inspection, maintenance, and recharging", "Chapter 7 - Acceptance testing"],
    tableReferences: ["Inspection and maintenance frequency tables as adopted by the AHJ"],
    nfpaSections: ["4.1", "5.1", "6.1", "7.1"],
    jointCommissionEPReferences: ["EC.02.03.05"],
    complianceExplanation: "Documents inspection and functional verification for wet chemical extinguishing systems and related kitchen protection equipment.",
    applicabilityReason: "This report includes kitchen suppression or wet chemical acceptance testing activities regulated by wet chemical extinguishing system requirements.",
    displayOrder: 30,
    active: true,
    jurisdictionOverrideSupport: true
  },
  {
    id: "nfpa-96-2024",
    standardCode: "NFPA 96",
    editionYear: "2024",
    fullTitle: "Standard for Ventilation Control and Fire Protection of Commercial Cooking Operations",
    shortTitle: "Commercial Cooking Ventilation and Fire Protection",
    applicableReportTypes: ["kitchen_suppression", "wet_chemical_acceptance_test"],
    applicableInspectionSections: ["hoods", "ducts", "plenums", "appliances", "commercial cooking operations", "grease removal systems"],
    chapterReferences: ["Chapter 4 - General requirements", "Chapter 11 - Procedures for inspection, testing, and maintenance"],
    tableReferences: ["Cleaning frequency tables as adopted by the AHJ"],
    nfpaSections: ["4.1", "11.2", "11.4", "11.6"],
    jointCommissionEPReferences: ["EC.02.03.05"],
    complianceExplanation: "Documents commercial cooking fire protection context including hood, appliance, duct, and cleaning-related observations.",
    applicabilityReason: "This report includes kitchen hood, appliance coverage, duct/plenum, or commercial cooking fire protection observations.",
    displayOrder: 40,
    active: true,
    jurisdictionOverrideSupport: true
  },
  {
    id: "nfpa-17-2024",
    standardCode: "NFPA 17",
    editionYear: "2024",
    fullTitle: "Standard for Dry Chemical Extinguishing Systems",
    shortTitle: "Dry Chemical Extinguishing Systems",
    applicableReportTypes: ["industrial_suppression"],
    applicableInspectionSections: ["industrial dry chemical systems", "cylinders", "actuators", "nozzles", "shutdowns", "interfaces"],
    chapterReferences: ["Chapter 4 - General requirements", "Chapter 5 - System requirements", "Chapter 6 - Inspection, maintenance, and recharging"],
    tableReferences: ["Inspection and maintenance frequency tables as adopted by the AHJ"],
    nfpaSections: ["4.1", "5.1", "6.1"],
    jointCommissionEPReferences: ["EC.02.03.05"],
    complianceExplanation: "Documents inspection and verification for dry chemical suppression systems, including detection, actuation, agent, and protected hazard observations.",
    applicabilityReason: "This report includes industrial dry chemical suppression equipment and protected-hazard verification.",
    displayOrder: 50,
    active: true,
    jurisdictionOverrideSupport: true
  },
  {
    id: "nfpa-10-2026",
    standardCode: "NFPA 10",
    editionYear: "2026",
    fullTitle: "Standard for Portable Fire Extinguishers",
    shortTitle: "Portable Fire Extinguishers",
    applicableReportTypes: ["fire_extinguisher"],
    applicableInspectionSections: ["portable extinguishers", "placement", "condition", "service", "recharge", "hydrostatic testing"],
    chapterReferences: ["Chapter 6 - Installation", "Chapter 7 - Inspection, maintenance, and recharging", "Chapter 8 - Hydrostatic testing"],
    tableReferences: ["Inspection, maintenance, and hydrostatic test interval tables as adopted by the AHJ"],
    nfpaSections: ["6.1", "7.2", "7.3", "8.1"],
    jointCommissionEPReferences: ["EC.02.03.05"],
    complianceExplanation: "Documents extinguisher location, condition, service, recharge, and follow-up requirements for portable extinguisher compliance records.",
    applicabilityReason: "This report includes portable fire extinguisher inspection, service, recharge, placement, or corrective action documentation.",
    displayOrder: 60,
    active: true,
    jurisdictionOverrideSupport: true
  },
  {
    id: "nfpa-101-2024",
    standardCode: "NFPA 101",
    editionYear: "2024",
    fullTitle: "Life Safety Code",
    shortTitle: "Life Safety Code",
    applicableReportTypes: ["fire_alarm", "joint_commission_fire_alarm", "fire_extinguisher", "emergency_exit_lighting", "work_order"],
    applicableInspectionSections: ["life safety", "means of egress", "emergency lighting", "exit signs", "occupancy protection", "fire alarm interfaces"],
    chapterReferences: ["Chapter 7 - Means of egress", "Chapter 9 - Building service and fire protection equipment", "Occupancy chapters as adopted by the AHJ"],
    tableReferences: ["Means of egress and inspection frequency tables as adopted by the AHJ"],
    nfpaSections: ["7.9", "7.10", "9.6"],
    jointCommissionEPReferences: ["EC.02.03.05", "EC.02.05.07"],
    complianceExplanation: "Documents life safety features and fire protection interfaces that support occupancy safety and egress readiness.",
    applicabilityReason: "This report includes life safety, egress, emergency lighting, exit signage, occupancy, or fire alarm system readiness documentation.",
    displayOrder: 70,
    active: true,
    jurisdictionOverrideSupport: true
  },
  {
    id: "nfpa-70-2026",
    standardCode: "NFPA 70",
    editionYear: "2026",
    fullTitle: "National Electrical Code",
    shortTitle: "Electrical Installations",
    applicableReportTypes: ["fire_alarm", "joint_commission_fire_alarm", "emergency_exit_lighting", "work_order"],
    applicableInspectionSections: ["electrical interfaces", "emergency lighting", "exit signs", "fire alarm circuits", "power supplies"],
    chapterReferences: ["Chapter 1 - General", "Chapter 3 - Wiring methods and materials", "Article 700 - Emergency systems", "Article 760 - Fire alarm systems"],
    tableReferences: ["Electrical tables as adopted by the AHJ"],
    nfpaSections: ["110", "300", "700", "760"],
    jointCommissionEPReferences: ["EC.02.05.07"],
    complianceExplanation: "Documents electrical interface, wiring, power supply, and emergency power considerations relevant to inspected fire and life safety systems.",
    applicabilityReason: "This report includes electrical interfaces, fire alarm circuits, emergency lighting, exit signs, or equipment power-supply observations.",
    displayOrder: 80,
    active: true,
    jurisdictionOverrideSupport: true
  },
  {
    id: "nfpa-13-2025",
    standardCode: "NFPA 13",
    editionYear: "2025",
    fullTitle: "Standard for the Installation of Sprinkler Systems",
    shortTitle: "Sprinkler System Installation",
    applicableReportTypes: [...sprinklerTypes, "fire_pump"],
    applicableInspectionSections: ["sprinkler system configuration", "protected areas", "hazard classification", "system design context"],
    chapterReferences: ["Chapter 4 - General requirements", "Chapter 8 - System types and requirements", "Chapter 9 - Sprinklers", "Chapter 16 - Installation requirements"],
    tableReferences: ["Design and installation tables as adopted by the AHJ"],
    nfpaSections: ["4.1", "8.2", "9.1", "16.1"],
    jointCommissionEPReferences: ["EC.02.03.05"],
    complianceExplanation: "Provides installation and design context for sprinkler system conditions documented during inspection and testing.",
    applicabilityReason: "This report includes sprinkler system installation context, protected area observations, system configuration, or design-related deficiency documentation.",
    displayOrder: 90,
    active: true,
    jurisdictionOverrideSupport: true
  },
  {
    id: "nfpa-20-2025",
    standardCode: "NFPA 20",
    editionYear: "2025",
    fullTitle: "Standard for the Installation of Stationary Pumps for Fire Protection",
    shortTitle: "Fire Pump Installation",
    applicableReportTypes: ["fire_pump"],
    applicableInspectionSections: ["fire pumps", "pump controllers", "drivers", "pump rooms", "water supply"],
    chapterReferences: ["Chapter 4 - General requirements", "Chapter 7 - Pumps", "Chapter 10 - Electric-drive controllers"],
    tableReferences: ["Fire pump installation tables as adopted by the AHJ"],
    nfpaSections: ["4.1", "7.1", "10.1"],
    jointCommissionEPReferences: ["EC.02.03.05"],
    complianceExplanation: "Provides installation and equipment context for fire pump inspection, testing, and maintenance records.",
    applicabilityReason: "This report includes fire pump, controller, driver, or fire pump room observations.",
    displayOrder: 100,
    active: true,
    jurisdictionOverrideSupport: true
  },
  {
    id: "ahj-cross-connection-current",
    standardCode: "AHJ Backflow / Cross-Connection Program",
    editionYear: "Current",
    fullTitle: "Authority Having Jurisdiction Backflow Prevention and Cross-Connection Control Requirements",
    shortTitle: "Backflow Prevention Requirements",
    applicableReportTypes: ["backflow"],
    applicableInspectionSections: ["backflow prevention", "cross-connection control", "test results", "device certification"],
    chapterReferences: ["Local ordinance and AHJ-adopted backflow requirements"],
    tableReferences: ["AHJ test frequency and device requirements"],
    nfpaSections: [],
    jointCommissionEPReferences: ["EC.02.03.05"],
    complianceExplanation: "Documents backflow prevention test results and device status for AHJ review and customer compliance records.",
    applicabilityReason: "This report includes backflow prevention testing or cross-connection control documentation.",
    displayOrder: 110,
    active: true,
    jurisdictionOverrideSupport: true
  },
  {
    id: "general-fire-life-safety-current",
    standardCode: "Fire and Life Safety Work Documentation",
    editionYear: "Current",
    fullTitle: "Applicable Fire and Life Safety Work Documentation Requirements",
    shortTitle: "Fire and Life Safety Work Documentation",
    applicableReportTypes: allReportTypes,
    applicableInspectionSections: ["work performed", "deficiencies", "follow-up actions", "service documentation"],
    chapterReferences: ["Customer scope, AHJ requirements, and manufacturer instructions applicable to the work performed"],
    tableReferences: [],
    nfpaSections: [],
    jointCommissionEPReferences: ["EC.02.03.05"],
    complianceExplanation: "Provides a general documentation baseline for work performed, deficiencies observed, and follow-up actions recommended.",
    applicabilityReason: "This reference supports audit-ready documentation for field service activity when a more specific system standard is supplemented by work-order scope.",
    displayOrder: 900,
    active: true,
    jurisdictionOverrideSupport: true
  }
];

function isInspectionType(value: string): value is InspectionType {
  return (allReportTypes as string[]).includes(value);
}

function readDraftSnapshot(draft: unknown): ComplianceSectionSnapshot | null {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    return null;
  }
  const snapshot = (draft as { complianceSnapshot?: unknown }).complianceSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  const references = (snapshot as { references?: unknown }).references;
  if (!Array.isArray(references) || references.length === 0) {
    return null;
  }
  return snapshot as ComplianceSectionSnapshot;
}

function collectSearchText(value: unknown, output: string[] = [], depth = 0) {
  if (depth > 4 || value === null || value === undefined) {
    return output;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    output.push(String(value));
    return output;
  }
  if (Array.isArray(value)) {
    value.slice(0, 40).forEach((item) => collectSearchText(item, output, depth + 1));
    return output;
  }
  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).slice(0, 80).forEach((item) => collectSearchText(item, output, depth + 1));
  }
  return output;
}

export function formatNFPAReference(reference: Pick<ComplianceReference, "standardCode" | "editionYear" | "fullTitle">) {
  const edition = reference.editionYear.trim().toLowerCase() === "current" ? "Current Edition" : `${reference.editionYear} Edition`;
  return `${reference.standardCode} (${edition}) - ${reference.fullTitle}`;
}

export function isHealthcareComplianceContext(input: ComplianceContext) {
  if (String(input.inspectionType).includes("joint_commission")) {
    return true;
  }

  const text = collectSearchText([input.customerCompany, input.site, input.draft]).join(" ").toLowerCase();
  return /\b(hospital|healthcare|health care|medical|clinic|surgery|ambulatory|nursing|rehab|rehabilitation|assisted living|long term care|life care|health center|joint commission|cms)\b/.test(text);
}

export function getApplicableStandardsForReport(input: ComplianceContext) {
  const inspectionType = String(input.inspectionType);
  const standards = complianceReferenceRegistry
    .filter((reference) => reference.active)
    .filter((reference) => reference.applicableReportTypes.includes(inspectionType as InspectionType))
    .filter((reference) => reference.id !== "general-fire-life-safety-current" || inspectionType === "work_order")
    .sort((left, right) => left.displayOrder - right.displayOrder);

  if (standards.length > 0) {
    return standards;
  }

  return complianceReferenceRegistry
    .filter((reference) => reference.active && reference.id === "general-fire-life-safety-current")
    .sort((left, right) => left.displayOrder - right.displayOrder);
}

export function buildJointCommissionReferences(input: ComplianceContext) {
  if (!isHealthcareComplianceContext(input)) {
    return [];
  }

  const refs = new Set<string>();
  for (const reference of getApplicableStandardsForReport(input)) {
    for (const ep of reference.jointCommissionEPReferences) {
      refs.add(ep);
    }
  }

  if (refs.size === 0) {
    refs.add("EC.02.03.05");
  }

  return [...refs].map((reference) => `Joint Commission ${reference} - Fire and life safety systems are maintained, tested, and documented according to applicable NFPA requirements.`);
}

function toSnapshot(reference: ComplianceReference, source: ComplianceReferenceSnapshot["snapshotSource"]): ComplianceReferenceSnapshot {
  const { active: _active, applicableReportTypes: _types, ...snapshot } = reference;
  return {
    ...snapshot,
    formattedReference: formatNFPAReference(reference),
    snapshotSource: source
  };
}

export function buildComplianceSection(input: ComplianceContext): ComplianceSectionSnapshot {
  const historical = readDraftSnapshot(input.draft);
  if (historical) {
    return {
      ...historical,
      references: historical.references.map((reference) => ({
        ...reference,
        snapshotSource: reference.snapshotSource ?? "historical_snapshot"
      }))
    };
  }

  const healthcareContext = isHealthcareComplianceContext(input);
  const references = getApplicableStandardsForReport(input).map((reference) => {
    const snapshot = toSnapshot(reference, "registry");
    return healthcareContext
      ? snapshot
      : { ...snapshot, jointCommissionEPReferences: [] };
  });

  const generatedAt = input.generatedAt instanceof Date
    ? input.generatedAt
    : typeof input.generatedAt === "string" && input.generatedAt.trim()
      ? new Date(input.generatedAt)
      : new Date();

  return {
    title: COMPLIANCE_SECTION_TITLE,
    generatedAt: Number.isNaN(generatedAt.getTime()) ? new Date().toISOString() : generatedAt.toISOString(),
    sourceVersion: COMPLIANCE_SOURCE_VERSION,
    healthcareContext,
    inspectionType: isInspectionType(String(input.inspectionType)) ? input.inspectionType : String(input.inspectionType),
    references
  };
}

export function snapshotComplianceReferences<T extends Record<string, unknown>>(draft: T, input: Omit<ComplianceContext, "draft">): T & { complianceSnapshot: ComplianceSectionSnapshot } {
  return {
    ...draft,
    complianceSnapshot: buildComplianceSection({ ...input, draft })
  };
}

export function formatComplianceReferenceList(input: ComplianceContext) {
  return buildComplianceSection(input).references.map((reference) => reference.formattedReference);
}
