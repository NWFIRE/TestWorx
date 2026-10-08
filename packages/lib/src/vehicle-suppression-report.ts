import { RecurrenceFrequency } from "@prisma/client";
import type { ReportFieldDefinition, ReportSectionDefinition, ReportTemplateDefinition } from "./report-config";

// Carry forward identification, never prior test results or the current visit's sign-off.
function equipmentField(id: string, label: string, sectionId = "vehicle-information"): ReportFieldDefinition {
  return { id, label, type: "text", prefill: [{ source: "priorField", sectionId, fieldId: id }] };
}

function checklist(id: string, label: string, checks: Array<[string, string]>): ReportSectionDefinition {
  return {
    id, label,
    description: "Record today's result for each check. Pass means the stated condition is satisfied. Use N/A only when not applicable to this equipment or service scope; document limitations in service notes. Follow the applicable manufacturer's procedures.",
    mobileDisplayType: "checklist_card",
    pdfDisplayType: "checklist",
    fields: [...checks.map(([fieldId, title], index): ReportFieldDefinition => ({
      id: fieldId, label: `${index + 1}. ${title}`, type: "select", optionProvider: "passFailNA",
      requiredForFinalization: true, allowPhoto: true, requireNoteOnFail: true,
      carryForwardBehavior: "none", billableBehavior: "not_billable"
    })), { id: "notes", label: "Notes / failed checks", description: "Explain failed checks here, including the affected equipment and any corrective work. Required when a check fails.", type: "text", carryForwardBehavior: "none", billableBehavior: "not_billable" }]
  };
}

export const vehicleSuppressionReportTemplate: ReportTemplateDefinition = {
  label: "Vehicle Fire Suppression",
  description: "Vehicle fire suppression and gas detection inspection, testing and maintenance.",
  defaultRecurrenceFrequency: RecurrenceFrequency.SEMI_ANNUAL,
  priorReportScope: "service_schedule",
  pdf: {
    fullDetail: true,
    subtitle: "Vehicle Fire Suppression & Gas Detection Report",
    nfpaReferences: ["Applicable manufacturer's vehicle fire suppression and gas detection inspection, testing and maintenance instructions"]
  },
  billableMappings: {
    fields: [{ sourceSection: "vehicle-information", field: "vehicleId", category: "service",
      description: "Vehicle Fire Suppression Inspection", code: "VEHICLE_FIRE_SUPPRESSION_INSPECTION",
      unit: "vehicle", quantitySource: "constant", quantityConstant: 1, alwaysInclude: true,
      metadataFields: ["vehicleId", "vehicleModel", "manufacturer", "serviceScope"] }]
  },
  sections: [
    {
      id: "vehicle-information", label: "Vehicle and service information",
      description: "Identify this vehicle and the service performed. Customer, location and signatures use the inspection's existing records. Record the actual service date and local arrival time.",
      fields: [
        { ...equipmentField("vehicleId", "Vehicle identification / VIN / unit number"), requiredForFinalization: true },
        equipmentField("vehicleModel", "Vehicle model"),
        equipmentField("manufacturer", "Suppression system manufacturer"),
        equipmentField("systemModel", "Suppression system model"),
        equipmentField("contactName", "Service contact name"),
        equipmentField("contactPhone", "Service contact phone"),
        { id: "serviceDate", label: "Date of service", type: "date", requiredForFinalization: true },
        { id: "timeIn", label: "Time in (local)", type: "text", placeholder: "Actual local arrival time" },
        { id: "serviceScope", label: "Service performed", type: "select", optionProvider: "vehicleServiceScope", requiredForFinalization: true },
        { id: "otherService", label: "Other service description", type: "text", visibleWhen: { fieldId: "serviceScope", values: ["other"] }, requiredForFinalization: true },
        { id: "tagStatus", label: "System tag / outcome", type: "select", optionProvider: "tagStatusOptions", requiredForFinalization: true },
        equipmentField("manualReference", "Manufacturer manual / revision used"),
        { id: "technicianLicense", label: "Servicing technician license number", type: "text" }
      ]
    },
    {
      id: "agent-cylinders", label: "Agent cylinders",
      description: "Record each cylinder's identification, type/size/model and service history. Enter the known date or year; do not assume an unknown service date.",
      fields: [{ id: "cylinders", label: "Agent cylinders", type: "repeater", addLabel: "Add cylinder",
        carryForwardPriorRows: true, rowIdentityField: "cylinderId", validation: [{ type: "minRows", value: 1, message: "Add at least one agent cylinder." }],
        rowFields: [
          { id: "cylinderId", label: "Cylinder ID / serial", type: "text", requiredForFinalization: true },
          { id: "typeSizeModel", label: "Type / size / model", type: "text", requiredForFinalization: true },
          { id: "manufactured", label: "Made (date/year)", type: "text" },
          { id: "lastSixYear", label: "Last six-year", type: "text" },
          { id: "lastHydro", label: "Last hydro", type: "text" },
          { id: "notes", label: "Cylinder notes", type: "text" }
        ] }]
    },
    {
      id: "detection-controls", label: "Detection and controls",
      description: "Record installed detection devices and manual switches. Quantities describe equipment, not replacement materials.",
      fields: [
        { id: "controlPanel", label: "Control panel type", type: "select", optionProvider: "vehicleControlPanelTypes",
          prefill: [{ source: "priorField", sectionId: "detection-controls", fieldId: "controlPanel" }] },
        { ...equipmentField("otherPanel", "Other control panel", "detection-controls"), visibleWhen: { fieldId: "controlPanel", values: ["other"] }, requiredForFinalization: true },
        equipmentField("panelModelSerial", "Panel model / serial", "detection-controls"),
        { id: "devices", label: "Detection and activation devices", type: "repeater", addLabel: "Add device type", carryForwardPriorRows: true,
          rowFields: [
            { id: "deviceType", label: "Detection / actuation", type: "select", optionProvider: "vehicleDetectionTypes", requiredForFinalization: true },
            { id: "quantity", label: "Quantity", type: "number", requiredForFinalization: true },
            { id: "notes", label: "Location / other details", type: "text" }
          ] }
      ]
    },
    checklist("daily-inspection", "Daily inspection", [
      ["panelPower", "Circuit monitor or control panel has power"],
      ["systemOk", "SYSTEM OK indicator is illuminated"]
    ]),
    checklist("monthly-inspection", "Monthly visual inspection", [
      ["componentsPresent", "All components are present and in their original locations"],
      ["manualSwitchesAccessible", "Manual actuation switches are unobstructed"],
      ["tamperSealsIntact", "Tamper indicators, lock-wire seals and pull pins are intact"],
      ["componentsUndamaged", "Components are free of damage or conditions preventing operation"],
      ["reservoirPressure", "Air reservoir gauge indicates proper pressure (Firetrace-equipped systems)"],
      ["nozzleAim", "Nozzle outlets are unobstructed and properly aimed"],
      ["capsPresent", "Blow-off caps are intact and in place"],
      ["mountingsSecure", "Components are securely mounted"],
      ["weatherSeals", "Wiring connections are sealed from weather"],
      ["fireInstructions", "In Case of Fire instructions are intact, clean and legible"],
      ["cylinderLabels", "Cylinder labels are intact, clean and legible"]
    ]),
    checklist("semi-annual-maintenance", "Semi-annual maintenance", [
      ["hazardUnchanged", "Hazard is unchanged from the original vehicle hazard analysis"],
      ["equipmentCondition", "Thermostats, cylinders, valves, piping/hoses, nozzles, alarms and auxiliary equipment are in good condition"],
      ["dischargeNetwork", "Discharge network hoses are unobstructed"],
      ["noReportedProblems", "Operating/maintenance personnel reported no vehicle or suppression-system problems affecting operation"],
      ["cylinderClean", "Agent cylinder is clean of dirt, grease and foreign material"],
      ["nameplateSecure", "Instruction nameplate is secure and legible"],
      ["cylinderCondition", "Cylinder has no corrosion, abrasion, dents or weld damage"],
      ["dischargeValve", "Discharge valve is undamaged, in place and free of substitute parts"],
      ["airValveSeal", "Air valve cap / agent cylinder pressure switch is tight and sealed, where applicable"],
      ["fusiblePlug", "Fusible plug pressure relief is free of corrosion and alteration"],
      ["valveSpring", "Valve stem return spring and retaining washer are free of corrosion"],
      ["gaugeCondition", "Discharge valve pressure gauge is clean and undamaged"],
      ["gaugePressure", "Discharge valve pressure gauge is in the proper operating range"],
      ["dischargeFitting", "Discharge fitting is clean of dirt, grease and foreign material"],
      ["dischargeOutlet", "Discharge outlet is free of extinguishing chemical residue"],
      ["airFlow", "Air flows freely through discharge hoses and nozzles"],
      ["hoseCondition", "Discharge hoses have no cuts, abrasions or loose joints"],
      ["controlHeadAge", "Electric control head is less than six years old"],
      ["detectionClean", "Thermostats / Firetrace are clean of dirt, grease and foreign material"],
      ["panelClean", "Circuit monitor / control panel is clean of dirt, grease and foreign material"],
      ["thermostatCondition", "Thermostats have no dents, punctures, paint or other damage"],
      ["wireCondition", "Exposed wires have no cuts, abrasion or heat damage"],
      ["powerConnections", "Power supply connections are tight with no wire fatigue"],
      ["detectionActivated", "Detection network was activated and functions properly"],
      ["manualActivated", "Manual activation switch was activated and functions properly"],
      ["pressureSwitch", "Agent cylinder pressure switch circuit functions properly"],
      ["backupBattery", "Internal backup battery functions properly"],
      ["capsLubricated", "Blow-off caps were lubricated with a light coat of silicone grease as specified"],
      ["damagedCapsReplaced", "Damaged blow-off caps were replaced (N/A if none were damaged)"]
    ]),
    {
      id: "service-findings", label: "Service findings and corrections",
      description: "Record control-head follow-up, deficiencies, repairs and service limitations. Use the shared photos and signatures sections for evidence and sign-off.",
      fields: [
        { id: "controlHeadReplaced", label: "Control head (6+ years) replaced?", type: "select", optionProvider: "yesNoNA", requiredForFinalization: true },
        { id: "controlHeadChecked", label: "Control head checked for damage / corrosion?", type: "select", optionProvider: "yesNoNA", requiredForFinalization: true },
        { id: "deficiencies", label: "Deficiencies", type: "text" },
        { id: "deficienciesRepaired", label: "Deficiencies repaired", type: "text" },
        { id: "serviceNotes", label: "Service notes / limitations / follow-up", type: "text" }
      ]
    }
  ]
};
