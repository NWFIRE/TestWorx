import { describe, expect, it } from "vitest";

import { PDFDocument } from "pdf-lib";

import { applyRepeaterBulkAction, applyRepeaterRowSmartUpdate, buildInitialReportDraft, buildRepeaterRowDefaults, buildReportPreview, describeRepeaterRowLabel, describeRepeaterValueLines, duplicateRepeaterRows, validateDraftForTemplate, validateFinalizationDraft } from "../report-engine";
import { generateInspectionReportPdf } from "../pdf-report";
import { buildDataUrlStorageKey } from "../storage";
import { resolveReportTemplate } from "../report-config";

const tinyPngBytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=", "base64"));
const tinyPngDataUrl = buildDataUrlStorageKey({ mimeType: "image/png", bytes: tinyPngBytes });

describe("smart report foundations", () => {
  it("falls back to numbered extinguisher labels when a duplicated row carries a duplicate action label", () => {
    expect(
      describeRepeaterRowLabel(
        {
          itemLabel: "Duplicate Extinguisher",
          extinguisherType: "5 lb ABC"
        },
        1
      )
    ).toBe("Extinguisher #2");
  });

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

    expect(lines.join(" ")).toContain("Lobby by east stair");
    expect(lines.join(" ")).not.toContain("EXT-100");
    expect(lines.join(" ")).not.toContain("Asset tag");
  });

  it("keeps extinguisher gauge and mounting fields at the bottom while hiding the asset tag field", () => {
    const template = resolveReportTemplate({
      inspectionType: "fire_extinguisher",
      assets: []
    });

    const repeater = template.sections[0]?.fields.find((field) => field.id === "extinguishers");
    if (!repeater || repeater.type !== "repeater") {
      throw new Error("Expected extinguisher repeater field.");
    }

    const fieldIds = repeater.rowFields.map((rowField) => rowField.id);
    const assetTagField = repeater.rowFields.find((rowField) => rowField.id === "assetTag");

    expect(assetTagField?.hidden).toBe(true);
    expect(fieldIds.indexOf("notes")).toBeLessThan(fieldIds.indexOf("gaugeStatus"));
    expect(fieldIds.indexOf("gaugeStatus")).toBeLessThan(fieldIds.indexOf("mountingSecure"));
    expect(fieldIds.at(-1)).toBe("mountingSecure");
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
    expect(controlPanels[0].batterySize).toBe("12v_18ah");
    expect(controlPanels[0].batterySizeOther).toBe("Legacy custom battery setup");
    expect(controlPanels[0].batteryQuantity).toBe("2");
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

    const normalizedCustomInitiatingDeviceRow = applyRepeaterRowSmartUpdate(
      template,
      "initiating-devices",
      "initiatingDevices",
      {
        assetId: "",
        assetTag: "",
        deviceType: "relay_module_custom",
        deviceTypeOther: "",
        location: "FACP room",
        serialNumber: "Address 21 / Zone 4",
        functionalTestResult: "pass",
        physicalCondition: "good",
        sensitivityOrOperationResult: "pass",
        comments: ""
      },
      "deviceType"
    );

    expect(normalizedCustomInitiatingDeviceRow.deviceType).toBe("other");
    expect(normalizedCustomInitiatingDeviceRow.deviceTypeOther).toBe("relay_module_custom");
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
              {
                assetId: "asset_1",
                assetTag: "FAP-100",
                panelName: "Main fire alarm panel",
                manufacturer: "Notifier",
                model: "NFS2-3030",
                serialNumber: "FAP-3030-001",
                location: "Ground floor electrical room",
                panelPhoto: "",
                communicationPathType: "dual_path",
                batteryDateCode: "",
                batterySize: "",
                batterySizeOther: "26.8 VDC / 18 AH",
                batteryQuantity: "2",
                batteryChargeLevel: "low",
                batteryLoadTest: "fail",
                batteriesReplacementNeeded: true,
                replacementBatterySize: "12v_18ah",
                replacementBatteryQuantity: "2"
              }
            ],
            controlPanelsInspected: 99,
            lineVoltageStatus: "normal",
            acPowerIndicator: "yes",
            acBreakerLocked: "yes",
            powerSupplyCondition: "deficiency",
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
    expect((normalized.sections["control-panel"]?.fields.controlPanels as Array<Record<string, unknown>>)[0]?.batterySize).toBe("other");
    expect((normalized.sections["control-panel"]?.fields.controlPanels as Array<Record<string, unknown>>)[0]?.batteriesReplacementNeeded).toBe(true);
    expect(normalized.sections["control-panel"]?.fields.controlPanelDeficiencyCount).toBe(4);
    expect(normalized.sections["initiating-devices"]?.fields.initiatingDevicesInspected).toBe(2);
    expect(normalized.sections["initiating-devices"]?.fields.initiatingDeviceDeficiencyCount).toBe(1);
    expect(normalized.sections.notification?.fields.notificationAppliancesInspected).toBe(2);
    expect(normalized.sections.notification?.fields.notificationDeficiencyCount).toBe(1);
    expect(normalized.sections["system-summary"]?.fields.deficiencyCount).toBe(6);
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

  it("builds the redesigned wet fire sprinkler report from current-form coverage with seeded frequency groups and carry-forward details", () => {
    const draft = buildInitialReportDraft({
      inspectionType: "wet_fire_sprinkler",
      siteName: "Harbor Main Campus",
      customerName: "Harbor View Hospital",
      scheduledDate: "2026-03-20T15:00:00.000Z",
      assetCount: 1,
      siteDefaults: { siteAddress: "123 Harbor Way" },
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
        sectionOrder: ["service-summary", "sprinkler-heads", "system-checklist", "semi-annual", "annual", "five-year-internal", "five-year-test", "alarm-valves", "valves", "alarm-devices", "system-photos", "comment-sheet"],
        activeSectionId: "service-summary",
        sections: {
          "service-summary": {
            status: "pass",
            notes: "",
            fields: {
              requirementProfile: "nfpa25_2023_baseline",
              typeOfService: "annual",
              visitScope: "annual",
              tagStatus: "yellow",
              ownerRepresentative: "Facilities director",
              occupancyType: "Hospital",
              inspectorName: "Jeremy O'Brien",
              inspectorLicense: "LIC-4451",
              buildingArea: "North patient tower",
              serviceSummary: "Patient tower wet systems inspected during the annual route."
            }
          },
          "sprinkler-heads": {
            status: "pass",
            notes: "",
            fields: {
              sprinklerHeadInformation: [
                {
                  location: "Main corridor",
                  headType: "pendent",
                  manufactureYear: "2018",
                  headSize: "1_2_inch",
                  temperatureRating: "ordinary",
                  bulbCondition: "normal",
                  manufacturer: "tyco",
                  result: "pass",
                  deficiencyNotes: "",
                  comments: "Representative head sample acceptable.",
                  deficiencyPhoto: ""
                }
              ],
              sprinklerHeadNotes: "Representative head sample taken from patient tower corridors."
            }
          },
          "alarm-valves": {
            status: "pass",
            notes: "",
            fields: {
              alarmValveInformation: [
                {
                  assetId: "",
                  assetTag: "",
                  valveIdentifier: "Alarm valve A",
                  location: "Central riser room",
                  valveType: "wet_alarm_valve",
                  manufacturer: "reliable",
                  trimCondition: "good",
                  waterMotorGongTest: "pass",
                  remoteTransmissionResult: "pass",
                  deficiencyNotes: "",
                  comments: "Trip test restored normally.",
                  deficiencyPhoto: ""
                }
              ]
            }
          },
          "comment-sheet": {
            status: "pass",
            notes: "",
            fields: {
              outOfScopeComments: "Warehouse dry system not part of this wet-only visit.",
              customerRequests: "Quote trim replacement during next service window.",
              inspectorComments: "Annual visit coordinated with facilities."
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
    const monthlyRows = draft.sections["sprinkler-heads"]?.fields.monthlyItems as Array<Record<string, string>>;
    const quarterlyInspectionRows = draft.sections["system-checklist"]?.fields.quarterlyInspectionItems as Array<Record<string, string>>;
    const quarterlyTestRows = draft.sections["system-checklist"]?.fields.quarterlyTestItems as Array<Record<string, string>>;
    const semiAnnualRows = draft.sections["semi-annual"]?.fields.semiAnnualTestItems as Array<Record<string, string>>;
    const annualRows = draft.sections.annual?.fields.annualInspectionItems as Array<Record<string, string>>;
    const fiveYearInternalRows = draft.sections["five-year-internal"]?.fields.fiveYearInternalInspectionItems as Array<Record<string, string>>;
    const fiveYearTestRows = draft.sections["five-year-test"]?.fields.fiveYearTestItems as Array<Record<string, string>>;
    const sprinklerHeadRows = draft.sections["sprinkler-heads"]?.fields.sprinklerHeadInformation as Array<Record<string, string>>;
    const alarmValveRows = draft.sections["alarm-valves"]?.fields.alarmValveInformation as Array<Record<string, string>>;

    expect(systemRows).toHaveLength(1);
    expect(systemRows[0].assetTag).toBe("SPR-200");
    expect(systemRows[0].systemIdentifier).toBe("Wet riser zone A");
    expect(systemRows[0].location).toBe("Central riser room");
    expect(systemRows[0].controlValveCount).toBe(6);
    expect(draft.sections["service-summary"]?.fields.typeOfService).toBe("annual");
    expect(draft.sections["service-summary"]?.fields.visitScope).toBe("annual");
    expect(draft.sections["service-summary"]?.fields.tagStatus).toBe("yellow");
    expect(draft.sections["service-summary"]?.fields.clientName).toBe("Harbor View Hospital");
    expect(draft.sections["service-summary"]?.fields.serviceAddress).toBe("123 Harbor Way");
    expect(draft.sections["service-summary"]?.fields.occupancyType).toBe("Hospital");
    expect(monthlyRows).toHaveLength(5);
    expect(quarterlyInspectionRows).toHaveLength(3);
    expect(quarterlyTestRows).toHaveLength(3);
    expect(semiAnnualRows).toHaveLength(3);
    expect(annualRows).toHaveLength(4);
    expect(fiveYearInternalRows).toHaveLength(3);
    expect(fiveYearTestRows).toHaveLength(3);
    expect(sprinklerHeadRows).toHaveLength(1);
    expect(sprinklerHeadRows[0]?.headType).toBe("other");
    expect(sprinklerHeadRows[0]?.headTypeOther).toBe("pendent");
    expect(alarmValveRows).toHaveLength(1);
    expect(alarmValveRows[0]?.valveIdentifier).toBe("Wet riser zone A");
    expect(draft.sections["comment-sheet"]?.fields.outOfScopeComments).toContain("dry system");
    expect(draft.sections["service-summary"]?.fields.systemsInspected).toBe(1);
    expect(draft.sections["service-summary"]?.fields.controlValvesObserved).toBe(6);
    expect(draft.sections.valves?.fields.deficiencyCount).toBe(0);
  });

  it("auto-populates wet fire sprinkler system and alarm valve rows when linked assets change", () => {
    const template = resolveReportTemplate({
      inspectionType: "wet_fire_sprinkler",
      assets: [
        {
          id: "asset_1",
          name: "Wet riser zone A",
          assetTag: "SPR-200",
          metadata: { location: "Central riser room", componentType: "riser", valveCount: 6 }
        },
        {
          id: "asset_2",
          name: "Alarm valve assembly A",
          assetTag: "VAL-210",
          metadata: { location: "South riser room", valveType: "wet_alarm_valve", manufacturer: "reliable" }
        }
      ]
    });

    const updatedSystemRow = applyRepeaterRowSmartUpdate(
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

    const updatedAlarmValveRow = applyRepeaterRowSmartUpdate(
      template,
      "alarm-valves",
      "alarmValveInformation",
      {
        assetId: "asset_2",
        assetTag: "",
        valveIdentifier: "",
        location: "",
        valveType: "",
        manufacturer: "",
        trimCondition: "good",
        waterMotorGongTest: "",
        remoteTransmissionResult: "",
        deficiencyNotes: "",
        comments: "",
        deficiencyPhoto: ""
      },
      "assetId"
    );

    expect(updatedSystemRow.assetTag).toBe("SPR-200");
    expect(updatedSystemRow.systemIdentifier).toBe("Wet riser zone A");
    expect(updatedSystemRow.location).toBe("Central riser room");
    expect(updatedSystemRow.componentType).toBe("riser");
    expect(updatedSystemRow.controlValveCount).toBe(6);
    expect(updatedAlarmValveRow.assetTag).toBe("VAL-210");
    expect(updatedAlarmValveRow.valveIdentifier).toBe("Alarm valve assembly A");
    expect(updatedAlarmValveRow.location).toBe("South riser room");
    expect(updatedAlarmValveRow.valveType).toBe("other");
    expect(updatedAlarmValveRow.valveTypeOther).toBe("wet_alarm_valve");
    expect(updatedAlarmValveRow.manufacturer).toBe("reliable");
  });

  it("recomputes wet fire sprinkler summaries across all preserved frequency groups and still enforces required system context before finalization", () => {
    const normalized = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "wet_fire_sprinkler",
      overallNotes: "Wet sprinkler visit complete.",
      sectionOrder: ["service-summary", "sprinkler-heads", "system-checklist", "semi-annual", "annual", "five-year-internal", "five-year-test", "alarm-valves", "valves", "alarm-devices", "system-photos", "comment-sheet"],
      activeSectionId: "service-summary",
      sections: {
        "service-summary": {
          status: "pass",
          notes: "",
          fields: {
            requirementProfile: "nfpa25_2023_baseline",
            typeOfService: "quarterly",
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
        "sprinkler-heads": {
          status: "pass",
          notes: "",
          fields: {
            monthlyItems: [
              { requirementKey: "monthly_sprinklers_condition", groupKey: "monthly_inspection", itemLabel: "Check 4", referenceLabel: "Ref", frequencyLabel: "Monthly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "high", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "monthly_pipe_hangers_condition", groupKey: "monthly_inspection", itemLabel: "Check 5", referenceLabel: "Ref", frequencyLabel: "Monthly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "high", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "monthly_spare_heads", groupKey: "monthly_inspection", itemLabel: "Check 6", referenceLabel: "Ref", frequencyLabel: "Monthly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "monthly_fdc_access", groupKey: "monthly_inspection", itemLabel: "Check 7", referenceLabel: "Ref", frequencyLabel: "Monthly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "monthly_heating_condition", groupKey: "monthly_inspection", itemLabel: "Check 8", referenceLabel: "Ref", frequencyLabel: "Monthly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "na", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" }
            ],
            sprinklerHeadInformation: [
              { location: "Main corridor", headType: "pendent", manufactureYear: "2018", headSize: "1_2_inch", temperatureRating: "ordinary", bulbCondition: "normal", manufacturer: "tyco", result: "pass", deficiencyNotes: "", comments: "", deficiencyPhoto: "" }
            ],
            monthlyItemsCompleted: 0,
            monthlyDeficiencyCount: 0,
            sprinklerHeadRowsReviewed: 0,
            monthlySectionComments: ""
          }
        },
        "system-checklist": {
          status: "pass",
          notes: "",
          fields: {
            quarterlyInspectionItems: [
              { requirementKey: "quarterly_waterflow_alarm_devices", groupKey: "quarterly_inspection", itemLabel: "Check 9", referenceLabel: "Ref", frequencyLabel: "Quarterly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "high", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "quarterly_valve_supervisory_signal", groupKey: "quarterly_inspection", itemLabel: "Check 10", referenceLabel: "Ref", frequencyLabel: "Quarterly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "high", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "quarterly_hydraulic_nameplate", groupKey: "quarterly_inspection", itemLabel: "Check 11", referenceLabel: "Ref", frequencyLabel: "Quarterly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "na", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" }
            ],
            quarterlyTestItems: [
              { requirementKey: "quarterly_main_drain_test", groupKey: "quarterly_test", itemLabel: "Check 12", referenceLabel: "Ref", frequencyLabel: "Quarterly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "fail", deficiencySeverity: "high", deficiencyNotes: "Drain reading dropped significantly.", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "quarterly_waterflow_alarm_test", groupKey: "quarterly_test", itemLabel: "Check 13", referenceLabel: "Ref", frequencyLabel: "Quarterly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "high", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "quarterly_supervisory_signal_test", groupKey: "quarterly_test", itemLabel: "Check 14", referenceLabel: "Ref", frequencyLabel: "Quarterly", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "na", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" }
            ],
            quarterlyInspectionItemsCompleted: 0,
            quarterlyInspectionDeficiencyCount: 0,
            quarterlyTestItemsCompleted: 0,
            quarterlyTestDeficiencyCount: 0
          }
        },
        "semi-annual": {
          status: "pass",
          notes: "",
          fields: {
            semiAnnualTestItems: [
              { requirementKey: "semi_annual_valve_movement", groupKey: "semi_annual_test", itemLabel: "Check 15", referenceLabel: "Ref", frequencyLabel: "Semi-Annual", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "semi_annual_waterflow_switch", groupKey: "semi_annual_test", itemLabel: "Check 16", referenceLabel: "Ref", frequencyLabel: "Semi-Annual", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "semi_annual_supervisory_switch", groupKey: "semi_annual_test", itemLabel: "Check 17", referenceLabel: "Ref", frequencyLabel: "Semi-Annual", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" }
            ],
            semiAnnualTestItemsCompleted: 0,
            semiAnnualTestDeficiencyCount: 0
          }
        },
        annual: {
          status: "pass",
          notes: "",
          fields: {
            annualInspectionItems: [
              { requirementKey: "annual_hangers_and_bracing", groupKey: "annual_inspection", itemLabel: "Check 18", referenceLabel: "Ref", frequencyLabel: "Annual", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "annual_pipe_and_fittings", groupKey: "annual_inspection", itemLabel: "Check 19", referenceLabel: "Ref", frequencyLabel: "Annual", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "annual_alarm_devices", groupKey: "annual_inspection", itemLabel: "Check 20", referenceLabel: "Ref", frequencyLabel: "Annual", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "na", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "annual_valve_room_condition", groupKey: "annual_inspection", itemLabel: "Check 21", referenceLabel: "Ref", frequencyLabel: "Annual", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" }
            ],
            annualInspectionItemsCompleted: 0,
            annualInspectionDeficiencyCount: 0
          }
        },
        "five-year-internal": {
          status: "pass",
          notes: "",
          fields: {
            fiveYearInternalInspectionItems: [
              { requirementKey: "five_year_internal_pipe_obstruction", groupKey: "five_year_internal_inspection", itemLabel: "Check 22", referenceLabel: "Ref", frequencyLabel: "5-Year Internal", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "high", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "five_year_internal_check_valves", groupKey: "five_year_internal_inspection", itemLabel: "Check 23", referenceLabel: "Ref", frequencyLabel: "5-Year Internal", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "high", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "five_year_internal_strainers", groupKey: "five_year_internal_inspection", itemLabel: "Check 24", referenceLabel: "Ref", frequencyLabel: "5-Year Internal", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "na", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" }
            ],
            fiveYearInternalInspectionItemsCompleted: 0,
            fiveYearInternalInspectionDeficiencyCount: 0
          }
        },
        "five-year-test": {
          status: "pass",
          notes: "",
          fields: {
            fiveYearTestItems: [
              { requirementKey: "five_year_gauge_replacement", groupKey: "five_year_test", itemLabel: "Check 25", referenceLabel: "Ref", frequencyLabel: "5-Year Test", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "five_year_standpipe_flow", groupKey: "five_year_test", itemLabel: "Check 26", referenceLabel: "Ref", frequencyLabel: "5-Year Test", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "na", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" },
              { requirementKey: "five_year_fdc_check", groupKey: "five_year_test", itemLabel: "Check 27", referenceLabel: "Ref", frequencyLabel: "5-Year Test", requirementProfileKey: "nfpa25_2023_baseline", requirementEditionLabel: "2023 baseline", result: "pass", deficiencySeverity: "medium", deficiencyNotes: "", correctiveAction: "", comments: "", deficiencyPhoto: "" }
            ],
            fiveYearTestItemsCompleted: 0,
            fiveYearTestDeficiencyCount: 0
          }
        },
        "alarm-valves": {
          status: "pass",
          notes: "",
          fields: {
            alarmValveInformation: [
              { assetId: "", assetTag: "", valveIdentifier: "Alarm valve A", location: "Central riser room", valveType: "wet_alarm_valve", manufacturer: "reliable", trimCondition: "good", waterMotorGongTest: "pass", remoteTransmissionResult: "pass", deficiencyNotes: "", comments: "", deficiencyPhoto: "" }
            ],
            alarmValveRowsReviewed: 0
          }
        },
        valves: {
          status: "pass",
          notes: "",
          fields: { deficiencyCount: 0, impairmentObserved: true, systemOutOfService: false, impairmentSummary: "One quarterly deficiency.", notificationsMade: "Owner notified." }
        },
        "alarm-devices": {
          status: "pass",
          notes: "",
          fields: { maintenancePerformedOnSite: true, maintenanceWorkSummary: "Trim adjustments completed.", recommendedRepairs: "Restore valve position and investigate supply change.", correctiveActionsCompleted: "", followUpRequired: true, overallInspectionResult: "follow_up_required", customerFacingSummary: "Two issues require follow-up." }
        },
        "system-photos": {
          status: "pass",
          notes: "",
          fields: {
            systemPhotos: [
              { relatedSystem: "Riser A", caption: "Main drain setup", photo: "", comments: "" }
            ]
          }
        },
        "comment-sheet": {
          status: "pass",
          notes: "",
          fields: { outOfScopeComments: "Dry system excluded.", customerRequests: "Quote trim replacement.", inspectorComments: "Quarterly and annual visit complete." }
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
    expect(normalized.sections["sprinkler-heads"]?.fields.monthlyItemsCompleted).toBe(5);
    expect(normalized.sections["system-checklist"]?.fields.quarterlyInspectionItemsCompleted).toBe(3);
    expect(normalized.sections["system-checklist"]?.fields.quarterlyTestItemsCompleted).toBe(3);
    expect(normalized.sections["semi-annual"]?.fields.semiAnnualTestItemsCompleted).toBe(3);
    expect(normalized.sections.annual?.fields.annualInspectionItemsCompleted).toBe(4);
    expect(normalized.sections["five-year-internal"]?.fields.fiveYearInternalInspectionItemsCompleted).toBe(3);
    expect(normalized.sections["five-year-test"]?.fields.fiveYearTestItemsCompleted).toBe(3);
    expect(normalized.sections["system-checklist"]?.fields.quarterlyTestDeficiencyCount).toBe(1);
    expect(normalized.sections.valves?.fields.deficiencyCount).toBe(1);
    expect(normalized.sections["sprinkler-heads"]?.fields.sprinklerHeadRowsReviewed).toBe(1);
    expect(normalized.sections["alarm-valves"]?.fields.alarmValveRowsReviewed).toBe(1);

    const invalidWetSprinklerDraft = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "wet_fire_sprinkler",
      overallNotes: "",
      sectionOrder: ["service-summary", "sprinkler-heads", "system-checklist", "semi-annual", "annual", "five-year-internal", "five-year-test", "alarm-valves", "valves", "alarm-devices", "system-photos", "comment-sheet"],
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
        }
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
        sectionOrder: ["header", "site-context", "assembly-identification", "inspection-scope", "visual-inspection", "test-results", "deficiencies", "corrective-actions", "photos", "final-disposition", "signatures"],
        activeSectionId: "assembly-identification",
        sections: {
          header: {
            status: "pass",
            notes: "",
            fields: {
              customerName: "Harbor View Hospital",
              siteName: "Harbor Main Campus",
              buildingArea: "",
              siteAddress: "123 Harbor Way",
              workOrderNumber: "",
              jobNumber: "",
              inspectionDate: "2025-03-20T15:00:00.000Z",
              inspectionStartTime: "9:00 AM",
              inspectionEndTime: "10:00 AM",
              technician: "Alex Tester",
              technicianLicenseOrCertification: "T-100",
              inspectionType: "annual_test",
              tagStatus: "existing_tag_updated",
              ahjName: "",
              adoptedCodeEdition: "nfpa25_2023"
            }
          },
          "site-context": {
            status: "pass",
            notes: "",
            fields: {
              requirementProfile: "nfpa25_2023_backflow",
              fireProtectionSystemServed: "fire_sprinkler_system",
              sprinklerSystemType: "wet_pipe",
              waterSupplyType: "municipal",
              occupancyType: "healthcare",
              systemStatusAtArrival: "in_service",
              monitoringStatus: "monitored",
              notesOnOccupancyOrHazard: ""
            }
          },
          "assembly-identification": {
            status: "pass",
            notes: "",
            fields: {
              assemblies: [
                {
                  assetId: "asset_1",
                  assemblyType: "dcda",
                  assemblyManufacturer: "watts",
                  assemblyManufacturerOther: "",
                  assemblyModel: "009M3",
                  assemblySize: "3",
                  serialNumber: "OLDER-SERIAL",
                  assemblyLocation: "Loading dock mechanical",
                  installationOrientation: "horizontal",
                  detectorMeterPresent: "yes",
                  fireLineType: "dedicated_fire_line",
                  installYear: "2016",
                  deviceTagNumber: "BF-210"
                }
              ],
              assembliesDocumented: 1,
              detectorAssembliesCount: 1
            }
          },
          "inspection-scope": {
            status: "pass",
            notes: "",
            fields: {
              assemblyType: "dcda",
              testReason: "scheduled_annual_test",
              assemblyConfigurationDetected: "DC workflow",
              detectorAssemblyNotes: ""
            }
          },
          "visual-inspection": {
            status: "pass",
            notes: "",
            fields: {
              visualInspectionItems: [],
              visualInspectionCompleted: 0,
              visualInspectionDeficiencyCount: 0
            }
          },
          "test-results": {
            status: "pass",
            notes: "",
            fields: {
              testPerformed: "yes",
              noTestReason: "",
              testKitIdentifier: "KIT-1",
              testKitCalibrationDate: "2025-01-10",
              initialTestOverallResult: "pass",
              testerComments: "",
              dcCheck1Reading: 7.4,
              dcCheck1Result: "pass",
              dcCheck2Reading: 4.2,
              dcCheck2Result: "pass",
              dcShutoffValveCondition: "pass",
              dcOverallResult: "pass",
              rpCheck1Reading: "",
              rpCheck1Result: "",
              rpReliefValveOpeningPoint: "",
              rpReliefValveDischargeObserved: "",
              rpCheck2Reading: "",
              rpCheck2Result: "",
              rpOverallResult: "",
              detectorMeterCondition: "pass",
              detectorLineNotes: "",
              repairsPerformedBeforeRetest: "",
              retestPerformed: "",
              retestDateTime: "",
              retestCheck1Reading: "",
              retestCheck2Reading: "",
              retestReliefReading: "",
              retestOverallResult: "",
              retestComments: ""
            }
          },
          deficiencies: {
            status: "pass",
            notes: "",
            fields: { deficiencyItems: [], deficiencyCount: 0 }
          },
          "corrective-actions": {
            status: "pass",
            notes: "",
            fields: {
              repairsPerformedOnSite: "none",
              partsReplaced: [],
              adjustmentsMade: "",
              postRepairTestingCompleted: "not_applicable",
              unresolvedIssuesRemain: "no",
              unresolvedIssueSummary: ""
            }
          },
          photos: {
            status: "pass",
            notes: "",
            fields: {
              photoSet: [{ category: "assembly_overview", caption: "Overview", photo: "", comments: "" }]
            }
          },
          "final-disposition": {
            status: "pass",
            notes: "",
            fields: {
              finalResult: "passed",
              deviceLeftInService: "yes",
              followUpRequired: "no",
              followUpRecommendation: "no_further_action",
              nextServiceDue: "",
              impairmentNotes: "",
              customerFacingSummary: "Assembly passed."
            }
          },
          signatures: {
            status: "pass",
            notes: "",
            fields: {
              technicianPrintedName: "Alex Tester",
              customerRepresentativeName: "",
              customerRepresentativeTitle: "",
              completedDateTime: "2025-03-20 10:00"
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

    const rows = draft.sections["assembly-identification"]?.fields.assemblies as Array<Record<string, string | number | boolean>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].deviceTagNumber).toBe("BF-210");
    expect(rows[0].assemblyLocation).toBe("Loading dock mechanical");
    expect(rows[0].assemblyType).toBe("rpz");
    expect(rows[0].assemblySize).toBe("4");
    expect(rows[0].serialNumber).toBe("BF-RPZ-4421");
    expect(draft.sections["assembly-identification"]?.fields.assembliesDocumented).toBe(1);
    expect(draft.sections["assembly-identification"]?.fields.detectorAssembliesCount).toBe(0);
    expect((draft.sections["visual-inspection"]?.fields.visualInspectionItems as Array<Record<string, string>>)[0]?.displayLabel).toMatch(/Assembly is accessible/i);
    expect(draft.sections["test-results"]?.fields.dcCheck1Reading).toBe(7.4);
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
      "assembly-identification",
      "assemblies",
      {
        assetId: "asset_1",
        assemblyManufacturer: "",
        assemblyManufacturerOther: "",
        assemblyModel: "",
        assemblySize: "",
        assemblyType: "",
        serialNumber: "",
        assemblyLocation: "",
        installationOrientation: "",
        detectorMeterPresent: "",
        fireLineType: "",
        installYear: "",
        deviceTagNumber: ""
      },
      "assetId"
    );

    expect(updatedRow.deviceTagNumber).toBe("BF-210");
    expect(updatedRow.assemblyLocation).toBe("Loading dock mechanical");
    expect(updatedRow.assemblyType).toBe("rpz");
    expect(updatedRow.assemblySize).toBe("4");
    expect(updatedRow.serialNumber).toBe("BF-RPZ-4421");
  });

  it("recomputes backflow calculated fields and enforces repeater validation during normalization", () => {
    const normalized = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "backflow",
      overallNotes: "Backflow visit complete.",
      sectionOrder: ["header", "site-context", "assembly-identification", "inspection-scope", "visual-inspection", "test-results", "deficiencies", "corrective-actions", "photos", "final-disposition", "signatures"],
      activeSectionId: "assembly-identification",
      sections: {
        header: {
          status: "pass",
          notes: "",
          fields: {
            customerName: "Harbor View Hospital",
            siteName: "Harbor Main Campus",
            buildingArea: "",
            siteAddress: "123 Harbor Way",
            workOrderNumber: "",
            jobNumber: "",
            inspectionDate: "2026-03-20T15:00:00.000Z",
            inspectionStartTime: "9:00 AM",
            inspectionEndTime: "10:00 AM",
            technician: "Alex Tester",
            technicianLicenseOrCertification: "T-100",
            inspectionType: "annual_test",
            tagStatus: "existing_tag_updated",
            ahjName: "",
            adoptedCodeEdition: "nfpa25_2023"
          }
        },
        "site-context": {
          status: "pass",
          notes: "",
          fields: {
            requirementProfile: "nfpa25_2023_backflow",
            fireProtectionSystemServed: "fire_sprinkler_system",
            sprinklerSystemType: "wet_pipe",
            waterSupplyType: "municipal",
            occupancyType: "healthcare",
            systemStatusAtArrival: "in_service",
            monitoringStatus: "monitored",
            notesOnOccupancyOrHazard: ""
          }
        },
        "assembly-identification": {
          status: "pass",
          notes: "",
          fields: {
            assemblies: [
              {
                assetId: "asset_1",
                assemblyType: "rpz",
                assemblyManufacturer: "watts",
                assemblyManufacturerOther: "",
                assemblyModel: "909",
                assemblySize: 4,
                serialNumber: "BF-RPZ-4421",
                assemblyLocation: "Loading dock mechanical",
                installationOrientation: "horizontal",
                detectorMeterPresent: "yes",
                fireLineType: "detector_line",
                installYear: "2019",
                deviceTagNumber: "BF-210"
              },
              {
                assetId: "asset_2",
                assemblyType: "dcda",
                assemblyManufacturer: "watts",
                assemblyManufacturerOther: "",
                assemblyModel: "007",
                assemblySize: 6,
                serialNumber: "BF-DCDA-7711",
                assemblyLocation: "Boiler room",
                installationOrientation: "horizontal",
                detectorMeterPresent: "yes",
                fireLineType: "dedicated_fire_line",
                installYear: "2013",
                deviceTagNumber: "BF-211"
              }
            ],
            assembliesDocumented: 99,
            detectorAssembliesCount: 99
          }
        },
        "inspection-scope": {
          status: "pass",
          notes: "",
          fields: {
            assemblyType: "rpz",
            testReason: "scheduled_annual_test",
            assemblyConfigurationDetected: "RP workflow",
            detectorAssemblyNotes: ""
          }
        },
        "visual-inspection": {
          status: "pass",
          notes: "",
          fields: {
            visualInspectionItems: [
              {
                requirementKey: "assembly_accessible",
                requirementProfileKey: "nfpa25_2023_backflow",
                requirementEditionLabel: "2023 baseline",
                frequencyLabel: "Annual inspection / test",
                displayLabel: "Assembly is accessible for inspection, testing, and service.",
                codeRef: "NFPA 25 backflow visual inspection baseline",
                result: "pass",
                condition: "good",
                comments: "",
                customerComment: "",
                correctiveAction: "",
                photo: ""
              }
            ],
            visualInspectionCompleted: 99,
            visualInspectionDeficiencyCount: 99
          }
        },
        "test-results": {
          status: "pass",
          notes: "",
          fields: {
            testPerformed: "yes",
            noTestReason: "",
            testKitIdentifier: "KIT-1",
            testKitCalibrationDate: "2026-01-10",
            initialTestOverallResult: "pass",
            testerComments: "",
            dcCheck1Reading: "",
            dcCheck1Result: "",
            dcCheck2Reading: "",
            dcCheck2Result: "",
            dcShutoffValveCondition: "",
            dcOverallResult: "",
            rpCheck1Reading: 7.4,
            rpCheck1Result: "pass",
            rpReliefValveOpeningPoint: 3.1,
            rpReliefValveDischargeObserved: "yes",
            rpCheck2Reading: 5.6,
            rpCheck2Result: "pass",
            rpOverallResult: "pass",
            detectorMeterCondition: "",
            detectorLineNotes: "",
            repairsPerformedBeforeRetest: "",
            retestPerformed: "",
            retestDateTime: "",
            retestCheck1Reading: "",
            retestCheck2Reading: "",
            retestReliefReading: "",
            retestOverallResult: "",
            retestComments: ""
          }
        },
        deficiencies: {
          status: "pass",
          notes: "",
          fields: { deficiencyItems: [], deficiencyCount: 99 }
        },
        "corrective-actions": {
          status: "pass",
          notes: "",
          fields: {
            repairsPerformedOnSite: "none",
            partsReplaced: [],
            adjustmentsMade: "",
            postRepairTestingCompleted: "not_applicable",
            unresolvedIssuesRemain: "no",
            unresolvedIssueSummary: ""
          }
        },
        photos: {
          status: "pass",
          notes: "",
          fields: { photoSet: [{ category: "assembly_overview", caption: "Overview", photo: "", comments: "" }] }
        },
        "final-disposition": {
          status: "pass",
          notes: "",
          fields: {
            finalResult: "passed",
            deviceLeftInService: "yes",
            followUpRequired: "no",
            followUpRecommendation: "no_further_action",
            nextServiceDue: "",
            impairmentNotes: "",
            customerFacingSummary: "Assembly passed."
          }
        },
        signatures: {
          status: "pass",
          notes: "",
          fields: {
            technicianPrintedName: "Alex Tester",
            customerRepresentativeName: "",
            customerRepresentativeTitle: "",
            completedDateTime: "2026-03-20 10:00"
          }
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

    expect((normalized.sections["assembly-identification"]?.fields.assemblies as Array<unknown>).length).toBe(2);
    expect(normalized.sections["assembly-identification"]?.fields.assembliesDocumented).toBe(2);
    expect(normalized.sections["assembly-identification"]?.fields.detectorAssembliesCount).toBe(1);
    expect(normalized.sections["visual-inspection"]?.fields.visualInspectionCompleted).toBe(1);
    expect(normalized.sections["visual-inspection"]?.fields.visualInspectionDeficiencyCount).toBe(0);

    const invalidBackflowDraft = validateDraftForTemplate({
      templateVersion: 1,
      inspectionType: "backflow",
      overallNotes: "",
      sectionOrder: ["header", "site-context", "assembly-identification", "inspection-scope", "visual-inspection", "test-results", "deficiencies", "corrective-actions", "photos", "final-disposition", "signatures"],
      activeSectionId: "assembly-identification",
      sections: {
        header: {
          status: "pending",
          notes: "",
          fields: {
            customerName: "Harbor View Hospital",
            siteName: "Harbor Main Campus",
            buildingArea: "",
            siteAddress: "123 Harbor Way",
            workOrderNumber: "",
            jobNumber: "",
            inspectionDate: "2026-03-20T15:00:00.000Z",
            inspectionStartTime: "",
            inspectionEndTime: "",
            technician: "",
            technicianLicenseOrCertification: "",
            inspectionType: "",
            tagStatus: "",
            ahjName: "",
            adoptedCodeEdition: ""
          }
        },
        "site-context": {
          status: "pending",
          notes: "",
          fields: {
            requirementProfile: "nfpa25_2023_backflow",
            fireProtectionSystemServed: "",
            sprinklerSystemType: "",
            waterSupplyType: "",
            occupancyType: "",
            systemStatusAtArrival: "",
            monitoringStatus: "",
            notesOnOccupancyOrHazard: ""
          }
        },
        "assembly-identification": {
          status: "pending",
          notes: "",
          fields: {
            assemblies: [],
            assembliesDocumented: 0,
            detectorAssembliesCount: 0
          }
        },
        "inspection-scope": { status: "pending", notes: "", fields: { assemblyType: "", testReason: "", assemblyConfigurationDetected: "", detectorAssemblyNotes: "" } },
        "visual-inspection": { status: "pending", notes: "", fields: { visualInspectionItems: [], visualInspectionCompleted: 0, visualInspectionDeficiencyCount: 0 } },
        "test-results": {
          status: "pending",
          notes: "",
          fields: {
            testPerformed: "",
            noTestReason: "",
            testKitIdentifier: "",
            testKitCalibrationDate: "",
            initialTestOverallResult: "",
            testerComments: "",
            dcCheck1Reading: "",
            dcCheck1Result: "",
            dcCheck2Reading: "",
            dcCheck2Result: "",
            dcShutoffValveCondition: "",
            dcOverallResult: "",
            rpCheck1Reading: "",
            rpCheck1Result: "",
            rpReliefValveOpeningPoint: "",
            rpReliefValveDischargeObserved: "",
            rpCheck2Reading: "",
            rpCheck2Result: "",
            rpOverallResult: "",
            detectorMeterCondition: "",
            detectorLineNotes: "",
            repairsPerformedBeforeRetest: "",
            retestPerformed: "",
            retestDateTime: "",
            retestCheck1Reading: "",
            retestCheck2Reading: "",
            retestReliefReading: "",
            retestOverallResult: "",
            retestComments: ""
          }
        },
        deficiencies: { status: "pending", notes: "", fields: { deficiencyItems: [], deficiencyCount: 0 } },
        "corrective-actions": { status: "pending", notes: "", fields: { repairsPerformedOnSite: "", partsReplaced: [], adjustmentsMade: "", postRepairTestingCompleted: "", unresolvedIssuesRemain: "", unresolvedIssueSummary: "" } },
        photos: { status: "pending", notes: "", fields: { photoSet: [] } },
        "final-disposition": { status: "pending", notes: "", fields: { finalResult: "", deviceLeftInService: "", followUpRequired: "", followUpRecommendation: "", nextServiceDue: "", impairmentNotes: "", customerFacingSummary: "" } },
        signatures: { status: "pending", notes: "", fields: { technicianPrintedName: "", customerRepresentativeName: "", customerRepresentativeTitle: "", completedDateTime: "" } }
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

  it("builds the joint commission fire sprinkler report with quarterly and annual seeded sections and customer-safe internal notes", () => {
    const draft = buildInitialReportDraft({
      inspectionType: "joint_commission_fire_sprinkler",
      siteName: "Harbor Main Campus",
      customerName: "Harbor View Hospital",
      scheduledDate: "2026-04-01T08:00:00.000Z",
      assetCount: 0,
      siteDefaults: { siteAddress: "123 Harbor Way" }
    });

    expect(draft.sectionOrder).toContain("quarterly-inspection");
    expect(draft.sectionOrder).toContain("annual-inspection");
    expect(draft.sections.header?.fields.facilityName).toBe("Harbor View Hospital");
    expect(draft.sections.header?.fields.siteName).toBe("Harbor Main Campus");
    expect((draft.sections["quarterly-inspection"]?.fields.quarterlyItems as Array<Record<string, string>>)[0]?.epLabel).toBe("LS.02.01.35 EP 1");
    expect((draft.sections["annual-inspection"]?.fields.annualItems as Array<Record<string, string>>)[0]?.epLabel).toBe("LS.02.01.35 EP 2");
    expect(draft.sections.header?.fields).toHaveProperty("tagStatus");
    expect(draft.sections["test-results"]?.fields).toHaveProperty("waterflowSwitches");
    expect(draft.sections["test-results"]?.fields).toHaveProperty("tamperSwitches");
    expect((draft.sections.photos?.fields.photoItems as Array<Record<string, string>>)[0]?.category).toBe("system_overview");
    expect((draft.sections.photos?.fields.photoItems as Array<Record<string, string>>)[5]?.category).toBe("tags");
    expect((draft.sections.deficiencies?.fields.deficiencyItems as Array<Record<string, string>> | undefined) ?? []).toHaveLength(0);
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
