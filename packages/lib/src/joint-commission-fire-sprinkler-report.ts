import type { ReportFieldDefinition, ReportSectionDefinition, ReportTemplateDefinition } from "./report-config";

type RowField = Exclude<ReportFieldDefinition, { type: "repeater" }>;

const yesNoNAField = (id: string, label: string): RowField => ({
  id,
  label,
  type: "select",
  optionProvider: "yesNoNA"
});

const passFailNAField = (id: string, label: string): RowField => ({
  id,
  label,
  type: "select",
  optionProvider: "passFailNA"
});

const textField = (id: string, label: string, placeholder?: string): RowField => ({
  id,
  label,
  type: "text",
  ...(placeholder ? { placeholder } : {})
});

const matrixMonths = [
  ["apr", "Apr"],
  ["may", "May"],
  ["jun", "Jun"],
  ["jul", "Jul"],
  ["aug", "Aug"],
  ["sep", "Sep"],
  ["oct", "Oct"],
  ["nov", "Nov"],
  ["dec", "Dec"],
  ["jan", "Jan"],
  ["feb", "Feb"],
  ["mar", "Mar"]
] as const;

const summaryDashboardRows = [
  { inspectionArea: "Supervisory Signals", epStandard: "EP1 / NFPA 72 / NFPA 25", result: "", details: "" },
  { inspectionArea: "Valve Tamper & Control Valves", epStandard: "EP2 / NFPA 25 13.2.6", result: "", details: "" },
  { inspectionArea: "Waterflow Switches", epStandard: "EP2 / NFPA 25 13.2.6", result: "", details: "" },
  { inspectionArea: "Main Drain Test", epStandard: "EP9 / NFPA 25", result: "", details: "" },
  { inspectionArea: "Fire Department Connection", epStandard: "EP10 / NFPA 25", result: "", details: "" },
  { inspectionArea: "Deficiencies", epStandard: "Inspection Comments", result: "", details: "" }
];

const testingMatrixRows = [
  {
    deviceCategory: "Fire Alarm and Detection Equipment",
    deviceActivity: "Supervisory signals except tamper switches",
    ep: "1",
    frequency: "Quarterly"
  },
  {
    deviceCategory: "Fire Alarm and Detection Equipment",
    deviceActivity: "Water Flow Devices",
    ep: "2",
    frequency: "Quarterly"
  },
  {
    deviceCategory: "Automatic Extinguishing Equipment",
    deviceActivity: "Main Drains at all system risers",
    ep: "9",
    frequency: "Quarterly"
  },
  {
    deviceCategory: "Automatic Extinguishing Equipment",
    deviceActivity: "Fire Department Connections",
    ep: "10",
    frequency: "Quarterly"
  }
];

const sprinklerOverviewSourceRows: Array<[string, string]> = [
  ["General - Owner", "Changes in occupancy, machinery, or operations since last inspection?"],
  ["General - Owner", "Changes or repairs to fire protection systems since last inspection?"],
  ["General - Owner", "If fire occurred since last inspection, damaged sprinkler components replaced?"],
  ["General - Owner", "Dry system piping checked for proper pitch within past five years?"],
  ["General - Owner", "Piping checked for obstructive materials?"],
  ["General - Owner", "Fire pumps tested to full capacity within past 12 months?"],
  ["General - Owner", "Gravity, surface, or pressure tanks protected from freezing?"],
  ["General - Owner", "Sprinklers 50 years old or older?"],
  ["General - Owner", "Extra high temperature solder sprinklers exposed near 300°F?"],
  ["General - Owner", "Alarm/check valves and trim internally inspected in past 5 years?"],
  ["General - Owner", "Gauges compared to calibrated gauge or replaced in last 5 years?"],
  ["Standpipe 5-Year", "Dry standpipe hydrostatic test / flow test / hose hydro / pressure valve tests"],
  ["Inspector", "Sprinkler systems extended to visible areas of building?"],
  ["Inspector", "Proper clearance between storage and sprinkler deflector?"],
  ["Inspector", "Sprinkler heads generally in good external condition?"],
  ["Inspector", "Sprinkler heads free of corrosion, paint, loading, visible obstruction?"],
  ["Inspector", "Extra sprinkler heads available in head box at riser?"],
  ["Inspector", "Piping, drains, valves, hangers, gauges, sprinklers, strainers satisfactory?"],
  ["Inspector", "Pump shaft alignment/coupling inspected for damage?"],
  ["Occupancy / Equipment Changes", "List changes advised by owner in Section 1A"],
  ["Control Valves", "Main and other valves in appropriate open/closed position"],
  ["Control Valves", "All control valves sealed or supervised in open position"],
  ["Control Valves", "All control valves fully exercised"],
  ["Control Valves", "Any control valves leaking or abnormal/damaged?"],
  ["Water Supplies", "Water supply source"]
];

const sprinklerOverviewRows = sprinklerOverviewSourceRows.map(([area, question]) => ({ area, question, responseDate: "" }));

const tanksPumpsFdcSourceRows: Array<[string, string]> = [
  ["Tanks / Pumps / FDC", "Fire pumps, gravity, surface, or pressure tanks in good external condition?"],
  ["Tanks / Pumps / FDC", "Gravity/surface/pressure tanks at proper pressure/water levels?"],
  ["Tanks / Pumps / FDC", "Storage tank internally inspected in last 3 years unlined or 5 years lined?"],
  ["Tanks / Pumps / FDC", "Fire department connections satisfactory, couplings free, caps/plugs in place, check valves tight?"],
  ["Tanks / Pumps / FDC", "Fire department connections visible and accessible?"],
  ["Tanks / Pumps / FDC", "Pump runs on auxiliary/emergency power?"],
  ["Wet Systems", "System description"],
  ["Wet Systems", "Number of systems"],
  ["Wet Systems", "Cold weather valves in appropriate open/closed position?"],
  ["Wet Systems", "If closed, has piping been drained?"],
  ["Wet Systems", "Owner advised cold weather valves not recommended by NFPA?"],
  ["Wet Systems", "All antifreeze systems tested?"],
  ["Wet Systems", "Date antifreeze systems tested"],
  ["Wet Systems", "Antifreeze protection"],
  ["Wet Systems", "Alarm valves, waterflow indicators, and retards tested satisfactorily?"],
  ["Dry Systems", "Number of systems"],
  ["Dry Systems", "Make and model"],
  ["Dry Systems", "Trip test fields"],
  ["Dry Systems", "Air pressure / compressor / low points / quick opening / dry valves / freezing protection / heated house"],
  ["Special Systems", "Number of systems"],
  ["Special Systems", "Make/model/type/device/test/auxiliary equipment/location/results"],
  ["Alarms", "Water motors and gong operated during testing?"],
  ["Alarms", "Electric alarms operated during testing?"],
  ["Alarms", "Supervisory alarms operated during testing?"]
];

const tanksPumpsFdcRows = tanksPumpsFdcSourceRows.map(([area, inspectionItem]) => ({ area, inspectionItem, responseDetail: "" }));

const deficiencyRows = [
  "EP1",
  "EP2",
  "EP3",
  "EP4",
  "EP5",
  "EP9",
  "EP10",
  "EP11",
  "EP19",
  "EP20",
  "Devices with no EP",
  "Sprinkler",
  "Fire Alarm"
].map((systemEp) => ({ systemEp, status: "No deficiency listed", notes: "", photo: "" }));

const dashboardRowFields: RowField[] = [
  textField("inspectionArea", "Inspection Area"),
  textField("epStandard", "EP / Standard"),
  textField("result", "Result", "PASS, Documented, None, or short status"),
  textField("details", "Details")
];

const matrixRowFields: RowField[] = [
  textField("deviceCategory", "Device Category"),
  textField("deviceActivity", "Device / Activity"),
  textField("ep", "EP"),
  textField("frequency", "Frequency"),
  ...matrixMonths.map(([id, label]) => textField(id, label, "Date or result"))
];

const simpleChecklistRowFields: RowField[] = [
  textField("area", "Area"),
  textField("question", "Question / Record"),
  textField("responseDate", "Response / Date", "Yes, No, N/A, date, or short detail")
];

const systemDetailRowFields: RowField[] = [
  textField("area", "Area"),
  textField("inspectionItem", "Inspection Item"),
  textField("responseDetail", "Response / Detail", "Yes, No, N/A, date, quantity, or short detail")
];

const section = (definition: ReportSectionDefinition) => definition;

export const jointCommissionFireSprinklerReportTemplate: ReportTemplateDefinition = {
  label: "Joint Commission fire sprinkler",
  description: "Simple field-technician Joint Commission fire sprinkler inspection report modeled after NW Fire & Safety's healthcare compliance packet.",
  pdf: {
    subtitle: "Joint Commission Fire Sprinkler Inspection Report",
    nfpaReferences: ["NFPA 25", "NFPA 72", "Joint Commission EC.02.03.05"]
  },
  sections: [
    section({
      id: "report-info",
      label: "Header / Report Info",
      description: "Capture the customer, date, technician, license, company, and scope shown at the top of the printed compliance packet.",
      fields: [
        { id: "facilityCustomer", label: "Facility / customer", type: "text", readOnly: true, prefill: [{ source: "siteDefault", key: "customerName" }] },
        { id: "facilityAddress", label: "Facility address", type: "text", readOnly: true, prefill: [{ source: "siteDefault", key: "siteAddress" }, { source: "siteDefault", key: "siteName" }] },
        { id: "reportType", label: "Report type", type: "text", prefill: [{ source: "reportDefault", value: "Quarterly Joint Commission Fire Sprinkler Inspection Report" }] },
        { id: "inspectionDate", label: "Inspection date", type: "text", readOnly: true, prefill: [{ source: "siteDefault", key: "scheduledDate" }] },
        { id: "technician", label: "Technician", type: "text", placeholder: "Technician name" },
        { id: "technicianLicense", label: "Technician license", type: "text", placeholder: "License or certification number" },
        { id: "companyName", label: "Company name", type: "text", readOnly: true, prefill: [{ source: "tenantBranding", key: "legalBusinessName" }, { source: "tenantBranding", key: "name" }] },
        { id: "companyAddress", label: "Company address", type: "text", readOnly: true, prefill: [{ source: "tenantBranding", key: "addressLine1" }] },
        { id: "companyPhone", label: "Company phone", type: "text", readOnly: true, prefill: [{ source: "tenantBranding", key: "phone" }] },
        { id: "companyLicense", label: "Company license", type: "text", placeholder: "OK Lic #466, AC441117" },
        { id: "reportScope", label: "Report scope", type: "text", prefill: [{ source: "reportDefault", value: "Fire safety maintenance matrix, sprinkler inspection checklist, supervisory signals, valve tamper/control valves, waterflow switches, main drain test, FDC inspection, deficiencies, and certification." }] },
        { id: "tagStatus", label: "System tagged", type: "text", placeholder: "Quarterly, Annual, Green, Yellow, Red, or other tag status", requiredForFinalization: true }
      ]
    }),
    section({
      id: "executive-summary",
      label: "Executive Inspection Summary",
      description: "Simple field/value summary matching the first page of the printed report.",
      fields: [
        { id: "summaryCustomerFacility", label: "Customer / Facility", type: "text", readOnly: true, prefill: [{ source: "siteDefault", key: "customerName" }] },
        { id: "summaryReportType", label: "Report Type", type: "text", prefill: [{ source: "reportDefault", value: "Quarterly Joint Commission Fire Sprinkler Inspection Report" }] },
        { id: "summaryInspectionDate", label: "Inspection Date", type: "text", readOnly: true, prefill: [{ source: "siteDefault", key: "scheduledDate" }] },
        { id: "summaryTechnician", label: "Technician", type: "text", placeholder: "Technician name" },
        { id: "summaryTechnicianLicense", label: "Technician License", type: "text", placeholder: "License or certification number" },
        { id: "summaryCompany", label: "Company", type: "text", readOnly: true, prefill: [{ source: "tenantBranding", key: "legalBusinessName" }, { source: "tenantBranding", key: "name" }] },
        { id: "summaryReportScope", label: "Report Scope", type: "text", prefill: [{ source: "reportDefault", value: "Fire safety maintenance matrix, sprinkler inspection checklist, supervisory signals, valve tamper/control valves, waterflow switches, main drain test, FDC inspection, deficiencies, and certification." }] }
      ]
    }),
    section({
      id: "summary-dashboard",
      label: "Summary Dashboard",
      description: "Quick field summary of each inspection area, EP/standard, result, and details.",
      fields: [
        {
          id: "dashboardRows",
          label: "Summary Dashboard",
          type: "repeater",
          addLabel: "Add summary row",
          seedRows: summaryDashboardRows,
          rowFields: dashboardRowFields
        }
      ]
    }),
    section({
      id: "testing-matrix",
      label: "Fire Safety Systems Maintenance and Testing Matrix",
      description: "Quarterly matrix rows for supervisory signals, waterflow devices, main drains, and fire department connections.",
      fields: [
        {
          id: "matrixRows",
          label: "Testing Matrix",
          type: "repeater",
          addLabel: "Add matrix row",
          seedRows: testingMatrixRows,
          rowFields: matrixRowFields
        }
      ]
    }),
    section({
      id: "sprinkler-overview",
      label: "Sprinkler System Inspection Overview",
      description: "Simple rows from the source report pages 3-4. Enter Yes, No, N/A, dates, or short details.",
      fields: [
        {
          id: "overviewRows",
          label: "Sprinkler System Inspection Overview",
          type: "repeater",
          addLabel: "Add overview row",
          seedRows: sprinklerOverviewRows,
          rowFields: simpleChecklistRowFields
        }
      ]
    }),
    section({
      id: "systems-detail",
      label: "Tanks, Pumps, FDC, Wet/Dry/Special Systems",
      description: "Simple detail rows from the source report page 5.",
      fields: [
        {
          id: "systemDetailRows",
          label: "Tanks, Pumps, FDC, Wet/Dry/Special Systems",
          type: "repeater",
          addLabel: "Add system detail row",
          seedRows: tanksPumpsFdcRows,
          rowFields: systemDetailRowFields
        }
      ]
    }),
    section({
      id: "notes-verification",
      label: "Inspector Notes / Discussion / Verification",
      description: "Capture the discussion and verification page of the compliance packet.",
      fields: [
        { id: "inspectorNotes", label: "Inspector Notes", type: "text", placeholder: "No additional notes recorded." },
        { id: "adjustmentsCorrectionsMade", label: "Adjustments or Corrections Made", type: "text", placeholder: "N/A or describe adjustments/corrections" },
        { id: "suggestedImprovementsDiscussed", label: "Inspection and suggested improvements discussed with representative", type: "select", optionProvider: "yesNoNA" },
        { id: "representative", label: "Representative", type: "text", placeholder: "Customer representative" },
        { id: "representativeTitle", label: "Title", type: "text", placeholder: "Engineering, Facilities, etc." },
        { id: "discussionDate", label: "Date", type: "date" },
        { id: "testDate", label: "Test Date", type: "text", placeholder: "03/17/2026 to 03/17/2026" },
        { id: "systemTagged", label: "System Tagged", type: "text", placeholder: "Quarterly" },
        { id: "reportTechnician", label: "Report Technician", type: "text", placeholder: "Technician - license" }
      ]
    }),
    section({
      id: "deficiencies",
      label: "Deficiencies",
      description: "Default EP/system list plus comments, matching the source deficiency page.",
      fields: [
        {
          id: "deficiencyRows",
          label: "Deficiencies Noted for the Following Systems",
          type: "repeater",
          addLabel: "Add deficiency system",
          seedRows: deficiencyRows,
          rowFields: [
            textField("systemEp", "System / EP"),
            textField("status", "Status"),
            textField("notes", "Notes"),
            { id: "photo", label: "Photo attachment", type: "photo" }
          ]
        },
        { id: "inspectionComments", label: "Inspection Comments", type: "text", placeholder: "Quarterly Inspection: No deficiencies." }
      ]
    }),
    section({
      id: "ep1-supervisory",
      label: "EP1 - Supervisory Signal Devices",
      description: "NFPA 72 / NFPA 25 supervisory signal device list for Joint Commission EC.02.03.05 EP1 documentation.",
      fields: [
        {
          id: "supervisorySignalDevices",
          label: "EP1 - Supervisory Signal Devices",
          type: "repeater",
          addLabel: "Add supervisory signal device",
          rowFields: [
            textField("addressZone", "Address / Zone"),
            textField("deviceType", "Device Type"),
            textField("floor", "Floor"),
            textField("location", "Location"),
            passFailNAField("testResult", "Test Result"),
            textField("commentsNotes", "Comments & Notes")
          ]
        }
      ]
    }),
    section({
      id: "ep2-tamper-valves",
      label: "EP2 - Tamper Switches / Control Valve List",
      description: "NFPA 25 valve tamper/control valve list for Joint Commission EC.02.03.05 EP2 documentation.",
      fields: [
        {
          id: "tamperSwitchControlValves",
          label: "Tamper Switches / Control Valve List",
          type: "repeater",
          addLabel: "Add tamper/control valve",
          rowFields: [
            textField("addressZone", "Address / Zone"),
            textField("valveTypeSize", "Valve Type / Size"),
            textField("floor", "Floor"),
            textField("location", "Location"),
            textField("valveSecured", "Valve Secured?", "Supervised, locked, sealed, yes/no"),
            passFailNAField("result", "Result"),
            textField("commentsNotes", "Comments & Notes")
          ]
        }
      ]
    }),
    section({
      id: "ep2-waterflow",
      label: "EP2 - Waterflow Switches",
      description: "Waterflow devices, alarm timing, result, and comments for EP2 documentation.",
      fields: [
        {
          id: "waterflowSwitches",
          label: "Waterflow Switches",
          type: "repeater",
          addLabel: "Add waterflow switch",
          rowFields: [
            textField("addressZone", "Address / Zone"),
            textField("deviceType", "Device Type"),
            textField("floor", "Floor"),
            textField("location", "Location"),
            textField("timeToAlarm", "Time To Alarm"),
            passFailNAField("result", "Result"),
            textField("commentsNotes", "Comments & Notes")
          ]
        }
      ]
    }),
    section({
      id: "ep9-main-drain",
      label: "EP9 - Main Drain",
      description: "Main drain results for NFPA 25 and Joint Commission EC.02.03.05 EP9 documentation.",
      fields: [
        {
          id: "mainDrainRows",
          label: "EP9 - Main Drain",
          type: "repeater",
          addLabel: "Add main drain",
          rowFields: [
            textField("mainDrainLocation", "Main Drain Location"),
            textField("size", "Size"),
            textField("staticPressure", "Static Pressure"),
            textField("residualPressure", "Residual Pressure"),
            textField("returnTimeToStaticPsi", "Return Time to Static PSI"),
            passFailNAField("resultOfTest", "Result of Test")
          ]
        }
      ]
    }),
    section({
      id: "ep10-fdc",
      label: "EP10 - Fire Department Connection",
      description: "FDC checklist matching the source report field/value table.",
      fields: [
        { id: "fdcLocation", label: "Location", type: "text" },
        { id: "fdcType", label: "Type", type: "text", placeholder: "Siamese, Storz, wall mount, free-standing, etc." },
        yesNoNAField("fdcVisibleAccessible", "Visible & Accessible"),
        yesNoNAField("fdcCouplingsSwivelsGood", "Couplings/swivels not damaged and rotate smoothly"),
        yesNoNAField("fdcCapsInPlace", "Plugs/caps in place and undamaged"),
        yesNoNAField("fdcGasketsGood", "Gaskets in place and in good condition"),
        yesNoNAField("fdcSignsInPlace", "Identification signs in place"),
        yesNoNAField("fdcCheckValveNotLeaking", "Check valve not leaking"),
        yesNoNAField("fdcAutomaticDrainOperating", "Automatic drain valve in place and operating properly"),
        yesNoNAField("fdcClapperOperating", "FDC clapper in place and operating properly"),
        passFailNAField("fdcResultsOfTesting", "Results of Testing")
      ]
    }),
    section({
      id: "certification-acknowledgement",
      label: "Certification & Customer Acknowledgement",
      description: "Final certification fields that accompany the platform technician and customer signature capture.",
      fields: [
        { id: "certFacility", label: "Facility", type: "text", readOnly: true, prefill: [{ source: "siteDefault", key: "customerName" }] },
        { id: "certTechnician", label: "Technician", type: "text", placeholder: "Technician name" },
        { id: "certTechnicianLicense", label: "Technician License", type: "text", placeholder: "License or certification number" },
        { id: "certInspectionDate", label: "Inspection Date", type: "text", readOnly: true, prefill: [{ source: "siteDefault", key: "scheduledDate" }] },
        { id: "certSystemTagged", label: "System Tagged", type: "text", placeholder: "Quarterly" },
        { id: "certInspectionComments", label: "Inspection Comments", type: "text", placeholder: "Quarterly Inspection: No deficiencies." },
        { id: "technicianSignatureDate", label: "Technician Signature Date", type: "date" },
        { id: "customerRepresentativeSignatureDate", label: "Customer Representative Date", type: "date" }
      ]
    })
  ]
};
