import type { ReportTypeConfig } from "../types";
import { reportComplianceMap } from "../compliance";

const table = (
  key: string,
  title: string,
  dataset: string,
  columns: NonNullable<ReportTypeConfig["sections"][number]["table"]>["columns"],
  description?: string,
  pageBreakBehavior: ReportTypeConfig["sections"][number]["pageBreakBehavior"] = "auto"
): ReportTypeConfig["sections"][number] => ({
  key,
  title,
  description,
  renderer: "table",
  pageBreakBehavior,
  table: {
    dataset,
    repeatHeader: true,
    emptyMessage: `No ${title.toLowerCase()} recorded`,
    columns
  }
});

export const jointCommissionFireSprinklerReportConfigV2: ReportTypeConfig = {
  type: "joint_commission_fire_sprinkler",
  version: "v2",
  title: "Joint Commission Fire Sprinkler Inspection Report",
  documentCategory: "inspection",
  compliance: {
    enabled: true,
    label: "Applicable Codes, Standards & Compliance References",
    description: "Generated for customer compliance records. Maintain with facility life safety documentation.",
    codes: reportComplianceMap.joint_commission_fire_sprinkler ?? []
  },
  pageOne: {
    outcomeMetrics: ["documentStatus", "outcome", "deficiencyCount", "serviceDate"],
    primaryFacts: ["customer", "site", "inspectionDate", "technician"],
    overviewFacts: ["siteAddress", "billingContact", "inspectionStatus"],
    systemSummarySectionKey: "executive-summary"
  },
  statusMapping: {
    finalizedLabel: "Finalized",
    completedLabel: "Completed",
    passLabel: "Passed",
    failLabel: "Failed",
    deficiencyFoundLabel: "Deficiencies Noted",
    hideWorkflowStatesInCustomerPdf: true
  },
  sections: [
    {
      key: "report-info",
      title: "Header / Report Info",
      renderer: "keyValue",
      pageBreakBehavior: "avoid-inside",
      fields: [
        { key: "facilityCustomer", label: "Facility / Customer", hideIfEmpty: true },
        { key: "facilityAddress", label: "Facility Address", hideIfEmpty: true },
        { key: "reportType", label: "Report Type", hideIfEmpty: true },
        { key: "inspectionDate", label: "Inspection Date", hideIfEmpty: true },
        { key: "technician", label: "Technician", hideIfEmpty: true },
        { key: "technicianLicense", label: "Technician License", hideIfEmpty: true },
        { key: "companyName", label: "Company", hideIfEmpty: true },
        { key: "companyAddress", label: "Company Address", hideIfEmpty: true },
        { key: "companyPhone", label: "Company Phone", hideIfEmpty: true },
        { key: "companyLicense", label: "Company License", hideIfEmpty: true },
        { key: "reportScope", label: "Report Scope", hideIfEmpty: true },
        { key: "tagStatus", label: "System Tagged", hideIfEmpty: true }
      ]
    },
    {
      key: "executive-summary",
      title: "Executive Inspection Summary",
      renderer: "keyValue",
      pageBreakBehavior: "avoid-inside",
      fields: [
        { key: "summaryCustomerFacility", label: "Customer / Facility", hideIfEmpty: true },
        { key: "summaryReportType", label: "Report Type", hideIfEmpty: true },
        { key: "summaryInspectionDate", label: "Inspection Date", hideIfEmpty: true },
        { key: "summaryTechnician", label: "Technician", hideIfEmpty: true },
        { key: "summaryTechnicianLicense", label: "Technician License", hideIfEmpty: true },
        { key: "summaryCompany", label: "Company", hideIfEmpty: true },
        { key: "summaryReportScope", label: "Report Scope", hideIfEmpty: true }
      ]
    },
    table("summary-dashboard", "Summary Dashboard", "summary-dashboard.dashboardRows", [
      { key: "inspectionArea", label: "Inspection Area", width: "24%" },
      { key: "epStandard", label: "EP / Standard", width: "22%" },
      { key: "result", label: "Result", width: "16%" },
      { key: "details", label: "Details", width: "38%" }
    ], "Inspection area summary, EP/standard, result, and details.", "avoid-inside"),
    table("testing-matrix", "Fire Safety Systems Maintenance and Testing Matrix", "testing-matrix.matrixRows", [
      { key: "deviceCategory", label: "Device Category", width: "15%" },
      { key: "deviceActivity", label: "Device / Activity", width: "19%" },
      { key: "ep", label: "EP", width: "4%", align: "center" },
      { key: "frequency", label: "Freq", width: "6%", align: "center" },
      { key: "apr", label: "Apr", width: "4%", align: "center" },
      { key: "may", label: "May", width: "4%", align: "center" },
      { key: "jun", label: "Jun", width: "4%", align: "center" },
      { key: "jul", label: "Jul", width: "4%", align: "center" },
      { key: "aug", label: "Aug", width: "4%", align: "center" },
      { key: "sep", label: "Sep", width: "4%", align: "center" },
      { key: "oct", label: "Oct", width: "4%", align: "center" },
      { key: "nov", label: "Nov", width: "4%", align: "center" },
      { key: "dec", label: "Dec", width: "4%", align: "center" },
      { key: "jan", label: "Jan", width: "4%", align: "center" },
      { key: "feb", label: "Feb", width: "4%", align: "center" },
      { key: "mar", label: "Mar", width: "4%", align: "center" }
    ], "Quarterly testing matrix modeled after the source compliance report."),
    table("sprinkler-overview", "Sprinkler System Inspection Overview", "sprinkler-overview.overviewRows", [
      { key: "area", label: "Area", width: "24%" },
      { key: "question", label: "Question / Record", width: "52%" },
      { key: "responseDate", label: "Response / Date", width: "24%" }
    ]),
    table("systems-detail", "Tanks, Pumps, Fire Department Connections, Wet/Dry/Special Systems", "systems-detail.systemDetailRows", [
      { key: "area", label: "Area", width: "24%" },
      { key: "inspectionItem", label: "Inspection Item", width: "52%" },
      { key: "responseDetail", label: "Response / Detail", width: "24%" }
    ]),
    {
      key: "notes-verification",
      title: "Inspector Notes, Discussion, and Verification",
      renderer: "keyValue",
      pageBreakBehavior: "avoid-inside",
      fields: [
        { key: "inspectorNotes", label: "Inspector Notes", hideIfEmpty: true },
        { key: "adjustmentsCorrectionsMade", label: "Adjustments or Corrections Made", hideIfEmpty: true },
        { key: "suggestedImprovementsDiscussed", label: "Inspection and suggested improvements discussed with representative", hideIfEmpty: true },
        { key: "representative", label: "Representative", hideIfEmpty: true },
        { key: "representativeTitle", label: "Title", hideIfEmpty: true },
        { key: "discussionDate", label: "Date", format: "date", hideIfEmpty: true },
        { key: "testDate", label: "Test Date", hideIfEmpty: true },
        { key: "systemTagged", label: "System Tagged", hideIfEmpty: true },
        { key: "reportTechnician", label: "Report Technician", hideIfEmpty: true }
      ]
    },
    table("deficiencies", "Deficiencies Noted for the Following Systems", "deficiencies.deficiencyRows", [
      { key: "systemEp", label: "System / EP", width: "24%" },
      { key: "status", label: "Status", width: "30%" },
      { key: "notes", label: "Notes", width: "46%" }
    ], "Inspection comments are recorded below the deficiency system list."),
    {
      key: "deficiency-comments",
      title: "Inspection Comments",
      renderer: "keyValue",
      fields: [{ key: "inspectionComments", label: "Inspection Comments", hideIfEmpty: true }]
    },
    table("ep1-supervisory", "EP1 - Supervisory Signal Devices", "ep1-supervisory.supervisorySignalDevices", [
      { key: "addressZone", label: "Address / Zone", width: "15%" },
      { key: "deviceType", label: "Device Type", width: "14%" },
      { key: "floor", label: "Floor", width: "8%" },
      { key: "location", label: "Location", width: "25%" },
      { key: "testResult", label: "Test Result", width: "12%" },
      { key: "commentsNotes", label: "Comments & Notes", width: "26%" }
    ], "NFPA 72 (2025 Edition), NFPA 25 (2026 Edition), and Joint Commission EC.02.03.05 EP1."),
    table("ep2-tamper-valves", "EP2 - Tamper Switches / Control Valve List", "ep2-tamper-valves.tamperSwitchControlValves", [
      { key: "addressZone", label: "Address / Zone", width: "14%" },
      { key: "valveTypeSize", label: "Valve Type / Size", width: "15%" },
      { key: "floor", label: "Floor", width: "7%" },
      { key: "location", label: "Location", width: "25%" },
      { key: "valveSecured", label: "Valve Secured?", width: "13%" },
      { key: "result", label: "Result", width: "10%" },
      { key: "commentsNotes", label: "Comments & Notes", width: "16%" }
    ], "NFPA 72 (2025 Edition), NFPA 25 (2026 Edition), and Joint Commission EC.02.03.05 EP2."),
    table("ep2-waterflow", "EP2 - Waterflow Switches", "ep2-waterflow.waterflowSwitches", [
      { key: "addressZone", label: "Address / Zone", width: "14%" },
      { key: "deviceType", label: "Device Type", width: "13%" },
      { key: "floor", label: "Floor", width: "7%" },
      { key: "location", label: "Location", width: "30%" },
      { key: "timeToAlarm", label: "Time To Alarm", width: "12%" },
      { key: "result", label: "Result", width: "10%" },
      { key: "commentsNotes", label: "Comments & Notes", width: "14%" }
    ]),
    table("ep9-main-drain", "EP9 - Main Drain", "ep9-main-drain.mainDrainRows", [
      { key: "mainDrainLocation", label: "Main Drain Location", width: "24%" },
      { key: "size", label: "Size", width: "12%" },
      { key: "staticPressure", label: "Static Pressure", width: "16%" },
      { key: "residualPressure", label: "Residual Pressure", width: "16%" },
      { key: "returnTimeToStaticPsi", label: "Return Time to Static PSI", width: "18%" },
      { key: "resultOfTest", label: "Result of Test", width: "14%" }
    ], "NFPA 25 (2026 Edition) main drain and water-based fire protection documentation. Joint Commission EC.02.03.05 EP9."),
    {
      key: "ep10-fdc",
      title: "EP10 - Fire Department Connection",
      description: "NFPA 25 (2026 Edition) fire department connection documentation. Joint Commission EC.02.03.05 EP10.",
      renderer: "keyValue",
      pageBreakBehavior: "avoid-inside",
      fields: [
        { key: "fdcLocation", label: "Location", hideIfEmpty: true },
        { key: "fdcType", label: "Type", hideIfEmpty: true },
        { key: "fdcVisibleAccessible", label: "Visible & Accessible", hideIfEmpty: true },
        { key: "fdcCouplingsSwivelsGood", label: "Couplings/swivels not damaged and rotate smoothly", hideIfEmpty: true },
        { key: "fdcCapsInPlace", label: "Plugs/caps in place and undamaged", hideIfEmpty: true },
        { key: "fdcGasketsGood", label: "Gaskets in place and in good condition", hideIfEmpty: true },
        { key: "fdcSignsInPlace", label: "Identification signs in place", hideIfEmpty: true },
        { key: "fdcCheckValveNotLeaking", label: "Check valve not leaking", hideIfEmpty: true },
        { key: "fdcAutomaticDrainOperating", label: "Automatic drain valve in place and operating properly", hideIfEmpty: true },
        { key: "fdcClapperOperating", label: "FDC clapper in place and operating properly", hideIfEmpty: true },
        { key: "fdcResultsOfTesting", label: "Results of Testing", hideIfEmpty: true }
      ]
    },
    {
      key: "certification-acknowledgement",
      title: "Certification & Customer Acknowledgement",
      renderer: "keyValue",
      pageBreakBehavior: "avoid-inside",
      fields: [
        { key: "certFacility", label: "Facility", hideIfEmpty: true },
        { key: "certTechnician", label: "Technician", hideIfEmpty: true },
        { key: "certTechnicianLicense", label: "Technician License", hideIfEmpty: true },
        { key: "certInspectionDate", label: "Inspection Date", hideIfEmpty: true },
        { key: "certSystemTagged", label: "System Tagged", hideIfEmpty: true },
        { key: "certInspectionComments", label: "Inspection Comments", hideIfEmpty: true },
        { key: "technicianSignatureDate", label: "Technician Signature Date", format: "date", hideIfEmpty: true },
        { key: "customerRepresentativeSignatureDate", label: "Customer Representative Date", format: "date", hideIfEmpty: true }
      ]
    }
  ],
  photos: { enabled: true, title: "Deficiency Photos / Attachments", captionMode: "sequential" },
  signatures: { enabled: true, title: "Certification Signatures", roles: ["Technician Signature", "Customer Representative"] }
};
