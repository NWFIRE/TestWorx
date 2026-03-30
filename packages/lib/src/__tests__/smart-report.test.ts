import { describe, expect, it } from "vitest";

import { PDFDocument } from "pdf-lib";

import { applyRepeaterBulkAction, applyRepeaterRowSmartUpdate, buildInitialReportDraft, buildRepeaterRowDefaults, buildReportPreview, describeRepeaterValueLines, duplicateRepeaterRows, validateDraftForTemplate, validateFinalizationDraft } from "../report-engine";
import { generateInspectionReportPdf } from "../pdf-report";
import { buildDataUrlStorageKey } from "../storage";
import { resolveReportTemplate } from "../report-config";

const tinyPngBytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=", "base64"));
const tinyPngDataUrl = buildDataUrlStorageKey({ mimeType: "image/png", bytes: tinyPngBytes });

describe("smart report foundations", () => {
  it("prefills fire extinguisher rows from asset data and prior finalized reports using the required priority", () => {
    const draft = buildInitialReportDraft({
      inspectionType: "fire_extinguisher",
      siteName: "Pinecrest Tower",
      customerName: "Pinecrest Property Management",
      scheduledDate: "2026-03-20T15:00:00.000Z",
      assetCount: 2,
      assets: [
        {
          id: "asset_1",
          name: "Lobby extinguisher bank",
          assetTag: "EXT-100",
          metadata: {
            location: "Lobby by east stair",
            manufacturer: "amerex",
            ulRating: "1-A:10-B:C",
            serialNumber: "AMX-44021",
            extinguisherType: "2.5 lb ABC",
            manufactureDate: "2024-06-01",
            lastHydroDate: "2019"
          }
        },
        {
          id: "asset_2",
          name: "Server room extinguisher",
          assetTag: "EXT-200",
          metadata: { location: "Server room entrance", ulRating: "3-A:40-B:C" }
        }
      ],
      priorCompletedDraft: {
        templateVersion: 1,
        inspectionType: "fire_extinguisher",
        overallNotes: "",
        sectionOrder: ["inventory", "service"],
        activeSectionId: "inventory",
        sections: {
          inventory: {
            status: "pass",
            notes: "",
            fields: {
              extinguishers: [
                {
                  assetId: "asset_1",
                  assetTag: "EXT-100",
                  location: "Lobby by east stair",
                  manufacturer: "badger",
                  ulRating: "1-A:10-B:C",
                  serialNumber: "OLD-1",
                  extinguisherType: "2.5 lb ABC",
                  gaugeStatus: "pass",
                  mountingSecure: "pass",
                  lastHydro: "2018-02-01"
                },
                {
                  assetId: "asset_2",
                  assetTag: "EXT-200",
                  location: "Server room entrance",
                  manufacturer: "kidde",
                  ulRating: "3-A:40-B:C",
                  serialNumber: "KID-221",
                  extinguisherType: "5 lb ABC",
                  gaugeStatus: "fail",
                  mountingSecure: "pass"
                }
              ]
            }
          },
          service: { status: "pass", notes: "", fields: { followUpRecommended: false, jurisdictionNotes: "" } }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: {
          siteName: "Pinecrest Tower",
          customerName: "Pinecrest Property Management",
          scheduledDate: "2025-03-20T15:00:00.000Z",
          assetCount: 2,
          priorReportSummary: ""
        }
      }
    });

    const inventoryRows = draft.sections.inventory?.fields.extinguishers as Array<Record<string, string>>;
    expect(inventoryRows).toHaveLength(2);
    expect(inventoryRows[0].manufacturer).toBe("amerex");
    expect(inventoryRows[0].ulRating).toBe("1-A:10-B:C");
    expect(inventoryRows[0].mfgDate).toBe("24");
    expect(inventoryRows[0].lastHydro).toBe("19");
    expect(inventoryRows[0].nextHydro).toBe("31");
    expect(inventoryRows[1].manufacturer).toBe("kidde");
    expect(inventoryRows[1].serialNumber).toBe("KID-221");
    expect(draft.sections.inventory?.fields.unitsInspected).toBe(2);
  });

  it("hides asset tags from repeater display labels and visible row lines", () => {
    const template = resolveReportTemplate({
      inspectionType: "fire_extinguisher",
      assets: []
    });

    const repeater = template.sections[0]?.fields.find((field) => field.id === "extinguishers");
    if (!repeater || repeater.type !== "repeater") {
      throw new Error("Expected extinguisher repeater field.");
    }

    const lines = describeRepeaterValueLines(repeater, [
      {
        assetId: "asset_1",
        assetTag: "EXT-100",
        location: "Lobby by east stair",
        extinguisherType: "5 lb ABC",
        servicePerformed: "Annual Inspection"
      }
    ]);

    expect(lines[0]).toContain("Lobby by east stair");
    expect(lines.join(" ")).not.toContain("EXT-100");
    expect(lines.join(" ")).not.toContain("Asset tag");
  });

  it("auto-populates linked extinguisher fields, ul rating, and next hydro when the asset row selection changes", () => {
    const template = resolveReportTemplate({
      inspectionType: "fire_extinguisher",
      assets: [
        {
          id: "asset_1",
          name: "Lobby extinguisher bank",
          assetTag: "EXT-100",
          metadata: { location: "Lobby by east stair", manufacturer: "amerex", ulRating: "1-A:10-B:C", serialNumber: "AMX-44021", extinguisherType: "5 lb ABC", lastHydroDate: "2020-07-12" }
        }
      ]
    });

    const updatedRow = applyRepeaterRowSmartUpdate(
      template,
      "inventory",
      "extinguishers",
      {
        assetId: "asset_1",
        assetTag: "",
        location: "",
        manufacturer: "",
        ulRating: "",
        serialNumber: "",
        extinguisherType: "",
        gaugeStatus: "pass",
        mountingSecure: "pass",
        lastHydro: "",
        nextHydro: ""
      },
      "assetId"
    );

    expect(updatedRow.assetTag).toBe("EXT-100");
    expect(updatedRow.location).toBe("Lobby by east stair");
    expect(updatedRow.manufacturer).toBe("amerex");
    expect(updatedRow.extinguisherType).toBe("5 lb ABC");
    expect(updatedRow.ulRating).toBe("3-A:40-B:C");
    expect(updatedRow.lastHydro).toBe("20");
    expect(updatedRow.nextHydro).toBe("32");
  });

  it("prefills fire alarm rows from asset data, carries forward finalized values, and hides removed legacy fields from the current template", () => {
    const draft = buildInitialReportDraft({
      inspectionType: "fire_alarm",
      siteName: "Pinecrest Tower",
      customerName: "Pinecrest Property Management",
      scheduledDate: "2026-03-20T15:00:00.000Z",
      assetCount: 5,
      assets: [
        {
          id: "asset_1",
          name: "Main fire alarm panel",
          assetTag: "FAP-100",
          metadata: {
            alarmRole: "control_panel",
            location: "Ground floor electrical room",
            panelName: "Main fire alarm panel",
            manufacturer: "Notifier",
            model: "NFS2-3030",
            serialNumber: "FAP-3030-001",
            communicationPathType: "dual_path",
            batterySize: "12v_18ah",
            batteryQuantity: "2"
          }
        },
        {
          id: "asset_2",
          name: "Lobby pull station",
          assetTag: "FAI-101",
          metadata: {
            alarmRole: "initiating_device",
            location: "Lobby north exit",
            manufacturer: "Notifier",
            model: "BG-12LX",
            serialNumber: "PS-101",
            deviceType: "pull_station"
          }
        },
        {
          id: "asset_3",
          name: "Level 2 smoke detector",
          assetTag: "FAI-102",
          metadata: {
            alarmRole: "initiating_device",
            location: "Second floor east corridor",
            manufacturer: "System Sensor",
            model: "2251B",
            serialNumber: "SD-2251-77",
            deviceType: "smoke_detector"
          }
        },
        {
          id: "asset_4",
          name: "Main lobby horn strobe",
          assetTag: "FAN-201",
          metadata: {
            alarmRole: "notification_appliance",
            location: "Main lobby",
            applianceType: "horn_strobe",
            applianceQuantity: 4
          }
        },
        {
          id: "asset_5",
          name: "West stair speaker strobe",
          assetTag: "FAN-202",
          metadata: {
            alarmRole: "notification_appliance",
            location: "West stair level 3",
            applianceType: "speaker_strobe",
            applianceQuantity: 2
          }
        }
      ],
      priorCompletedDraft: {
        templateVersion: 1,
        inspectionType: "fire_alarm",
        overallNotes: "",
        sectionOrder: ["control-panel", "initiating-devices", "notification", "system-summary"],
        activeSectionId: "control-panel",
        sections: {
          "control-panel": {
            status: "pass",
            notes: "",
            fields: {
              controlPanels: [
                {
                  assetId: "asset_1",
                  assetTag: "FAP-100",
                  panelName: "Old panel name",
                  manufacturer: "Legacy",
                  location: "Ground floor electrical room",
                  model: "Legacy panel",
                  serialNumber: "LEGACY-1",
                  communicationPathType: "phone"
                }
              ],
              controlPanelsInspected: 1,
              lineVoltageStatus: "normal",
              acPowerIndicator: "yes",
              acBreakerLocked: "yes",
              powerSupplyCondition: "good",
              batterySize: "other",
              batterySizeOther: "Legacy custom battery setup",
              batteryQuantity: "2",
              batteryLoadTest: "pass",
              remoteMonitoring: "yes",
              centralStationSignalTest: "pass",
              controlPanelCondition: "pass",
              controlPanelComments: ""
            }
          },
          "initiating-devices": {
            status: "pass",
            notes: "",
            fields: {
              initiatingDevices: [
                { assetId: "asset_2", assetTag: "FAI-101", deviceType: "pull_station", location: "Lobby north exit", serialNumber: "Address 12 / Zone 1", functionalTestResult: "pass", physicalCondition: "good", sensitivityOrOperationResult: "pass", comments: "" }
              ],
              initiatingDevicesInspected: 1,
              initiatingDeviceDeficiencyCount: 0,
              initiatingDeviceNotes: ""
            }
          },
          notification: {
            status: "pass",
            notes: "",
            fields: {
              notificationAppliances: [
                { assetId: "asset_4", assetTag: "FAN-201", applianceType: "horn_strobe", quantity: "5", audibleOperation: "pass", visualOperation: "pass", comments: "" }
              ],
              notificationAppliancesInspected: 1,
              notificationDeficiencyCount: 0,
              notificationNotes: ""
            }
          },
          "system-summary": {
            status: "pass",
            notes: "",
            fields: {
              fireAlarmSystemStatus: "pass",
              followUpRequired: false
            }
          }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: {
          siteName: "Pinecrest Tower",
          customerName: "Pinecrest Property Management",
          scheduledDate: "2025-03-20T15:00:00.000Z",
          assetCount: 1,
          priorReportSummary: ""
        }
      }
    });

    const controlPanels = draft.sections["control-panel"]?.fields.controlPanels as Array<Record<string, string>>;
    const initiatingRows = draft.sections["initiating-devices"]?.fields.initiatingDevices as Array<Record<string, string>>;
    const notificationRows = draft.sections.notification?.fields.notificationAppliances as Array<Record<string, string>>;

    expect(controlPanels).toHaveLength(1);
    expect(initiatingRows).toHaveLength(2);
    expect(notificationRows).toHaveLength(2);
    expect(controlPanels[0].assetTag).toBe("FAP-100");
    expect(controlPanels[0].panelName).toBe("Main fire alarm panel");
    expect(controlPanels[0].manufacturer).toBe("Notifier");
    expect(controlPanels[0].model).toBe("NFS2-3030");
    expect(controlPanels[0].communicationPathType).toBe("dual_path");
    expect(draft.sections["control-panel"]?.fields.batterySize).toBe("other");
    expect(draft.sections["control-panel"]?.fields.batterySizeOther).toBe("Legacy custom battery setup");
    expect(draft.sections["control-panel"]?.fields.batteryQuantity).toBe("2");
    expect(initiatingRows[0].deviceType).toBe("pull_station");
    expect(initiatingRows[1].deviceType).toBe("smoke_detector");
    expect(notificationRows[0].applianceType).toBe("horn_strobe");
    expect(notificationRows[0].quantity).toBe(4);
    expect(notificationRows[1].quantity).toBe(2);
    expect(draft.sections["control-panel"]?.fields).not.toHaveProperty("batteryManufacturer");
    expect(draft.sections["control-panel"]?.fields).not.toHaveProperty("systemClockCorrect");
    expect(draft.sections["control-panel"]?.fields).not.toHaveProperty("panelProgrammingVerified");
    expect(draft.sections["control-panel"]?.fields).not.toHaveProperty("communicatorCondition");
    expect(draft.sections["control-panel"]?.fields).not.toHaveProperty("panelCabinetCondition");
    expect(draft.sections["control-panel"]?.fields).not.toHaveProperty("labelingLegible");
    expect(draft.sections["control-panel"]?.fields).not.toHaveProperty("panelClearanceAcceptable");
    expect(draft.sections["control-panel"]?.fields).not.toHaveProperty("panelHousekeepingCondition");
    expect(draft.sections["control-panel"]?.fields.controlPanelsInspected).toBe(1);
    expect(draft.sections["initiating-devices"]?.fields.initiatingDevicesInspected).toBe(2);
    expect(draft.sections.notification?.fields.notificationAppliancesInspected).toBe(2);
  });

  it("auto-populates fire alarm rows from asset metadata for the correct section repeater and supports custom-option normalization", () => {
    const template = resolveReportTemplate({
      inspectionType: "fire_alarm",
      assets: [
        {
          id: "asset_1",
          name: "Main fire alarm panel",
          assetTag: "FAP-100",
          metadata: {
            alarmRole: "control_panel",
            location: "Ground floor electrical room",
            panelName: "Main fire alarm panel",
            manufacturer: "Notifier",
            model: "NFS2-3030",
            serialNumber: "FAP-3030-001",
            communicationPathType: "dual_path",
            batterySize: "12v_18ah",
            batteryQuantity: "2"
          }
        },
        {
          id: "asset_2",
          name: "Main lobby horn strobe",
          assetTag: "FAN-201",
          metadata: {
            alarmRole: "notification_appliance",
            location: "Main lobby",
            applianceType: "horn_strobe",
            applianceQuantity: 3
          }
        }
      ]
    });

    const controlPanelRow = applyRepeaterRowSmartUpdate(
      template,
      "control-panel",
      "controlPanels",
      {
        assetId: "asset_1",
        assetTag: "",
        panelName: "",
        manufacturer: "",
        location: "",
        model: "",
        serialNumber: "",
        communicationPathType: ""
      },
      "assetId"
    );

    const notificationRow = applyRepeaterRowSmartUpdate(
      template,
      "notification",
      "notificationAppliances",
      {
        assetId: "asset_2",
        assetTag: "",
        applianceType: "",
        applianceTypeCustom: "",
        quantity: "",
        quantityCustom: "",
        audibleOperation: "",
        visualOperation: "",
        comments: ""
      },
      "assetId"
    );

    expect(controlPanelRow.assetTag).toBe("FAP-100");
    expect(controlPanelRow.panelName).toBe("Main fire alarm panel");
    expect(controlPanelRow.location).toBe("Ground floor electrical room");
    expect(controlPanelRow.model).toBe("NFS2-3030");
    expect(controlPanelRow.communicationPathType).toBe("dual_path");
    expect(notificationRow.assetTag).toBe("FAN-201");
    expect(notificationRow.applianceType).toBe("horn_strobe");
    expect(notificationRow.quantity).toBe(3);

    const normalizedCustomNotificationRow = applyRepeaterRowSmartUpdate(
      template,
      "notification",
      "notificationAppliances",
      {
        assetId: "",
        assetTag: "",
        applianceType: "wall_speaker_custom",
        applianceTypeCustom: "",
        quantity: "other",
        quantityCustom: 12,
        audibleOperation: "pass",
        visualOperation: "pass",
        comments: ""
      },
      "applianceType"
    );

    expect(normalizedCustomNotificationRow.applianceType).toBe("other");
    expect(normalizedCustomNotificationRow.applianceTypeCustom).toBe("wall_speaker_custom");
  });

  it("recomputes fire alarm counts and deficiency rollups while enforcing repeater validation", () => {
    const normalized = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "fire_alarm",
      overallNotes: "Alarm visit complete.",
      sectionOrder: ["control-panel", "initiating-devices", "notification", "system-summary"],
      activeSectionId: "control-panel",
      sections: {
        "control-panel": {
          status: "pass",
          notes: "",
          fields: {
            controlPanels: [
              { assetId: "asset_1", assetTag: "FAP-100", panelName: "Main fire alarm panel", manufacturer: "Notifier", model: "NFS2-3030", serialNumber: "FAP-3030-001", location: "Ground floor electrical room", panelPhoto: "", communicationPathType: "dual_path" }
            ],
            controlPanelsInspected: 99,
            lineVoltageStatus: "normal",
            acPowerIndicator: "yes",
            acBreakerLocked: "yes",
            powerSupplyCondition: "deficiency",
            batteryDateCode: "",
            batterySize: "",
            batterySizeOther: "26.8 VDC / 18 AH",
            batteryQuantity: "2",
            batteryChargeLevel: "low",
            batteryLoadTest: "fail",
            batteriesReplacementNeeded: "yes",
            replacementBatterySize: "12v_18ah",
            replacementBatteryQuantity: "2",
            audibleAlarm: "pass",
            visualAlarm: "pass",
            audibleTrouble: "pass",
            visualTrouble: "pass",
            lcdDisplayFunctional: "yes",
            remoteMonitoring: "yes",
            centralStationSignalTest: "deficiency",
            remoteAnnunciator: "yes",
            remoteIndicators: "pass",
            doorAndLockCondition: "good",
            controlPanelCondition: "deficiency",
            controlPanelDeficiencyCount: 0,
            controlPanelComments: ""
          }
        },
        "initiating-devices": {
          status: "pass",
          notes: "",
          fields: {
            initiatingDevices: [
              { assetId: "asset_2", assetTag: "FAI-101", deviceType: "pull_station", location: "Lobby north exit", serialNumber: "Address 12 / Zone 1", functionalTestResult: "pass", physicalCondition: "good", sensitivityOrOperationResult: "pass", comments: "" },
              { assetId: "asset_3", assetTag: "FAI-102", deviceType: "smoke_detector", location: "Second floor east corridor", serialNumber: "Address 17 / Zone 3", functionalTestResult: "deficiency", physicalCondition: "attention", sensitivityOrOperationResult: "fail", comments: "" }
            ],
            initiatingDevicesInspected: 0,
            initiatingDeviceDeficiencyCount: 0,
            initiatingDeviceNotes: ""
          }
        },
        notification: {
          status: "pass",
          notes: "",
          fields: {
            notificationAppliances: [
              { assetId: "asset_4", assetTag: "FAN-201", applianceType: "horn_strobe", quantity: "4", audibleOperation: "pass", visualOperation: "pass", comments: "" },
              { assetId: "asset_5", assetTag: "FAN-202", applianceType: "speaker_strobe", quantity: "other", quantityCustom: 5, audibleOperation: "fail", visualOperation: "pass", comments: "" }
            ],
            notificationAppliancesInspected: 0,
            notificationDeficiencyCount: 0,
            notificationNotes: ""
          }
        },
        "system-summary": {
          status: "attention",
          notes: "",
          fields: {
            controlPanelsInspected: 0,
            initiatingDevicesInspected: 0,
            notificationAppliancesInspected: 0,
            deficiencyCount: 0,
            deficienciesFound: false,
            fireAlarmSystemStatus: "pass_with_deficiencies",
            inspectorNotes: "",
            recommendedRepairs: "",
            followUpRequired: false
          }
        }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Pinecrest Tower",
        customerName: "Pinecrest Property Management",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 2,
        priorReportSummary: ""
      }
    }, "fire_alarm");

    expect((normalized.sections["control-panel"]?.fields.controlPanels as Array<unknown>).length).toBe(1);
    expect(normalized.sections["control-panel"]?.fields.controlPanelsInspected).toBe(1);
    expect(normalized.sections["control-panel"]?.fields.batterySize).toBe("other");
    expect(normalized.sections["control-panel"]?.fields.controlPanelDeficiencyCount).toBe(6);
    expect(normalized.sections["initiating-devices"]?.fields.initiatingDevicesInspected).toBe(2);
    expect(normalized.sections["initiating-devices"]?.fields.initiatingDeviceDeficiencyCount).toBe(1);
    expect(normalized.sections.notification?.fields.notificationAppliancesInspected).toBe(2);
    expect(normalized.sections.notification?.fields.notificationDeficiencyCount).toBe(1);
    expect(normalized.sections["system-summary"]?.fields.deficiencyCount).toBe(8);
    expect(normalized.sections["system-summary"]?.fields.deficienciesFound).toBe(true);

    const invalidFireAlarmDraft = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "fire_alarm",
      overallNotes: "",
      sectionOrder: ["control-panel", "initiating-devices", "notification", "system-summary"],
      activeSectionId: "control-panel",
      sections: {
        "control-panel": {
          status: "pending",
          notes: "",
          fields: {
            controlPanels: [],
            controlPanelsInspected: 0
          }
        },
        "initiating-devices": { status: "pending", notes: "", fields: { initiatingDevices: [], initiatingDevicesInspected: 0 } },
        notification: { status: "pending", notes: "", fields: { notificationAppliances: [], notificationAppliancesInspected: 0 } },
        "system-summary": { status: "pending", notes: "", fields: { deficiencyCount: 0, deficienciesFound: false, fireAlarmSystemStatus: "", inspectorNotes: "", recommendedRepairs: "", followUpRequired: false } }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Pinecrest Tower",
        customerName: "Pinecrest Property Management",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 0,
        priorReportSummary: ""
      }
    }, "fire_alarm");

    expect(() => validateFinalizationDraft(invalidFireAlarmDraft)).toThrow("Add at least one fire alarm control panel before finalizing.");
  });

  it("duplicates fire alarm initiating device rows in sequential order without changing row values", () => {
    const rows = [
      { __rowId: "row_1", assetId: "asset_1", assetTag: "FAI-101", deviceType: "pull_station", location: "Lobby", serialNumber: "Address 12 / Zone 1", functionalTestResult: "pass", physicalCondition: "good", sensitivityOrOperationResult: "pass", comments: "" },
      { __rowId: "row_2", assetId: "asset_2", assetTag: "FAI-102", deviceType: "smoke_detector", location: "Corridor", serialNumber: "Address 17 / Zone 3", functionalTestResult: "pass", physicalCondition: "good", sensitivityOrOperationResult: "pass", comments: "" }
    ];

    const duplicated = duplicateRepeaterRows(rows, 0);

    expect(duplicated).toHaveLength(3);
    expect(duplicated[0]).toEqual(rows[0]);
    expect({ ...duplicated[1], __rowId: rows[0].__rowId }).toEqual(rows[0]);
    expect(duplicated[1]?.__rowId).not.toBe(rows[0].__rowId);
    expect(duplicated[2]).toEqual(rows[1]);
  });

  it("uses config defaults for manually added fire alarm rows", () => {
    const template = resolveReportTemplate({ inspectionType: "fire_alarm", assets: [] });

    const initiatingDefaults = buildRepeaterRowDefaults(template, "initiating-devices", "initiatingDevices");
    const notificationDefaults = buildRepeaterRowDefaults(template, "notification", "notificationAppliances");

    expect(initiatingDefaults.functionalTestResult).toBe("pass");
    expect(initiatingDefaults.physicalCondition).toBe("good");
    expect(notificationDefaults.audibleOperation).toBe("pass");
    expect(notificationDefaults.visualOperation).toBe("pass");
    expect(notificationDefaults.quantity).toBe("1");
  });

  it("uses shared sequential defaults for kitchen hood rows", () => {
    const template = resolveReportTemplate({ inspectionType: "kitchen_suppression", assets: [] });
    const firstHood = buildRepeaterRowDefaults(template, "appliance-coverage", "hoods", 0);
    const secondHood = buildRepeaterRowDefaults(template, "appliance-coverage", "hoods", 1);

    expect(firstHood.hoodName).toBe("Hood 1");
    expect(secondHood.hoodName).toBe("Hood 2");
  });

  it("applies bulk result actions to repeater rows and preserves the changes through normalization", () => {
    const template = resolveReportTemplate({ inspectionType: "fire_alarm", assets: [] });
    const rows = [
      { assetId: "asset_1", assetTag: "FAI-101", deviceType: "pull_station", location: "Lobby", serialNumber: "Address 12 / Zone 1", functionalTestResult: "", physicalCondition: "good", sensitivityOrOperationResult: "", comments: "" },
      { assetId: "asset_2", assetTag: "FAI-102", deviceType: "smoke_detector", location: "Corridor", serialNumber: "Address 17 / Zone 3", functionalTestResult: "", physicalCondition: "good", sensitivityOrOperationResult: "", comments: "" }
    ];

    const passedRows = applyRepeaterBulkAction(template, "initiating-devices", "initiatingDevices", rows, "mark_all_pass");
    expect(passedRows.every((row) => row.functionalTestResult === "pass")).toBe(true);

    const clearedRows = applyRepeaterBulkAction(template, "initiating-devices", "initiatingDevices", passedRows, "clear_results");
    expect(clearedRows.every((row) => row.functionalTestResult === "")).toBe(true);

    const normalized = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "fire_alarm",
      overallNotes: "",
      sectionOrder: ["control-panel", "initiating-devices", "notification", "system-summary"],
      activeSectionId: "initiating-devices",
      sections: {
        "control-panel": {
          status: "pass",
          notes: "",
          fields: {
            controlPanels: [{ assetId: "panel", assetTag: "FAP-100", panelName: "Panel", manufacturer: "Notifier", model: "NFS2-3030", serialNumber: "P-1", location: "Elec room", panelPhoto: "", communicationPathType: "dual_path" }],
            controlPanelsInspected: 1
          }
        },
        "initiating-devices": {
          status: "pass",
          notes: "",
          fields: {
            initiatingDevices: passedRows,
            initiatingDevicesInspected: 0,
            initiatingDeviceDeficiencyCount: 0,
            initiatingDeviceNotes: ""
          }
        },
        notification: {
          status: "pass",
          notes: "",
          fields: {
            notificationAppliances: [{ assetId: "fan-1", assetTag: "FAN-201", applianceType: "horn_strobe", quantity: "2", audibleOperation: "pass", visualOperation: "pass", comments: "" }],
            notificationAppliancesInspected: 0,
            notificationDeficiencyCount: 0,
            notificationNotes: ""
          }
        },
        "system-summary": {
          status: "pass",
          notes: "",
          fields: {
            controlPanelsInspected: 0,
            initiatingDevicesInspected: 0,
            notificationAppliancesInspected: 0,
            deficiencyCount: 0,
            deficienciesFound: false,
            fireAlarmSystemStatus: "pass",
            inspectorNotes: "",
            recommendedRepairs: "",
            followUpRequired: false
          }
        }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Pinecrest Tower",
        customerName: "Pinecrest Property Management",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 3,
        priorReportSummary: ""
      }
    }, "fire_alarm");

    const normalizedRows = normalized.sections["initiating-devices"]?.fields.initiatingDevices as Array<Record<string, string>>;
    expect(normalizedRows.every((row) => row.functionalTestResult === "pass")).toBe(true);
    expect(normalized.sections["initiating-devices"]?.fields.initiatingDevicesInspected).toBe(2);
  });

  it("builds live fire alarm deficiency and progress summary from repeater results", () => {
    const preview = buildReportPreview(validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "fire_alarm",
      overallNotes: "",
      sectionOrder: ["control-panel", "initiating-devices", "notification", "system-summary"],
      activeSectionId: "initiating-devices",
      sections: {
        "control-panel": {
          status: "pass",
          notes: "",
          fields: {
            controlPanels: [{ assetId: "panel", assetTag: "FAP-100", panelName: "Panel", manufacturer: "Notifier", model: "NFS2-3030", serialNumber: "P-1", location: "Elec room", panelPhoto: "", communicationPathType: "dual_path" }],
            controlPanelsInspected: 1
          }
        },
        "initiating-devices": {
          status: "attention",
          notes: "",
          fields: {
            initiatingDevices: [
              { assetId: "asset_1", assetTag: "FAI-101", deviceType: "pull_station", location: "Lobby", serialNumber: "Address 12 / Zone 1", functionalTestResult: "pass", physicalCondition: "good", sensitivityOrOperationResult: "pass", comments: "" },
              { assetId: "asset_2", assetTag: "FAI-102", deviceType: "smoke_detector", location: "Corridor", serialNumber: "Address 17 / Zone 3", functionalTestResult: "fail", physicalCondition: "good", sensitivityOrOperationResult: "pass", comments: "" },
              { assetId: "asset_3", assetTag: "FAI-103", deviceType: "heat_detector", location: "Stair", serialNumber: "Address 18 / Zone 4", functionalTestResult: "", physicalCondition: "good", sensitivityOrOperationResult: "", comments: "" }
            ],
            initiatingDevicesInspected: 0,
            initiatingDeviceDeficiencyCount: 0,
            initiatingDeviceNotes: ""
          }
        },
        notification: {
          status: "attention",
          notes: "",
          fields: {
            notificationAppliances: [
              { assetId: "fan-1", assetTag: "FAN-201", applianceType: "horn_strobe", quantity: "2", audibleOperation: "pass", visualOperation: "pass", comments: "" },
              { assetId: "fan-2", assetTag: "FAN-202", applianceType: "speaker", quantity: "1", audibleOperation: "", visualOperation: "", comments: "" }
            ],
            notificationAppliancesInspected: 0,
            notificationDeficiencyCount: 0,
            notificationNotes: ""
          }
        },
        "system-summary": {
          status: "attention",
          notes: "",
          fields: {
            controlPanelsInspected: 0,
            initiatingDevicesInspected: 0,
            notificationAppliancesInspected: 0,
            deficiencyCount: 0,
            deficienciesFound: false,
            fireAlarmSystemStatus: "pass_with_deficiencies",
            inspectorNotes: "",
            recommendedRepairs: "",
            followUpRequired: false
          }
        }
      },
      deficiencies: [{ id: "manual_1", title: "Manual deficiency", description: "Added manually", severity: "medium", status: "open", assetId: null }],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Pinecrest Tower",
        customerName: "Pinecrest Property Management",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 5,
        priorReportSummary: ""
      }
    }, "fire_alarm"));

    expect(preview.deficiencyCount).toBe(1);
    expect(preview.manualDeficiencyCount).toBe(1);
    expect(preview.inspectionStatus).toBe("deficiencies_found");
    expect(preview.completedRows).toBe(3);
    expect(preview.totalRows).toBe(5);
    expect(preview.reportCompletion).toBeCloseTo(0.6);
    expect(preview.detectedDeficiencies).toHaveLength(1);
    expect(preview.detectedDeficiencies[0]?.rowLabel).toContain("Corridor");
    expect(preview.sectionSummaries.find((summary) => summary.sectionId === "initiating-devices")?.completionState).toBe("partial");
    expect(preview.sectionSummaries.find((summary) => summary.sectionId === "notification")?.completionState).toBe("partial");
  });

  it("does not report 100 percent completion while any section is still pending", () => {
    const preview = buildReportPreview(validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "fire_alarm",
      overallNotes: "",
      sectionOrder: ["initiating-devices", "notification", "system-summary"],
      activeSectionId: "system-summary",
      sections: {
        "initiating-devices": {
          status: "pass",
          notes: "",
          fields: {
            initiatingDevices: [
              { __rowId: "row_1", location: "Lobby", deviceType: "smoke_detector", audibleOperation: "pass", visualOperation: "pass", notes: "" }
            ],
            initiatingDevicesInspected: 1
          }
        },
        notification: {
          status: "pass",
          notes: "",
          fields: {
            notificationAppliances: [
              { __rowId: "row_2", location: "Hallway", applianceType: "horn_strobe", audibleOperation: "pass", visualOperation: "pass", notes: "" }
            ],
            notificationAppliancesInspected: 1
          }
        },
        "system-summary": {
          status: "pending",
          notes: "",
          fields: {
            controlPanelsInspected: 0,
            initiatingDevicesInspected: 1,
            notificationAppliancesInspected: 1,
            deficiencyCount: 0,
            deficienciesFound: false,
            fireAlarmSystemStatus: "",
            inspectorNotes: "",
            recommendedRepairs: "",
            followUpRequired: false
          }
        }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Pinecrest Tower",
        customerName: "Pinecrest Property Management",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 2,
        priorReportSummary: ""
      }
    }, "fire_alarm"));

    expect(preview.totalRows).toBeGreaterThan(0);
    expect(preview.reportCompletion).toBeLessThan(1);
    expect(preview.sectionSummaries.find((summary) => summary.sectionId === "system-summary")?.status).toBe("pending");
  });

  it("builds the redesigned wet fire sprinkler report with seeded weekly/monthly/quarterly checklists and carry-forward by requirement key", () => {
    const draft = buildInitialReportDraft({
      inspectionType: "wet_fire_sprinkler",
      siteName: "Harbor Main Campus",
      customerName: "Harbor View Hospital",
      scheduledDate: "2026-03-20T15:00:00.000Z",
      assetCount: 1,
      assets: [
        {
          id: "asset_1",
          name: "Wet riser zone A",
          assetTag: "SPR-200",
          metadata: { location: "Central riser room", componentType: "riser", valveCount: 6 }
        }
      ],
      priorCompletedDraft: {
        templateVersion: 1,
        inspectionType: "wet_fire_sprinkler",
        overallNotes: "",
        sectionOrder: ["service-summary", "riser-room", "sprinkler-heads", "system-checklist", "valves", "alarm-devices"],
        activeSectionId: "service-summary",
        sections: {
          "service-summary": {
            status: "pass",
            notes: "",
            fields: {
              requirementProfile: "nfpa25_2023_baseline",
              visitScope: "combined",
              ownerRepresentative: "Facilities director",
              inspectorLicense: "LIC-4451",
              buildingArea: "North patient tower",
              serviceSummary: "Patient tower wet systems inspected during the quarterly route."
            }
          },
          "riser-room": {
            status: "pass",
            notes: "",
            fields: {
              weeklyItems: [
                {
                  requirementKey: "weekly_control_valves_open",
                  itemLabel: "Verify control valves are in the normal open position and secured, locked, or electronically supervised as required.",
                  referenceLabel: "NFPA 25 weekly wet-pipe inspection baseline",
                  frequency: "weekly",
                  requirementProfileKey: "nfpa25_2023_baseline",
                  requirementEditionLabel: "2023 baseline",
                  result: "fail",
                  deficiencySeverity: "high",
                  deficiencyNotes: "OS&Y valve not fully open on riser A.",
                  correctiveAction: "Valve tagged and office notified for immediate correction.",
                  comments: "Tamper switch still indicated normal.",
                  deficiencyPhoto: ""
                }
              ],
              weeklyItemsCompleted: 1,
              weeklyDeficiencyCount: 1,
              weeklySectionComments: "Weekly checks completed with one control valve exception."
            }
          },
          "sprinkler-heads": {
            status: "pass",
            notes: "",
            fields: {
              monthlyItems: [
                {
                  requirementKey: "monthly_sprinklers_condition",
                  itemLabel: "Inspect accessible sprinklers for loading, corrosion, paint, damage, or obstruction to discharge patterns.",
                  referenceLabel: "NFPA 25 monthly wet-pipe inspection baseline",
                  frequency: "monthly",
                  requirementProfileKey: "nfpa25_2023_baseline",
                  requirementEditionLabel: "2023 baseline",
                  result: "pass",
                  deficiencySeverity: "high",
                  deficiencyNotes: "",
                  correctiveAction: "",
                  comments: "Accessible heads clear in sampled corridors.",
                  deficiencyPhoto: ""
                }
              ],
              monthlyItemsCompleted: 1,
              monthlyDeficiencyCount: 0,
              monthlySectionComments: "Monthly visual inspection complete."
            }
          },
          "system-checklist": {
            status: "pass",
            notes: "",
            fields: {
              quarterlyItems: [
                {
                  requirementKey: "quarterly_main_drain",
                  itemLabel: "Conduct the main drain test, compare to prior records when available, and note any adverse change in supply conditions.",
                  referenceLabel: "NFPA 25 quarterly wet-pipe testing baseline",
                  frequency: "quarterly",
                  requirementProfileKey: "nfpa25_2023_baseline",
                  requirementEditionLabel: "2023 baseline",
                  result: "pass",
                  deficiencySeverity: "high",
                  deficiencyNotes: "",
                  correctiveAction: "",
                  comments: "Main drain reading consistent with prior quarter.",
                  deficiencyPhoto: ""
                }
              ],
              quarterlyItemsCompleted: 1,
              quarterlyDeficiencyCount: 0,
              quarterlySectionComments: "Quarterly functional items completed."
            }
          },
          valves: {
            status: "pass",
            notes: "",
            fields: {
              impairmentObserved: true,
              systemOutOfService: false,
              impairmentSummary: "One valve supervision deficiency noted.",
              notificationsMade: "Owner representative notified before departure."
            }
          },
          "alarm-devices": {
            status: "pass",
            notes: "",
            fields: {
              recommendedRepairs: "Reset valve to full open position and verify tamper after adjustment.",
              correctiveActionsCompleted: "",
              followUpRequired: true,
              overallInspectionResult: "follow_up_required",
              customerFacingSummary: "Inspection completed with one open item requiring follow-up."
            }
          }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: {
          siteName: "Harbor Main Campus",
          customerName: "Harbor View Hospital",
          scheduledDate: "2025-03-20T15:00:00.000Z",
          assetCount: 1,
          priorReportSummary: ""
        }
      }
    });

    const systemRows = draft.sections["service-summary"]?.fields.systemZones as Array<Record<string, string | number>>;
    const weeklyRows = draft.sections["riser-room"]?.fields.weeklyItems as Array<Record<string, string>>;
    const monthlyRows = draft.sections["sprinkler-heads"]?.fields.monthlyItems as Array<Record<string, string>>;
    const quarterlyRows = draft.sections["system-checklist"]?.fields.quarterlyItems as Array<Record<string, string>>;

    expect(systemRows).toHaveLength(1);
    expect(systemRows[0].assetTag).toBe("SPR-200");
    expect(systemRows[0].systemIdentifier).toBe("Wet riser zone A");
    expect(systemRows[0].location).toBe("Central riser room");
    expect(systemRows[0].controlValveCount).toBe(6);
    expect(draft.sections["service-summary"]?.fields.visitScope).toBe("combined");
    expect(draft.sections["service-summary"]?.fields.ownerRepresentative).toBe("Facilities director");
    expect(weeklyRows).toHaveLength(3);
    expect(monthlyRows).toHaveLength(4);
    expect(quarterlyRows).toHaveLength(4);
    expect(weeklyRows[0]?.result).toBe("fail");
    expect(weeklyRows[0]?.deficiencyNotes).toContain("OS&Y valve");
    expect(monthlyRows[0]?.result).toBe("pass");
    expect(quarterlyRows[2]?.result).toBe("pass");
    expect(draft.sections["service-summary"]?.fields.systemsInspected).toBe(1);
    expect(draft.sections["service-summary"]?.fields.controlValvesObserved).toBe(6);
    expect(draft.sections.valves?.fields.deficiencyCount).toBe(1);
    expect(draft.sections["alarm-devices"]?.fields.overallInspectionResult).toBe("follow_up_required");
  });

  it("auto-populates wet fire sprinkler system context rows when the linked asset changes", () => {
    const template = resolveReportTemplate({
      inspectionType: "wet_fire_sprinkler",
      assets: [
        {
          id: "asset_1",
          name: "Wet riser zone A",
          assetTag: "SPR-200",
          metadata: { location: "Central riser room", componentType: "riser", valveCount: 6 }
        }
      ]
    });

    const updatedRow = applyRepeaterRowSmartUpdate(
      template,
      "service-summary",
      "systemZones",
      {
        assetId: "asset_1",
        assetTag: "",
        systemIdentifier: "",
        location: "",
        componentType: "",
        controlValveCount: ""
      },
      "assetId"
    );

    expect(updatedRow.assetTag).toBe("SPR-200");
    expect(updatedRow.systemIdentifier).toBe("Wet riser zone A");
    expect(updatedRow.location).toBe("Central riser room");
    expect(updatedRow.componentType).toBe("riser");
    expect(updatedRow.controlValveCount).toBe(6);
  });

  it("recomputes redesigned wet fire sprinkler summaries and still enforces required system context before finalization", () => {
    const normalized = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "wet_fire_sprinkler",
      overallNotes: "Wet sprinkler visit complete.",
      sectionOrder: ["service-summary", "riser-room", "sprinkler-heads", "system-checklist", "valves", "alarm-devices"],
      activeSectionId: "service-summary",
      sections: {
        "service-summary": {
          status: "pass",
          notes: "",
          fields: {
            requirementProfile: "nfpa25_2023_baseline",
            visitScope: "quarterly",
            ownerRepresentative: "Facilities lead",
            inspectorLicense: "OK-4451",
            buildingArea: "Main campus",
            serviceSummary: "Wet sprinkler visit complete.",
            systemZones: [
              { assetId: "asset_1", assetTag: "SPR-200", systemIdentifier: "Riser A", location: "Central riser room", componentType: "riser", controlValveCount: 6, comments: "" },
              { assetId: "asset_2", assetTag: "SPR-201", systemIdentifier: "Riser B", location: "South riser room", componentType: "flow_switch", controlValveCount: 1, comments: "" }
            ],
            systemsInspected: 99,
            controlValvesObserved: 0
          }
        },
        "riser-room": {
          status: "pass",
          notes: "",
          fields: {
            weeklyItems: [
              { requirementKey: "weekly_control_valves_open", itemLabel: "Check 1", referenceLabel: "Ref", frequency: "weekly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "high", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "weekly_gauges_normal", itemLabel: "Check 2", referenceLabel: "Ref", frequency: "weekly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "fail", deficiencySeverity: "medium", deficiencyNotes: "Gauge low.", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "weekly_riser_room_condition", itemLabel: "Check 3", referenceLabel: "Ref", frequency: "weekly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "na", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" }
            ],
            weeklyItemsCompleted: 0,
            weeklyDeficiencyCount: 0,
            weeklySectionComments: ""
          }
        },
        "sprinkler-heads": {
          status: "pass",
          notes: "",
          fields: {
            monthlyItems: [
              { requirementKey: "monthly_sprinklers_condition", itemLabel: "Check 4", referenceLabel: "Ref", frequency: "monthly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "high", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "monthly_pipe_hangers_condition", itemLabel: "Check 5", referenceLabel: "Ref", frequency: "monthly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "high", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "monthly_spare_heads", itemLabel: "Check 6", referenceLabel: "Ref", frequency: "monthly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "monthly_fdc_access", itemLabel: "Check 7", referenceLabel: "Ref", frequency: "monthly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" }
            ],
            monthlyItemsCompleted: 0,
            monthlyDeficiencyCount: 0,
            monthlySectionComments: ""
          }
        },
        "system-checklist": {
          status: "pass",
          notes: "",
          fields: {
            quarterlyItems: [
              { requirementKey: "quarterly_waterflow_test", itemLabel: "Check 8", referenceLabel: "Ref", frequency: "quarterly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "high", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "quarterly_supervisory_test", itemLabel: "Check 9", referenceLabel: "Ref", frequency: "quarterly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "high", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "quarterly_main_drain", itemLabel: "Check 10", referenceLabel: "Ref", frequency: "quarterly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "fail", deficiencySeverity: "high", deficiencyNotes: "Drain reading dropped significantly.", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "quarterly_valve_housekeeping", itemLabel: "Check 11", referenceLabel: "Ref", frequency: "quarterly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "na", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" }
            ],
            quarterlyItemsCompleted: 0,
            quarterlyDeficiencyCount: 0,
            quarterlySectionComments: ""
          }
        },
        valves: {
          status: "pass",
          notes: "",
          fields: { deficiencyCount: 0, impairmentObserved: true, systemOutOfService: false, impairmentSummary: "One weekly and one quarterly deficiency.", notificationsMade: "Owner notified." }
        },
        "alarm-devices": {
          status: "pass",
          notes: "",
          fields: { recommendedRepairs: "Restore valve position and investigate supply change.", correctiveActionsCompleted: "", followUpRequired: true, overallInspectionResult: "follow_up_required", customerFacingSummary: "Two issues require follow-up." }
        }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Harbor Main Campus",
        customerName: "Harbor View Hospital",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 2,
        priorReportSummary: ""
      }
    }, "wet_fire_sprinkler");

    expect((normalized.sections["service-summary"]?.fields.systemZones as Array<unknown>).length).toBe(2);
    expect(normalized.sections["service-summary"]?.fields.systemsInspected).toBe(2);
    expect(normalized.sections["service-summary"]?.fields.controlValvesObserved).toBe(7);
    expect(normalized.sections["riser-room"]?.fields.weeklyItemsCompleted).toBe(3);
    expect(normalized.sections["sprinkler-heads"]?.fields.monthlyItemsCompleted).toBe(4);
    expect(normalized.sections["system-checklist"]?.fields.quarterlyItemsCompleted).toBe(4);
    expect(normalized.sections["riser-room"]?.fields.weeklyDeficiencyCount).toBe(1);
    expect(normalized.sections["system-checklist"]?.fields.quarterlyDeficiencyCount).toBe(1);
    expect(normalized.sections.valves?.fields.deficiencyCount).toBe(2);

    const invalidWetSprinklerDraft = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "wet_fire_sprinkler",
      overallNotes: "",
      sectionOrder: ["service-summary", "riser-room", "sprinkler-heads", "system-checklist", "valves", "alarm-devices"],
      activeSectionId: "service-summary",
      sections: {
        "service-summary": {
          status: "pending",
          notes: "",
          fields: {
            requirementProfile: "",
            visitScope: "",
            ownerRepresentative: "",
            inspectorLicense: "",
            buildingArea: "",
            serviceSummary: "",
            systemZones: [],
            systemsInspected: 0,
            controlValvesObserved: 0
          }
        },
        "riser-room": {
          status: "pending",
          notes: "",
          fields: {
            weeklyItems: [],
            weeklyItemsCompleted: 0,
            weeklyDeficiencyCount: 0,
            weeklySectionComments: ""
          }
        },
        "sprinkler-heads": {
          status: "pending",
          notes: "",
          fields: {
            monthlyItems: [],
            monthlyItemsCompleted: 0,
            monthlyDeficiencyCount: 0,
            monthlySectionComments: ""
          }
        },
        "system-checklist": {
          status: "pending",
          notes: "",
          fields: {
            quarterlyItems: [],
            quarterlyItemsCompleted: 0,
            quarterlyDeficiencyCount: 0,
            quarterlySectionComments: ""
          }
        },
        valves: { status: "pending", notes: "", fields: { deficiencyCount: 0, impairmentObserved: false, systemOutOfService: false, impairmentSummary: "", notificationsMade: "" } },
        "alarm-devices": { status: "pending", notes: "", fields: { recommendedRepairs: "", correctiveActionsCompleted: "", followUpRequired: false, overallInspectionResult: "", customerFacingSummary: "" } }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Harbor Main Campus",
        customerName: "Harbor View Hospital",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 0,
        priorReportSummary: ""
      }
    }, "wet_fire_sprinkler");

    expect(() => validateFinalizationDraft(invalidWetSprinklerDraft)).toThrow("Add at least one wet sprinkler system or riser before finalizing.");
  });

  it("prefills backflow assemblies from tenant-scoped asset data and prior completed reports", () => {
    const draft = buildInitialReportDraft({
      inspectionType: "backflow",
      siteName: "Harbor Main Campus",
      customerName: "Harbor View Hospital",
      scheduledDate: "2026-03-20T15:00:00.000Z",
      assetCount: 1,
      assets: [
        {
          id: "asset_1",
          name: "Backflow preventer",
          assetTag: "BF-210",
          metadata: { location: "Loading dock mechanical", assemblyType: "rpz", sizeInches: 4, serialNumber: "BF-RPZ-4421" }
        }
      ],
      priorCompletedDraft: {
        templateVersion: 1,
        inspectionType: "backflow",
        overallNotes: "",
        sectionOrder: ["assembly", "test-results", "certification"],
        activeSectionId: "assembly",
        sections: {
          assembly: {
            status: "pass",
            notes: "",
            fields: {
              assemblies: [
                {
                  assetId: "asset_1",
                  assetTag: "BF-210",
                  location: "Loading dock mechanical",
                  assemblyType: "dcda",
                  sizeInches: 3,
                  serialNumber: "OLDER-SERIAL",
                  serialVerified: false
                }
              ],
              assembliesInspected: 1,
              allSerialsVerified: false
            }
          },
          "test-results": {
            status: "pass",
            notes: "",
            fields: { checkValveOnePsi: 7.4, checkValveTwoPsi: 4.2, reliefValveOpened: true }
          },
          certification: {
            status: "pass",
            notes: "",
            fields: { testOutcome: "pass", repairRecommended: false, certificationNotes: "" }
          }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: {
          siteName: "Harbor Main Campus",
          customerName: "Harbor View Hospital",
          scheduledDate: "2025-03-20T15:00:00.000Z",
          assetCount: 1,
          priorReportSummary: ""
        }
      }
    });

    const rows = draft.sections.assembly?.fields.assemblies as Array<Record<string, string | number | boolean>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].assetTag).toBe("BF-210");
    expect(rows[0].location).toBe("Loading dock mechanical");
    expect(rows[0].assemblyType).toBe("rpz");
    expect(rows[0].sizeInches).toBe(4);
    expect(rows[0].serialNumber).toBe("BF-RPZ-4421");
    expect(draft.sections.assembly?.fields.assembliesInspected).toBe(1);
    expect(draft.sections.assembly?.fields.allSerialsVerified).toBe(true);
    expect(draft.sections["test-results"]?.fields.checkValveOnePsi).toBe(7.4);
    expect(draft.sections.certification?.fields.testOutcome).toBe("pass");
  });

  it("auto-populates backflow assembly rows when the linked asset changes", () => {
    const template = resolveReportTemplate({
      inspectionType: "backflow",
      assets: [
        {
          id: "asset_1",
          name: "Backflow preventer",
          assetTag: "BF-210",
          metadata: { location: "Loading dock mechanical", assemblyType: "rpz", sizeInches: 4, serialNumber: "BF-RPZ-4421" }
        }
      ]
    });

    const updatedRow = applyRepeaterRowSmartUpdate(
      template,
      "assembly",
      "assemblies",
      {
        assetId: "asset_1",
        assetTag: "",
        location: "",
        assemblyType: "",
        sizeInches: "",
        serialNumber: "",
        serialVerified: false
      },
      "assetId"
    );

    expect(updatedRow.assetTag).toBe("BF-210");
    expect(updatedRow.location).toBe("Loading dock mechanical");
    expect(updatedRow.assemblyType).toBe("rpz");
    expect(updatedRow.sizeInches).toBe(4);
    expect(updatedRow.serialNumber).toBe("BF-RPZ-4421");
  });

  it("recomputes backflow calculated fields and enforces repeater validation during normalization", () => {
    const normalized = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "backflow",
      overallNotes: "Backflow visit complete.",
      sectionOrder: ["assembly", "test-results", "certification"],
      activeSectionId: "assembly",
      sections: {
        assembly: {
          status: "pass",
          notes: "",
          fields: {
            assemblies: [
              {
                assetId: "asset_1",
                assetTag: "BF-210",
                location: "Loading dock mechanical",
                assemblyType: "rpz",
                sizeInches: 4,
                serialNumber: "BF-RPZ-4421",
                serialVerified: true
              },
              {
                assetId: "asset_2",
                assetTag: "BF-211",
                location: "Boiler room",
                assemblyType: "dcda",
                sizeInches: 6,
                serialNumber: "BF-DCDA-7711",
                serialVerified: false
              }
            ],
            assembliesInspected: 99,
            allSerialsVerified: true
          }
        },
        "test-results": {
          status: "pass",
          notes: "",
          fields: { checkValveOnePsi: 7.4, checkValveTwoPsi: 4.2, reliefValveOpened: true }
        },
        certification: {
          status: "pass",
          notes: "",
          fields: { testOutcome: "pass", repairRecommended: false, certificationNotes: "" }
        }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Harbor Main Campus",
        customerName: "Harbor View Hospital",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 2,
        priorReportSummary: ""
      }
    }, "backflow");

    expect((normalized.sections.assembly?.fields.assemblies as Array<unknown>).length).toBe(2);
    expect(normalized.sections.assembly?.fields.assembliesInspected).toBe(2);
    expect(normalized.sections.assembly?.fields.allSerialsVerified).toBe(false);

    const invalidBackflowDraft = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "backflow",
      overallNotes: "",
      sectionOrder: ["assembly", "test-results", "certification"],
      activeSectionId: "assembly",
      sections: {
        assembly: {
          status: "pending",
          notes: "",
          fields: {
            assemblies: [],
            assembliesInspected: 0,
            allSerialsVerified: false
          }
        },
        "test-results": { status: "pending", notes: "", fields: { checkValveOnePsi: "", checkValveTwoPsi: "", reliefValveOpened: false } },
        certification: { status: "pending", notes: "", fields: { testOutcome: "", repairRecommended: false, certificationNotes: "" } }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Harbor Main Campus",
        customerName: "Harbor View Hospital",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 0,
        priorReportSummary: ""
      }
    }, "backflow");

    expect(() => validateFinalizationDraft(invalidBackflowDraft)).toThrow("Add at least one backflow assembly before finalizing.");
  });

  it("prefills fire pump assets and carries forward operational defaults", () => {
    const draft = buildInitialReportDraft({
      inspectionType: "fire_pump",
      siteName: "Harbor Main Campus",
      customerName: "Harbor View Hospital",
      scheduledDate: "2026-03-20T15:00:00.000Z",
      assetCount: 1,
      assets: [
        {
          id: "asset_1",
          name: "Fire pump assembly",
          assetTag: "PMP-220",
          metadata: { location: "Pump room", controller: "Metron EconoMatic", driverType: "Electric" }
        }
      ],
      priorCompletedDraft: {
        templateVersion: 1,
        inspectionType: "fire_pump",
        overallNotes: "",
        sectionOrder: ["pump-room", "controller", "run-test"],
        activeSectionId: "pump-room",
        sections: {
          "pump-room": {
            status: "pass",
            notes: "",
            fields: {
              pumpAssets: [
                {
                  assetId: "asset_1",
                  assetTag: "PMP-220",
                  location: "Pump room",
                  controllerModel: "Older Controller",
                  driverType: "Diesel"
                }
              ],
              pumpsInspected: 1,
              roomCondition: "pass",
              environmentNormal: true,
              roomNotes: ""
            }
          },
          controller: {
            status: "pass",
            notes: "",
            fields: { controllerNormal: true, powerSourceStatus: "pass", controllerNotes: "" }
          },
          "run-test": {
            status: "pass",
            notes: "",
            fields: { runDurationMinutes: 45, suctionPressure: "stable", runTestNotes: "" }
          }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: {
          siteName: "Harbor Main Campus",
          customerName: "Harbor View Hospital",
          scheduledDate: "2025-03-20T15:00:00.000Z",
          assetCount: 1,
          priorReportSummary: ""
        }
      }
    });

    const rows = draft.sections["pump-room"]?.fields.pumpAssets as Array<Record<string, string>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].assetTag).toBe("PMP-220");
    expect(rows[0].location).toBe("Pump room");
    expect(rows[0].controllerModel).toBe("Metron EconoMatic");
    expect(rows[0].driverType).toBe("Electric");
    expect(draft.sections["pump-room"]?.fields.pumpsInspected).toBe(1);
    expect(draft.sections.controller?.fields.powerSourceStatus).toBe("pass");
    expect(draft.sections["run-test"]?.fields.runDurationMinutes).toBe(45);
  });

  it("auto-populates fire pump asset rows when the linked asset changes", () => {
    const template = resolveReportTemplate({
      inspectionType: "fire_pump",
      assets: [
        {
          id: "asset_1",
          name: "Fire pump assembly",
          assetTag: "PMP-220",
          metadata: { location: "Pump room", controller: "Metron EconoMatic", driverType: "Electric" }
        }
      ]
    });

    const updatedRow = applyRepeaterRowSmartUpdate(
      template,
      "pump-room",
      "pumpAssets",
      {
        assetId: "asset_1",
        assetTag: "",
        location: "",
        controllerModel: "",
        driverType: ""
      },
      "assetId"
    );

    expect(updatedRow.assetTag).toBe("PMP-220");
    expect(updatedRow.location).toBe("Pump room");
    expect(updatedRow.controllerModel).toBe("Metron EconoMatic");
    expect(updatedRow.driverType).toBe("Electric");
  });

  it("recomputes fire pump calculated fields and enforces repeater validation during normalization", () => {
    const normalized = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "fire_pump",
      overallNotes: "Pump run complete.",
      sectionOrder: ["pump-room", "controller", "run-test"],
      activeSectionId: "pump-room",
      sections: {
        "pump-room": {
          status: "pass",
          notes: "",
          fields: {
            pumpAssets: [
              {
                assetId: "asset_1",
                assetTag: "PMP-220",
                location: "Pump room",
                controllerModel: "Metron EconoMatic",
                driverType: "Electric"
              },
              {
                assetId: "asset_2",
                assetTag: "PMP-221",
                location: "Auxiliary pump room",
                controllerModel: "Tornatech GPD",
                driverType: "Diesel"
              }
            ],
            pumpsInspected: 99,
            roomCondition: "pass",
            environmentNormal: true,
            roomNotes: ""
          }
        },
        controller: {
          status: "pass",
          notes: "",
          fields: { controllerNormal: true, powerSourceStatus: "pass", controllerNotes: "" }
        },
        "run-test": {
          status: "pass",
          notes: "",
          fields: { runDurationMinutes: 30, suctionPressure: "stable", runTestNotes: "" }
        }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Harbor Main Campus",
        customerName: "Harbor View Hospital",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 2,
        priorReportSummary: ""
      }
    }, "fire_pump");

    expect((normalized.sections["pump-room"]?.fields.pumpAssets as Array<unknown>).length).toBe(2);
    expect(normalized.sections["pump-room"]?.fields.pumpsInspected).toBe(2);

    const invalidFirePumpDraft = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "fire_pump",
      overallNotes: "",
      sectionOrder: ["pump-room", "controller", "run-test"],
      activeSectionId: "pump-room",
      sections: {
        "pump-room": {
          status: "pending",
          notes: "",
          fields: {
            pumpAssets: [],
            pumpsInspected: 0,
            roomCondition: "",
            environmentNormal: false,
            roomNotes: ""
          }
        },
        controller: { status: "pending", notes: "", fields: { controllerNormal: false, powerSourceStatus: "", controllerNotes: "" } },
        "run-test": { status: "pending", notes: "", fields: { runDurationMinutes: "", suctionPressure: "", runTestNotes: "" } }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Harbor Main Campus",
        customerName: "Harbor View Hospital",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 0,
        priorReportSummary: ""
      }
    }, "fire_pump");

    expect(() => validateFinalizationDraft(invalidFirePumpDraft)).toThrow("Add at least one fire pump asset before finalizing.");
  });

  it("prefills dry fire sprinkler assemblies from asset data and carries forward operational defaults", () => {
    const draft = buildInitialReportDraft({
      inspectionType: "dry_fire_sprinkler",
      siteName: "Summit Distribution Hub",
      customerName: "Summit Logistics",
      scheduledDate: "2026-03-20T15:00:00.000Z",
      assetCount: 1,
      assets: [
        {
          id: "asset_1",
          name: "Warehouse dry valve",
          assetTag: "DRY-300",
          metadata: {
            location: "North warehouse mezzanine",
            valveType: "Dry pipe valve",
            compressorType: "Tank-mounted air compressor",
            quickOpeningDevice: "Accelerator installed",
            drainCount: 3
          }
        }
      ],
      priorCompletedDraft: {
        templateVersion: 1,
        inspectionType: "dry_fire_sprinkler",
        overallNotes: "",
        sectionOrder: ["dry-valve", "air-supply", "drains-and-trip"],
        activeSectionId: "dry-valve",
        sections: {
          "dry-valve": {
            status: "pass",
            notes: "",
            fields: {
              dryValveAssemblies: [
                {
                  assetId: "asset_1",
                  assetTag: "DRY-300",
                  location: "North warehouse mezzanine",
                  valveType: "Preaction valve",
                  compressorType: "Wall-mounted compressor",
                  quickOpeningDevice: "Exhauster installed",
                  drainCount: 1
                }
              ],
              assembliesInspected: 1,
              valveCondition: "attention",
              trimSecure: false,
              valveAssemblyNotes: ""
            }
          },
          "air-supply": {
            status: "pass",
            notes: "",
            fields: { compressorOperational: true, airPressureStatus: "stable", airSupplyNotes: "" }
          },
          "drains-and-trip": {
            status: "pass",
            notes: "",
            fields: { auxDrainsCleared: true, tripReadiness: "pass", tripNotes: "" }
          }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: {
          siteName: "Summit Distribution Hub",
          customerName: "Summit Logistics",
          scheduledDate: "2025-03-20T15:00:00.000Z",
          assetCount: 1,
          priorReportSummary: ""
        }
      }
    });

    const rows = draft.sections["dry-valve"]?.fields.dryValveAssemblies as Array<Record<string, string | number>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].assetTag).toBe("DRY-300");
    expect(rows[0].location).toBe("North warehouse mezzanine");
    expect(rows[0].valveType).toBe("Dry pipe valve");
    expect(rows[0].compressorType).toBe("Tank-mounted air compressor");
    expect(rows[0].quickOpeningDevice).toBe("Accelerator installed");
    expect(rows[0].drainCount).toBe(3);
    expect(draft.sections["dry-valve"]?.fields.assembliesInspected).toBe(1);
    expect(draft.sections["air-supply"]?.fields.airPressureStatus).toBe("stable");
    expect(draft.sections["drains-and-trip"]?.fields.tripReadiness).toBe("pass");
  });

  it("auto-populates dry fire sprinkler rows when the linked asset changes", () => {
    const template = resolveReportTemplate({
      inspectionType: "dry_fire_sprinkler",
      assets: [
        {
          id: "asset_1",
          name: "Warehouse dry valve",
          assetTag: "DRY-300",
          metadata: {
            location: "North warehouse mezzanine",
            valveType: "Dry pipe valve",
            compressorType: "Tank-mounted air compressor",
            quickOpeningDevice: "Accelerator installed",
            drainCount: 3
          }
        }
      ]
    });

    const updatedRow = applyRepeaterRowSmartUpdate(
      template,
      "dry-valve",
      "dryValveAssemblies",
      {
        assetId: "asset_1",
        assetTag: "",
        location: "",
        valveType: "",
        compressorType: "",
        quickOpeningDevice: "",
        drainCount: ""
      },
      "assetId"
    );

    expect(updatedRow.assetTag).toBe("DRY-300");
    expect(updatedRow.location).toBe("North warehouse mezzanine");
    expect(updatedRow.valveType).toBe("Dry pipe valve");
    expect(updatedRow.compressorType).toBe("Tank-mounted air compressor");
    expect(updatedRow.quickOpeningDevice).toBe("Accelerator installed");
    expect(updatedRow.drainCount).toBe(3);
  });

  it("recomputes dry fire sprinkler calculated fields and enforces repeater validation during normalization", () => {
    const normalized = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "dry_fire_sprinkler",
      overallNotes: "Dry sprinkler visit complete.",
      sectionOrder: ["dry-valve", "air-supply", "drains-and-trip"],
      activeSectionId: "dry-valve",
      sections: {
        "dry-valve": {
          status: "pass",
          notes: "",
          fields: {
            dryValveAssemblies: [
              {
                assetId: "asset_1",
                assetTag: "DRY-300",
                location: "North warehouse mezzanine",
                valveType: "Dry pipe valve",
                compressorType: "Tank-mounted air compressor",
                quickOpeningDevice: "Accelerator installed",
                drainCount: 3
              },
              {
                assetId: "asset_2",
                assetTag: "DRY-301",
                location: "South warehouse roof deck",
                valveType: "Dry pipe valve",
                compressorType: "Tank-mounted air compressor",
                quickOpeningDevice: "No accelerator",
                drainCount: 2
              }
            ],
            assembliesInspected: 99,
            valveCondition: "pass",
            trimSecure: true,
            valveAssemblyNotes: ""
          }
        },
        "air-supply": {
          status: "pass",
          notes: "",
          fields: { compressorOperational: true, airPressureStatus: "stable", airSupplyNotes: "" }
        },
        "drains-and-trip": {
          status: "pass",
          notes: "",
          fields: { auxDrainsCleared: true, tripReadiness: "pass", tripNotes: "" }
        }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Summit Distribution Hub",
        customerName: "Summit Logistics",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 2,
        priorReportSummary: ""
      }
    }, "dry_fire_sprinkler");

    expect((normalized.sections["dry-valve"]?.fields.dryValveAssemblies as Array<unknown>).length).toBe(2);
    expect(normalized.sections["dry-valve"]?.fields.assembliesInspected).toBe(2);

    const invalidDrySprinklerDraft = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "dry_fire_sprinkler",
      overallNotes: "",
      sectionOrder: ["dry-valve", "air-supply", "drains-and-trip"],
      activeSectionId: "dry-valve",
      sections: {
        "dry-valve": {
          status: "pending",
          notes: "",
          fields: {
            dryValveAssemblies: [],
            assembliesInspected: 0,
            valveCondition: "",
            trimSecure: false,
            valveAssemblyNotes: ""
          }
        },
        "air-supply": { status: "pending", notes: "", fields: { compressorOperational: false, airPressureStatus: "", airSupplyNotes: "" } },
        "drains-and-trip": { status: "pending", notes: "", fields: { auxDrainsCleared: false, tripReadiness: "", tripNotes: "" } }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Summit Distribution Hub",
        customerName: "Summit Logistics",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 0,
        priorReportSummary: ""
      }
    }, "dry_fire_sprinkler");

    expect(() => validateFinalizationDraft(invalidDrySprinklerDraft)).toThrow("Add at least one dry valve assembly before finalizing.");
  });

  it("builds kitchen suppression with system details first and appliance coverage second", () => {
    const draft = buildInitialReportDraft({
      inspectionType: "kitchen_suppression",
      siteName: "Pinecrest West",
      customerName: "Pinecrest Property Management",
      scheduledDate: "2026-03-20T15:00:00.000Z",
      assetCount: 1,
      assets: [
        {
          id: "asset_1",
          name: "Kitchen hood system",
          assetTag: "KIT-400",
          metadata: {
            location: "Ground floor commercial kitchen",
            protectedArea: "Line cook hood",
            pullStationLocation: "South egress by prep sink",
            tankType: "Wet chemical",
            applianceCount: 4
          }
        }
      ],
      priorCompletedDraft: {
        templateVersion: 1,
        inspectionType: "kitchen_suppression",
        overallNotes: "",
        sectionOrder: ["system-details", "appliance-coverage", "system-checklist", "tank-and-service"],
        activeSectionId: "system-details",
        sections: {
          "system-details": {
            status: "pass",
            notes: "",
            fields: {
              systemSizeGallons: 3,
              numberOfCylinders: 2,
              ul300Compliant: true,
              systemLocation: "Ground floor commercial kitchen",
              areaProtected: "Line cook hood",
              manufacturer: "Ansul",
              model: "R-102",
              cylinderDates: "01/2023, 03/2024",
              lastCylinderHydroDate: "2024-03-01"
            }
          },
          "appliance-coverage": {
            status: "pass",
            notes: "",
            fields: {
              hoods: [{ hoodName: "Hood 1", hoodSize: "12 ft", ductSize: "18 x 18", ductQuantity: "1", ductNozzleQuantity: "1", ductNozzleType: "1W" }],
              hoodAppliances: [{ hoodName: "Hood 1", appliance: "Fryer", size: "36 in", applianceNozzleQuantity: "2", applianceNozzleType: "2N" }],
              coverageNotes: ""
            }
          },
          "system-checklist": {
            status: "pass",
            notes: "",
            fields: { allAppliancesProtected: "yes" }
          },
          "tank-and-service": {
            status: "pass",
            notes: "",
            fields: {
              fusibleLinksUsed: [{ temperature: "286°F", quantity: "1" }],
              capsUsed: [{ type: "Rubber", quantity: "0" }],
              cartridgesUsed: [{ type: "", quantity: "0" }],
              serviceNotes: ""
            }
          }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: {
          siteName: "Pinecrest West",
          customerName: "Pinecrest Property Management",
          scheduledDate: "2025-03-20T15:00:00.000Z",
          assetCount: 1,
          priorReportSummary: ""
        }
      }
    });

    expect(draft.sectionOrder[0]).toBe("system-details");
    expect(draft.sectionOrder[1]).toBe("appliance-coverage");
    expect(draft.sectionOrder[2]).toBe("system-checklist");
    expect(draft.sections["system-details"]?.fields.systemLocation).toBe("Ground floor commercial kitchen");
    expect(draft.sections["system-details"]?.fields.areaProtected).toBe("Line cook hood");
    expect(draft.sections["system-details"]?.fields.manufacturer).toBe("Ansul");
    expect(draft.sections["appliance-coverage"]?.fields.hoods).toEqual([]);
    expect(draft.sections["appliance-coverage"]?.fields.hoodAppliances).toEqual([]);
    expect(draft.sections["system-checklist"]?.fields.allAppliancesProtected).toBe("yes");
    expect(draft.sections["system-checklist"]?.fields.ductPlenumProtected).toBe("na");
    expect(draft.sections["system-checklist"]?.fields.hoodCleanedPerNFPA96).toBe("na");
    expect(draft.sections["actuation-and-fuel"]).toBeUndefined();
    expect(draft.sections["tank-and-service"]?.fields.fusibleLinksUsed).toEqual([]);
    expect(draft.sections["tank-and-service"]?.fields.capsUsed).toEqual([]);
    expect(draft.sections["tank-and-service"]?.fields.cartridgesUsed).toEqual([]);
    expect(draft.sections["tank-and-service"]?.fields.serviceNotes).toBe("");
  });

  it("preserves hood and appliance repeater rows for kitchen suppression during normalization", () => {
    const normalized = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "kitchen_suppression",
      overallNotes: "Kitchen suppression visit complete.",
      sectionOrder: ["system-details", "appliance-coverage", "system-checklist", "tank-and-service"],
      activeSectionId: "system-checklist",
      sections: {
        "system-details": {
          status: "pass",
          notes: "",
          fields: {
            systemSizeGallons: 3,
            numberOfCylinders: 2,
            ul300Compliant: true,
            systemLocation: "Ground floor commercial kitchen",
            areaProtected: "Line cook hood",
            manufacturer: "Ansul",
            model: "R-102",
            cylinderDates: "01/2023, 03/2024",
            lastCylinderHydroDate: "2024-03-01"
          }
        },
        "appliance-coverage": {
          status: "pass",
          notes: "",
          fields: {
            hoods: [
              { hoodName: "Hood 1", hoodSize: "12 ft", ductSize: "18 x 18", ductQuantity: "1", ductNozzleQuantity: "1", ductNozzleType: "1W" },
              { hoodName: "Hood 2", hoodSize: "14 ft", ductSize: "20 x 20", ductQuantity: "2", ductNozzleQuantity: "2", ductNozzleType: "2W" }
            ],
            hoodAppliances: [
              { hoodName: "Hood 1", appliance: "Fryer", size: "36 in", applianceNozzleQuantity: "2", applianceNozzleType: "2N" },
              { hoodName: "Hood 2", appliance: "Range", size: "48 in", applianceNozzleQuantity: "3", applianceNozzleType: "3N" }
            ],
            coverageNotes: ""
          }
        },
        "system-checklist": {
          status: "pass",
          notes: "",
          fields: {
            allAppliancesProtected: "yes",
            ductPlenumProtected: "yes",
            nozzlePositioningCorrect: "yes",
            systemInstalledPerMfgUl: "yes",
            penetrationsSealedProperly: "yes",
            pressureGaugeInRange: "na",
            cartridgeWeightWithinSpec: "na",
            cylinderChemicalCondition: "yes",
            manualPullStationTested: "yes",
            testLinkOperated: "yes",
            fuelShutdownVerified: "yes",
            nozzlesCleanCapped: "yes",
            detectionLinksPlacement: "yes",
            fusibleLinksReplaced: "na",
            cableTravelChecked: "yes",
            pipingSecured: "yes",
            flameFryerSeparation: "yes",
            fireAlarmInterconnectWorking: "na",
            gasValveTestedReset: "yes",
            pipingObstructionTested: "na",
            filtersInstalledCorrectly: "yes",
            exhaustFanOperational: "yes",
            kClassExtinguisherPresent: "yes",
            hoodCleanedPerNFPA96: "yes"
          }
        },
        "tank-and-service": {
          status: "pass",
          notes: "",
          fields: {
            fusibleLinksUsed: [{ temperature: "286°F", quantity: "1" }],
            capsUsed: [{ type: "Rubber", quantity: "0" }],
            cartridgesUsed: [{ type: "", quantity: "0" }],
            serviceNotes: ""
          }
        }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Pinecrest West",
        customerName: "Pinecrest Property Management",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 2,
        priorReportSummary: ""
      }
    }, "kitchen_suppression");

    expect((normalized.sections["appliance-coverage"]?.fields.hoods as Array<unknown>).length).toBe(2);
    expect((normalized.sections["appliance-coverage"]?.fields.hoodAppliances as Array<unknown>).length).toBe(2);
    expect((normalized.sections["appliance-coverage"]?.fields.hoods as Array<Record<string, unknown>>)[0]?.ductQuantity).toBe("1");
    expect((normalized.sections["appliance-coverage"]?.fields.hoodAppliances as Array<Record<string, unknown>>)[0]?.applianceNozzleQuantity).toBe("2");
    expect((normalized.sections["tank-and-service"]?.fields.fusibleLinksUsed as Array<Record<string, unknown>>)[0]?.quantity).toBe("1");
    expect(normalized.sections["system-checklist"]?.fields.allAppliancesProtected).toBe("yes");
    expect(normalized.sections["system-checklist"]?.fields.pressureGaugeInRange).toBe("na");

    const validatedDraft = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "kitchen_suppression",
      overallNotes: "",
      sectionOrder: ["system-details", "appliance-coverage", "system-checklist", "tank-and-service"],
      activeSectionId: "appliance-coverage",
      sections: {
        "system-details": {
          status: "pending",
          notes: "",
          fields: {
            systemSizeGallons: "",
            numberOfCylinders: "",
            ul300Compliant: false,
            systemLocation: "",
            areaProtected: "",
            manufacturer: "",
            model: "",
            cylinderDates: "",
            lastCylinderHydroDate: ""
          }
        },
        "appliance-coverage": {
          status: "pending",
          notes: "",
          fields: {
            hoods: [],
            hoodAppliances: [],
            coverageNotes: ""
          }
        },
        "system-checklist": {
          status: "pending",
          notes: "",
          fields: {
            allAppliancesProtected: "na"
          }
        },
        "tank-and-service": { status: "pending", notes: "", fields: { serviceNotes: "" } }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Pinecrest West",
        customerName: "Pinecrest Property Management",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 0,
        priorReportSummary: ""
      }
    }, "kitchen_suppression");

    expect(() => validateFinalizationDraft(validatedDraft)).toThrow("Add at least one hood before finalizing.");
  });

  it("loads older kitchen suppression payloads safely after the section restructure", () => {
    const draft = buildInitialReportDraft({
      inspectionType: "kitchen_suppression",
      siteName: "Pinecrest West",
      customerName: "Pinecrest Property Management",
      scheduledDate: "2026-03-20T15:00:00.000Z",
      assetCount: 1,
      priorCompletedDraft: {
        templateVersion: 1,
        inspectionType: "kitchen_suppression",
        overallNotes: "",
        sectionOrder: ["appliance-coverage", "actuation-and-fuel", "tank-and-service"],
        activeSectionId: "appliance-coverage",
        sections: {
          "appliance-coverage": {
            status: "pass",
            notes: "",
            fields: {
              protectedSystems: [
                {
                  assetId: "asset_1",
                  assetTag: "KIT-400",
                  location: "Ground floor commercial kitchen",
                  protectedArea: "Line cook hood",
                  pullStationLocation: "South egress by prep sink",
                  tankType: "Wet chemical",
                  applianceCount: 4
                }
              ],
              systemsInspected: 1,
              coveredAppliances: 4,
              nozzleCoverage: "pass",
              coverageNotes: "Legacy coverage notes"
            }
          },
          "actuation-and-fuel": { status: "pass", notes: "", fields: { pullStationAccessible: true, fuelShutoffConfirmed: true, actuationNotes: "" } },
          "tank-and-service": { status: "pass", notes: "", fields: { tankCondition: "pass", sealIntact: true, serviceNotes: "Legacy service note" } }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: {
          siteName: "Pinecrest West",
          customerName: "Pinecrest Property Management",
          scheduledDate: "2026-03-20T15:00:00.000Z",
          assetCount: 1,
          priorReportSummary: ""
        }
      }
    });

    expect(draft.sections["system-details"]).toBeDefined();
    expect(draft.sections["appliance-coverage"]?.fields.hoods).toEqual([]);
    expect(draft.sections["appliance-coverage"]?.fields.hoodAppliances).toEqual([]);
    expect(draft.sections["appliance-coverage"]?.fields.coverageNotes).toBe("Legacy coverage notes");
    expect(draft.sections["system-checklist"]?.fields.allAppliancesProtected).toBe("na");
    expect(draft.sections["actuation-and-fuel"]).toBeUndefined();
    expect(draft.sections["tank-and-service"]?.fields.serviceNotes).toBe("Legacy service note");
  });

  it("prefills industrial suppression systems from asset data and carries forward operational defaults", () => {
    const draft = buildInitialReportDraft({
      inspectionType: "industrial_suppression",
      siteName: "Summit Distribution Hub",
      customerName: "Summit Logistics",
      scheduledDate: "2026-03-20T15:00:00.000Z",
      assetCount: 1,
      assets: [
        {
          id: "asset_1",
          name: "Paint booth industrial suppression",
          assetTag: "IND-301",
          metadata: {
            location: "Paint booth line 2",
            protectedProcess: "Paint booth line 2",
            releasePanel: "Kidde ARIES",
            shutdownDependency: "Conveyor stop and exhaust fan shutdown",
            cylinderCount: 6
          }
        }
      ],
      priorCompletedDraft: {
        templateVersion: 1,
        inspectionType: "industrial_suppression",
        overallNotes: "",
        sectionOrder: ["hazard-equipment", "release-controls", "agent-and-cylinders"],
        activeSectionId: "hazard-equipment",
        sections: {
          "hazard-equipment": {
            status: "pass",
            notes: "",
            fields: {
              protectedSystems: [
                {
                  assetId: "asset_1",
                  assetTag: "IND-301",
                  location: "Paint booth line 2",
                  protectedProcess: "Old process label",
                  releasePanel: "Legacy panel",
                  shutdownDependency: "Old shutdown",
                  cylinderCount: 2
                }
              ],
              systemsInspected: 1,
              equipmentProtected: "Paint booth line 2",
              hazardBoundarySecure: true,
              hazardNotes: ""
            }
          },
          "release-controls": {
            status: "pass",
            notes: "",
            fields: { manualReleaseAccessible: true, controlLogicStatus: "pass", releaseControlNotes: "" }
          },
          "agent-and-cylinders": {
            status: "pass",
            notes: "",
            fields: { cylinderCount: 6, agentPressureStatus: "stable", agentNotes: "" }
          }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: {
          siteName: "Summit Distribution Hub",
          customerName: "Summit Logistics",
          scheduledDate: "2025-03-20T15:00:00.000Z",
          assetCount: 1,
          priorReportSummary: ""
        }
      }
    });

    const rows = draft.sections["hazard-equipment"]?.fields.protectedSystems as Array<Record<string, string | number>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].assetTag).toBe("IND-301");
    expect(rows[0].location).toBe("Paint booth line 2");
    expect(rows[0].protectedProcess).toBe("Paint booth line 2");
    expect(rows[0].releasePanel).toBe("Kidde ARIES");
    expect(rows[0].shutdownDependency).toBe("Conveyor stop and exhaust fan shutdown");
    expect(rows[0].cylinderCount).toBe(6);
    expect(draft.sections["hazard-equipment"]?.fields.systemsInspected).toBe(1);
    expect(draft.sections["release-controls"]?.fields.controlLogicStatus).toBe("pass");
    expect(draft.sections["agent-and-cylinders"]?.fields.agentPressureStatus).toBe("stable");
  });

  it("auto-populates industrial suppression rows when the linked asset changes", () => {
    const template = resolveReportTemplate({
      inspectionType: "industrial_suppression",
      assets: [
        {
          id: "asset_1",
          name: "Paint booth industrial suppression",
          assetTag: "IND-301",
          metadata: {
            location: "Paint booth line 2",
            protectedProcess: "Paint booth line 2",
            releasePanel: "Kidde ARIES",
            shutdownDependency: "Conveyor stop and exhaust fan shutdown",
            cylinderCount: 6
          }
        }
      ]
    });

    const updatedRow = applyRepeaterRowSmartUpdate(
      template,
      "hazard-equipment",
      "protectedSystems",
      {
        assetId: "asset_1",
        assetTag: "",
        location: "",
        protectedProcess: "",
        releasePanel: "",
        shutdownDependency: "",
        cylinderCount: ""
      },
      "assetId"
    );

    expect(updatedRow.assetTag).toBe("IND-301");
    expect(updatedRow.location).toBe("Paint booth line 2");
    expect(updatedRow.protectedProcess).toBe("Paint booth line 2");
    expect(updatedRow.releasePanel).toBe("Kidde ARIES");
    expect(updatedRow.shutdownDependency).toBe("Conveyor stop and exhaust fan shutdown");
    expect(updatedRow.cylinderCount).toBe(6);
  });

  it("recomputes industrial suppression calculated fields and enforces repeater validation during normalization", () => {
    const normalized = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "industrial_suppression",
      overallNotes: "Industrial suppression visit complete.",
      sectionOrder: ["hazard-equipment", "release-controls", "agent-and-cylinders"],
      activeSectionId: "hazard-equipment",
      sections: {
        "hazard-equipment": {
          status: "pass",
          notes: "",
          fields: {
            protectedSystems: [
              {
                assetId: "asset_1",
                assetTag: "IND-301",
                location: "Paint booth line 2",
                protectedProcess: "Paint booth line 2",
                releasePanel: "Kidde ARIES",
                shutdownDependency: "Conveyor stop and exhaust fan shutdown",
                cylinderCount: 6
              },
              {
                assetId: "asset_2",
                assetTag: "IND-302",
                location: "Solvent room",
                protectedProcess: "Solvent transfer manifold",
                releasePanel: "Fike SHP Pro",
                shutdownDependency: "Ventilation shutdown",
                cylinderCount: 4
              }
            ],
            systemsInspected: 99,
            equipmentProtected: "Paint line and solvent room",
            hazardBoundarySecure: true,
            hazardNotes: ""
          }
        },
        "release-controls": {
          status: "pass",
          notes: "",
          fields: { manualReleaseAccessible: true, controlLogicStatus: "pass", releaseControlNotes: "" }
        },
        "agent-and-cylinders": {
          status: "pass",
          notes: "",
          fields: { cylinderCount: 10, agentPressureStatus: "stable", agentNotes: "" }
        }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Summit Distribution Hub",
        customerName: "Summit Logistics",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 2,
        priorReportSummary: ""
      }
    }, "industrial_suppression");

    expect((normalized.sections["hazard-equipment"]?.fields.protectedSystems as Array<unknown>).length).toBe(2);
    expect(normalized.sections["hazard-equipment"]?.fields.systemsInspected).toBe(2);
    expect(normalized.sections["agent-and-cylinders"]?.fields.cylinderCount).toBe(10);

    const invalidIndustrialDraft = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "industrial_suppression",
      overallNotes: "",
      sectionOrder: ["hazard-equipment", "release-controls", "agent-and-cylinders"],
      activeSectionId: "hazard-equipment",
      sections: {
        "hazard-equipment": {
          status: "pending",
          notes: "",
          fields: {
            protectedSystems: [],
            systemsInspected: 0,
            equipmentProtected: "",
            hazardBoundarySecure: false,
            hazardNotes: ""
          }
        },
        "release-controls": { status: "pending", notes: "", fields: { manualReleaseAccessible: false, controlLogicStatus: "", releaseControlNotes: "" } },
        "agent-and-cylinders": { status: "pending", notes: "", fields: { cylinderCount: 0, agentPressureStatus: "", agentNotes: "" } }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Summit Distribution Hub",
        customerName: "Summit Logistics",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 0,
        priorReportSummary: ""
      }
    }, "industrial_suppression");

    expect(() => validateFinalizationDraft(invalidIndustrialDraft)).toThrow("Add at least one industrial suppression system before finalizing.");
  });

  it("prefills emergency exit lighting fixture groups from asset data and carries forward operational defaults", () => {
    const draft = buildInitialReportDraft({
      inspectionType: "emergency_exit_lighting",
      siteName: "Summit Distribution Hub",
      customerName: "Summit Logistics",
      scheduledDate: "2026-03-20T15:00:00.000Z",
      assetCount: 1,
      assets: [
        {
          id: "asset_1",
          name: "Emergency egress lighting",
          assetTag: "EEL-302",
          metadata: {
            location: "Warehouse aisles A-C",
            fixtureType: "Combo Exit / Emergency",
            batteryType: "NiCad"
          }
        }
      ],
      priorCompletedDraft: {
        templateVersion: 1,
        inspectionType: "emergency_exit_lighting",
        overallNotes: "",
        sectionOrder: ["fixture-inventory"],
        activeSectionId: "fixture-inventory",
        sections: {
          "fixture-inventory": {
            status: "pass",
            notes: "",
            fields: {
              fixtureGroups: [
                {
                  assetId: "asset_1",
                  assetTag: "EEL-302",
                  location: "Warehouse aisles A-C",
                  fixtureType: "Emergency Light",
                  status: "pass",
                  notes: "",
                  batteryQuantity: "1",
                  batterySize: "NiCad",
                  batterySizeOther: "",
                  newUnit: false,
                  batteriesReplaced: false,
                  testDuration: "90_minute"
                }
              ],
              systemsInspected: 1,
              fixturesInspected: 1,
              visibilityStatus: "pass",
              inventoryNotes: ""
            }
          }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: {
          siteName: "Summit Distribution Hub",
          customerName: "Summit Logistics",
          scheduledDate: "2025-03-20T15:00:00.000Z",
          assetCount: 1,
          priorReportSummary: ""
        }
      }
    });

    const rows = draft.sections["fixture-inventory"]?.fields.fixtureGroups as Array<Record<string, string | number>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].assetTag).toBe("EEL-302");
    expect(rows[0].location).toBe("Warehouse aisles A-C");
    expect(rows[0].fixtureType).toBe("Combo Exit / Emergency");
    expect(rows[0].status).toBe("pass");
    expect(rows[0].batterySize).toBe("NiCad");
    expect(rows[0].batteryQuantity).toBe("1");
    expect(rows[0].newUnit).toBe(false);
    expect(rows[0].testDuration).toBe("90_minute");
    expect(draft.sections["fixture-inventory"]?.fields.systemsInspected).toBe(1);
    expect(draft.sections["fixture-inventory"]?.fields.fixturesInspected).toBe(1);
  });

  it("auto-populates emergency exit lighting rows when the linked asset changes", () => {
    const template = resolveReportTemplate({
      inspectionType: "emergency_exit_lighting",
      assets: [
        {
          id: "asset_1",
          name: "Emergency egress lighting",
          assetTag: "EEL-302",
          metadata: {
            location: "Warehouse aisles A-C",
            fixtureType: "Combo Exit / Emergency",
            batteryType: "NiCad"
          }
        }
      ]
    });

    const updatedRow = applyRepeaterRowSmartUpdate(
      template,
      "fixture-inventory",
      "fixtureGroups",
      {
        assetId: "asset_1",
        assetTag: "",
        location: "",
        fixtureType: "",
        status: "",
        batteryQuantity: "",
        batterySize: "",
        batterySizeOther: "",
        billingBatterySize: "",
        newUnit: false,
        batteriesReplaced: false,
        testDuration: "",
        notes: ""
      },
      "assetId"
    );

    expect(updatedRow.assetTag).toBe("EEL-302");
    expect(updatedRow.location).toBe("Warehouse aisles A-C");
    expect(updatedRow.fixtureType).toBe("Combo Exit / Emergency");
    expect(updatedRow.batterySize).toBe("NiCad");
  });

  it("recomputes emergency exit lighting calculated fields and enforces repeater validation during normalization", () => {
    const normalized = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "emergency_exit_lighting",
      overallNotes: "Emergency exit lighting visit complete.",
      sectionOrder: ["fixture-inventory"],
      activeSectionId: "fixture-inventory",
      sections: {
        "fixture-inventory": {
          status: "pass",
          notes: "",
          fields: {
            fixtureGroups: [
              {
                assetId: "asset_1",
                assetTag: "EEL-302",
                location: "Warehouse aisles A-C",
                fixtureType: "Combo Exit / Emergency",
                status: "pass",
                batteryQuantity: "2",
                batterySize: "NiCad",
                batterySizeOther: "",
                newUnit: false,
                batteriesReplaced: true,
                testDuration: "30_second",
                notes: ""
              },
              {
                assetId: "asset_2",
                assetTag: "EEL-303",
                location: "Shipping dock exits",
                fixtureType: "Remote Head Unit",
                status: "fail",
                batteryQuantity: "1",
                batterySize: "other",
                batterySizeOther: "8V custom",
                newUnit: true,
                batteriesReplaced: false,
                testDuration: "90_minute",
                notes: ""
              }
            ],
            systemsInspected: 99,
            fixturesInspected: 18,
            visibilityStatus: "pass",
            inventoryNotes: ""
          }
        }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Summit Distribution Hub",
        customerName: "Summit Logistics",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 2,
        priorReportSummary: ""
      }
    }, "emergency_exit_lighting");

    expect((normalized.sections["fixture-inventory"]?.fields.fixtureGroups as Array<unknown>).length).toBe(2);
    expect(normalized.sections["fixture-inventory"]?.fields.systemsInspected).toBe(2);
    expect(normalized.sections["fixture-inventory"]?.fields.fixturesInspected).toBe(2);
    expect((normalized.sections["fixture-inventory"]?.fields.fixtureGroups as Array<Record<string, unknown>>)[1]?.billingBatterySize).toBe("8V custom");
    expect((normalized.sections["fixture-inventory"]?.fields.fixtureGroups as Array<Record<string, unknown>>)[0]?.testDuration).toBe("30_second");

    const thresholdAttentionDraft = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "emergency_exit_lighting",
      overallNotes: "Partial duration completed.",
      sectionOrder: ["fixture-inventory"],
      activeSectionId: "fixture-inventory",
      sections: {
        "fixture-inventory": {
          status: "attention",
          notes: "",
          fields: {
            fixtureGroups: [
              {
                assetId: "asset_1",
                assetTag: "EEL-302",
                location: "Warehouse aisles A-C",
                fixtureType: "Combo Exit / Emergency",
                status: "pass",
                batteryQuantity: "1",
                batterySize: "NiCad",
                batterySizeOther: "",
                newUnit: false,
                batteriesReplaced: false,
                testDuration: "",
                notes: ""
              }
            ],
            systemsInspected: 1,
            fixturesInspected: 1,
            visibilityStatus: "pass",
            inventoryNotes: ""
          }
        }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Summit Distribution Hub",
        customerName: "Summit Logistics",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 1,
        priorReportSummary: ""
      }
    }, "emergency_exit_lighting");

    expect((thresholdAttentionDraft.sections["fixture-inventory"]?.fields.fixtureGroups as Array<Record<string, unknown>>)[0]?.testDuration).toBe("30_second");

    const invalidEmergencyLightingDraft = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "emergency_exit_lighting",
      overallNotes: "",
      sectionOrder: ["fixture-inventory"],
      activeSectionId: "fixture-inventory",
      sections: {
        "fixture-inventory": {
          status: "pending",
          notes: "",
          fields: {
            fixtureGroups: [],
            systemsInspected: 0,
            fixturesInspected: 0,
            visibilityStatus: "",
            inventoryNotes: ""
          }
        }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Summit Distribution Hub",
        customerName: "Summit Logistics",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 0,
        priorReportSummary: ""
      }
    }, "emergency_exit_lighting");

    expect(() => validateFinalizationDraft(invalidEmergencyLightingDraft)).toThrow("Add at least one emergency lighting fixture group before finalizing.");
  });

  it("recomputes calculated smart fields during validation and keeps repeater rows intact for autosave persistence", () => {
    const normalized = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "fire_extinguisher",
      overallNotes: "Inventory updated.",
      sectionOrder: ["inventory", "service"],
      activeSectionId: "inventory",
      sections: {
        inventory: {
          status: "pass",
          notes: "Rows updated on site.",
          fields: {
            extinguishers: [
              { assetId: "asset_1", assetTag: "EXT-100", location: "Lobby", manufacturer: "amerex", ulRating: "legacy", serialNumber: "AMX-44021", extinguisherType: "5 lb ABC", gaugeStatus: "pass", mountingSecure: "pass", lastHydro: "2020-06-01", nextHydro: "" },
              { assetId: "asset_2", assetTag: "EXT-200", location: "Server room", manufacturer: "kidde", ulRating: "", serialNumber: "KID-221", extinguisherType: "10 lb CO2", gaugeStatus: "fail", mountingSecure: "pass", lastHydro: "20", nextHydro: "" }
            ],
            unitsInspected: 99
          }
        },
        service: {
          status: "pass",
          notes: "",
          fields: { followUpRecommended: false, jurisdictionNotes: "" }
        }
      },
      deficiencies: [],
      attachments: [],
      signatures: {},
      context: {
        siteName: "Pinecrest Tower",
        customerName: "Pinecrest Property Management",
        scheduledDate: "2026-03-20T15:00:00.000Z",
        assetCount: 2,
        priorReportSummary: ""
      }
    }, "fire_extinguisher");

    expect((normalized.sections.inventory?.fields.extinguishers as Array<unknown>).length).toBe(2);
    expect(normalized.sections.inventory?.fields.unitsInspected).toBe(2);
    const normalizedRows = normalized.sections.inventory?.fields.extinguishers as Array<Record<string, string>>;
    expect(normalizedRows[0]?.ulRating).toBe("3-A:40-B:C");
    expect(normalizedRows[0]?.lastHydro).toBe("20");
    expect(normalizedRows[0]?.nextHydro).toBe("32");
    expect(normalizedRows[1]?.nextHydro).toBe("25");
  });

  it("includes smart repeater content in finalized extinguisher PDFs", async () => {
    const bytes = await generateInspectionReportPdf({
      tenant: { name: "Evergreen Fire Protection", branding: { primaryColor: "#1E3A5F", accentColor: "#C2410C" } },
      customerCompany: { name: "Pinecrest Property Management", contactName: "Alyssa Reed", billingEmail: "ap@pinecrestpm.com", phone: "312-555-0110" },
      site: { name: "Pinecrest Tower", addressLine1: "100 State St", addressLine2: null, city: "Chicago", state: "IL", postalCode: "60601" },
      inspection: { id: "inspection_1", scheduledStart: new Date("2026-03-12T09:00:00.000Z"), scheduledEnd: new Date("2026-03-12T10:00:00.000Z"), status: "completed", notes: "Annual combo visit" },
      task: { inspectionType: "fire_extinguisher" },
      report: { id: "report_1", finalizedAt: new Date("2026-03-12T11:00:00.000Z"), technicianName: "Alex Turner" },
      draft: {
        templateVersion: 1,
        inspectionType: "fire_extinguisher",
        overallNotes: "System in serviceable condition.",
        sectionOrder: ["inventory", "service"],
        activeSectionId: "inventory",
        sections: {
          inventory: {
            status: "pass",
            notes: "All units mapped",
            fields: {
              extinguishers: [
                { assetId: "asset_1", assetTag: "EXT-100", location: "Lobby by east stair", manufacturer: "amerex", ulRating: "3-A:40-B:C", serialNumber: "AMX-44021", extinguisherType: "5 lb ABC", gaugeStatus: "pass", mountingSecure: "pass", mfgDate: "24", lastHydro: "20", lastSixYear: "24", nextHydro: "32", servicePerformed: "Annual Inspection", notes: "Ready for service" }
              ],
              unitsInspected: 1
            }
          },
          service: { status: "pass", notes: "No recharge required", fields: { followUpRecommended: false, jurisdictionNotes: "None" } }
        },
        deficiencies: [],
        attachments: [],
        signatures: {
          technician: { signerName: "Alex Turner", imageDataUrl: tinyPngDataUrl, signedAt: "2026-03-12T10:55:00.000Z" },
          customer: { signerName: "Alyssa Reed", imageDataUrl: tinyPngDataUrl, signedAt: "2026-03-12T10:57:00.000Z" }
        },
        context: {
          siteName: "Pinecrest Tower",
          customerName: "Pinecrest Property Management",
          scheduledDate: "2026-03-12T09:00:00.000Z",
          assetCount: 1,
          priorReportSummary: "Previous report finalized on 2025-03-12."
        }
      },
      deficiencies: [],
      photos: [],
      technicianSignature: { signerName: "Alex Turner", imageDataUrl: tinyPngDataUrl, signedAt: "2026-03-12T10:55:00.000Z" },
      customerSignature: { signerName: "Alyssa Reed", imageDataUrl: tinyPngDataUrl, signedAt: "2026-03-12T10:57:00.000Z" }
    });

    expect(Buffer.from(bytes).slice(0, 4).toString()).toBe("%PDF");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(0);
  });

  it("duplicates extinguisher rows in sequential order with a fresh row id", () => {
    const rows = [
      { __rowId: "row_1", assetTag: "EXT-100", extinguisherType: "5 lb ABC", lastHydro: "20", nextHydro: "32" },
      { __rowId: "row_2", assetTag: "EXT-200", extinguisherType: "10 lb CO2", lastHydro: "20", nextHydro: "25" }
    ];

    const duplicated = duplicateRepeaterRows(rows, 0);

    expect(duplicated).toHaveLength(3);
    expect(duplicated[0]).toEqual(rows[0]);
    expect({ ...duplicated[1], __rowId: rows[0].__rowId }).toEqual(rows[0]);
    expect(duplicated[1]?.__rowId).not.toBe(rows[0].__rowId);
    expect(duplicated[2]).toEqual(rows[1]);
  });
});
