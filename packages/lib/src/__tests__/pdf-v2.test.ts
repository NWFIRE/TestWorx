import { describe, expect, it } from "vitest";
import { createElement } from "react";

import { buildDataUrlStorageKey } from "../storage";
import { buildIndicatorLines, buildReportRenderModelV2, generateInspectionReportPdfV2, resolvePdfVersionForInspectionType } from "../pdf-v2";
import { buildInitialReportDraft } from "../report-engine";
import { buildFireAlarmRenderModel } from "../pdf-v2/fire-alarm/adapter/buildFireAlarmRenderModel";
import { FireAlarmReportDocument } from "../pdf-v2/fire-alarm/templates/FireAlarmReportDocument";
import { renderPdfHtml } from "../pdf-v2/core/renderer/renderHtml";

const tinyPngBytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=", "base64"));
const tinyPngDataUrl = buildDataUrlStorageKey({ mimeType: "image/png", bytes: tinyPngBytes });

function createBaseInput() {
  return {
    tenant: {
      name: "Northwest Fire & Safety",
      branding: {
        primaryColor: "#1E3A5F",
        accentColor: "#C2410C",
        phone: "405-555-0199",
        email: "service@nwfire.com",
        website: "nwfire.com",
        addressLine1: "2517 N. Van Buren St.",
        city: "Enid",
        state: "OK",
        postalCode: "73703"
      }
    },
    customerCompany: {
      name: "Commercial Fire LLC",
      contactName: "Jeremy O'Brien",
      billingEmail: "office@commercialfire.com",
      phone: "405-555-0135"
    },
    site: {
      name: "Sprouts Farmers Market #802",
      addressLine1: "24 E 2nd St",
      addressLine2: null,
      city: "Edmond",
      state: "OK",
      postalCode: "73034"
    },
    inspection: {
      id: "inspection_1",
      scheduledStart: new Date("2026-04-01T09:00:00.000Z"),
      scheduledEnd: new Date("2026-04-01T10:00:00.000Z"),
      status: "in_progress",
      notes: ""
    },
    report: {
      id: "report_1",
      finalizedAt: new Date("2026-04-01T11:00:00.000Z"),
      technicianName: "Eli Rodriguez"
    },
    deficiencies: [],
    photos: [],
    technicianSignature: {
      signerName: "Eli Rodriguez",
      imageDataUrl: tinyPngDataUrl,
      signedAt: "2026-04-01T11:00:00.000Z"
    },
    customerSignature: {
      signerName: "Jeremy O'Brien",
      imageDataUrl: tinyPngDataUrl,
      signedAt: "2026-04-01T11:05:00.000Z"
    }
  };
}

describe("pdf v2 report engine", () => {
  it("normalizes finalized reports away from in-progress states", () => {
    const model = buildReportRenderModelV2({
      ...createBaseInput(),
      task: { inspectionType: "fire_extinguisher" },
      draft: {
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
                  location: "Lobby",
                  manufacturer: "Amerex",
                  serialNumber: "AMX-1",
                  extinguisherType: "5 lb ABC",
                  gaugeStatus: "pass",
                  mountingSecure: "pass",
                  servicePerformed: "Annual Inspection",
                  notes: ""
                }
              ],
              unitsInspected: 1
            }
          },
          service: { status: "pass", notes: "", fields: { followUpRecommended: false } }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: { siteName: "", customerName: "", scheduledDate: "", assetCount: 0, priorReportSummary: "" }
      }
    });

    expect(model.outcomeCards.find((card) => card.label === "Document Status")?.value).toBe("Finalized");
    expect(model.primaryFacts.find((item) => item.label === "Inspection Status")?.value).not.toBe("In Progress");
  });

  it("suppresses Unknown Unknown style leakage", () => {
    const model = buildReportRenderModelV2({
      ...createBaseInput(),
      task: { inspectionType: "kitchen_suppression" },
      site: {
        ...createBaseInput().site,
        name: "Unknown Unknown"
      },
      draft: {
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
              systemLocation: "Ground floor kitchen",
              areaProtected: "Cook line",
              manufacturer: "Ansul",
              model: "R-102",
              ul300Compliant: true
            }
          },
          "appliance-coverage": { status: "pass", notes: "", fields: { hoods: [], hoodAppliances: [] } },
          "system-checklist": { status: "pass", notes: "", fields: {} },
          "tank-and-service": { status: "pass", notes: "", fields: { fusibleLinksUsed: [] } }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: { siteName: "", customerName: "", scheduledDate: "", assetCount: 0, priorReportSummary: "" }
      }
    });

    expect(JSON.stringify(model)).not.toContain("Unknown Unknown");
  });

  it("renders the Joint Commission sprinkler source-packet table flow", () => {
    const draft = buildInitialReportDraft({
      inspectionType: "joint_commission_fire_sprinkler",
      siteName: "St. Mary's Regional Medical Center",
      customerName: "St. Mary's",
      scheduledDate: "2026-03-17T14:00:00.000Z",
      assetCount: 0,
      siteDefaults: { siteAddress: "305 S 5th St, Enid, OK 73701" }
    });

    const model = buildReportRenderModelV2({
      ...createBaseInput(),
      task: { inspectionType: "joint_commission_fire_sprinkler" },
      draft
    });

    expect(model.title).toBe("Joint Commission Fire Sprinkler Inspection Report");
    expect(model.sections.map((section) => section.key)).toEqual(expect.arrayContaining([
      "summary-dashboard",
      "testing-matrix",
      "sprinkler-overview",
      "systems-detail",
      "ep1-supervisory",
      "ep2-tamper-valves",
      "ep2-waterflow",
      "ep9-main-drain",
      "ep10-fdc",
      "certification-acknowledgement"
    ]));

    const matrix = model.sections.find((section) => section.key === "testing-matrix");
    expect(matrix?.renderer).toBe("table");
    if (matrix?.renderer === "table") {
      expect(matrix.columns.map((column) => column.key)).toEqual([
        "deviceCategory",
        "deviceActivity",
        "ep",
        "frequency",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
        "jan",
        "feb",
        "mar"
      ]);
      expect(matrix.rows[0]?.deviceActivity?.text).toBe("Supervisory signals except tamper switches");
    }
  });

  it("renders kitchen suppression hood and appliance rows from the saved report fields", () => {
    const model = buildReportRenderModelV2({
      ...createBaseInput(),
      task: { inspectionType: "kitchen_suppression" },
      draft: {
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
              systemType: "Ansul R-102",
              systemLocation: "Main kitchen"
            }
          },
          "appliance-coverage": {
            status: "pass",
            notes: "",
            fields: {
              hoods: [
                { hoodName: "Hood 1", hoodSize: "12 ft", ductSize: "18 x 18", ductQuantity: "1", ductNozzleQuantity: "2", ductNozzleType: "1W" }
              ],
              hoodAppliances: [
                { hoodName: "Hood 1", appliance: "Fryer", size: "36 in", applianceNozzleQuantity: "2", applianceNozzleType: "2N" }
              ]
            }
          },
          "system-checklist": {
            status: "pass",
            notes: "",
            fields: {
              allAppliancesProtected: "yes",
              ductPlenumProtected: "yes",
              manualPullStationTested: "pass",
              hoodCleanedPerNFPA96: "yes"
            }
          },
          "tank-and-service": {
            status: "pass",
            notes: "",
            fields: {
              fusibleLinksUsed: [{ temperature: "360 F", quantity: "4" }],
              capsUsed: [{ type: "Red", quantity: "2" }],
              serviceNotes: "Replaced links and caps during inspection."
            }
          }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: { siteName: "", customerName: "", scheduledDate: "", assetCount: 0, priorReportSummary: "" }
      }
    });

    const hoods = model.sections.find((section) => section.key === "hoods");
    const appliances = model.sections.find((section) => section.key === "appliances");
    const checklist = model.sections.find((section) => section.key === "system_checklist");
    const service = model.sections.find((section) => section.key === "agent_tank_service");

    expect(hoods?.renderer).toBe("table");
    if (hoods?.renderer === "table") {
      expect(hoods.columns.map((column) => column.key)).toContain("hoodName");
      expect(hoods.rows[0]?.hoodName?.text).toBe("Hood 1");
      expect(hoods.rows[0]?.ductNozzleType?.text).toBe("1W");
    }

    expect(appliances?.renderer).toBe("table");
    if (appliances?.renderer === "table") {
      expect(appliances.rows[0]?.appliance?.text).toBe("Fryer");
      expect(appliances.rows[0]?.applianceNozzleType?.text).toBe("2N");
    }

    expect(checklist?.renderer).toBe("checklist");
    if (checklist?.renderer === "checklist") {
      expect(checklist.items.map((item) => item.label)).toContain("All appliances properly protected?");
      expect(checklist.items.map((item) => item.label)).toContain("Hood cleaned regularly in accordance with NFPA 96?");
    }

    expect(service?.renderer).toBe("table");
    if (service?.renderer === "table") {
      expect(service.rows.map((row) => row.item?.text)).toEqual(["Fusible link", "Nozzle cap", "Service notes"]);
    }
  });

  it("renders industrial dry chemical tag status, numbered checklist, and fusible links", () => {
    const model = buildReportRenderModelV2({
      ...createBaseInput(),
      task: { inspectionType: "industrial_suppression" },
      draft: {
        templateVersion: 1,
        inspectionType: "industrial_suppression",
        overallNotes: "",
        sectionOrder: [
          "system-information",
          "installation-compliance-checklist",
          "documentation-compliance-checklist",
          "fusible-links"
        ],
        activeSectionId: "system-information",
        sections: {
          "system-information": {
            status: "pass",
            notes: "",
            fields: {
              tagStatus: "green",
              manufacturer: "Amerex",
              model: "IS",
              systemLocation: "Paint booth",
              hazardProtected: "Paint booth line 2"
            }
          },
          "installation-compliance-checklist": {
            status: "pass",
            notes: "",
            fields: {
              systemInstalledPerMfgUl: "pass",
              systemDischargedPriorToArrival: "na",
              tamperingEvidence: "pass"
            }
          },
          "documentation-compliance-checklist": {
            status: "pass",
            notes: "",
            fields: {
              originalPlansOnSite: "pass",
              inspectionTagInstalled: "pass"
            }
          },
          "fusible-links": {
            status: "pass",
            notes: "",
            fields: {
              fusibleLinks: [
                {
                  linkLocation: "Booth detector line",
                  linkTemperatureRating: "360 F",
                  quantity: "2",
                  result: "replaced",
                  notes: "Changed during inspection"
                }
              ]
            }
          }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: { siteName: "", customerName: "", scheduledDate: "", assetCount: 0, priorReportSummary: "" }
      }
    });

    expect(model.title).toBe("Industrial Dry Chemical Inspection Report");
    expect(model.systemSummary?.items.find((item) => item.label === "Tag Status")?.value).toBe("Green");
    expect(JSON.stringify(model.sections)).toContain("1. System installed in accordance with MFG & UL?");
    expect(JSON.stringify(model.sections)).toContain("29. Inspection tag installed on system?");

    const fusibleLinks = model.sections.find((section) => section.key === "fusible-links");
    expect(fusibleLinks?.renderer).toBe("table");
    if (fusibleLinks?.renderer === "table") {
      expect(fusibleLinks.rows[0]?.linkLocation?.text).toBe("Booth detector line");
      expect(fusibleLinks.rows[0]?.result?.text).toBe("replaced");
    }
  });

  it("does not expose raw photo filenames in rendered PDF text", async () => {
    const bytes = await generateInspectionReportPdfV2({
      ...createBaseInput(),
      task: { inspectionType: "fire_extinguisher" },
      photos: [{ fileName: "raw-file-name.jpg", storageKey: tinyPngDataUrl }],
      draft: {
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
              extinguishers: [{ location: "Lobby", extinguisherType: "5 lb ABC", gaugeStatus: "pass", mountingSecure: "pass", servicePerformed: "Annual Inspection", notes: "" }],
              unitsInspected: 1
            }
          },
          service: { status: "pass", notes: "", fields: {} }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: { siteName: "", customerName: "", scheduledDate: "", assetCount: 0, priorReportSummary: "" }
      }
    });

    const text = Buffer.from(bytes).toString("latin1");
    expect(text).not.toContain("raw-file-name.jpg");
  });

  it("does not render Audible operation for strobe-only notification appliances", () => {
    const lines = buildIndicatorLines({
      inspectionType: "fire_alarm",
      dataset: "notificationAppliances",
      row: {
        applianceType: "Strobe",
        audibleOperation: "pass",
        visualOperation: "pass"
      }
    });

    expect(lines).toContain("Visible operation: Pass");
    expect(lines.join(" ")).not.toContain("Audible operation");
  });

  it("renders a dedicated Compliance Standards block with NFPA codes", async () => {
    const bytes = await generateInspectionReportPdfV2({
      ...createBaseInput(),
      task: { inspectionType: "fire_alarm" },
      draft: {
        templateVersion: 1,
        inspectionType: "fire_alarm",
        overallNotes: "",
        sectionOrder: ["control-panel", "initiating-devices", "notification", "system-summary"],
        activeSectionId: "control-panel",
        sections: {
          "control-panel": { status: "pass", notes: "", fields: { controlPanels: [], lineVoltageStatus: "normal" } },
          "initiating-devices": { status: "pass", notes: "", fields: { initiatingDevices: [] } },
          notification: { status: "pass", notes: "", fields: { notificationAppliances: [] } },
          "system-summary": { status: "pass", notes: "", fields: { controlPanelsInspected: 1, followUpRequired: false } }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: { siteName: "", customerName: "", scheduledDate: "", assetCount: 0, priorReportSummary: "" }
      }
    });

    expect(Buffer.from(bytes).slice(0, 4).toString()).toBe("%PDF");

    const model = buildFireAlarmRenderModel({
      ...createBaseInput(),
      task: { inspectionType: "fire_alarm" },
      draft: {
        templateVersion: 1,
        inspectionType: "fire_alarm",
        overallNotes: "",
        sectionOrder: ["control-panel", "initiating-devices", "notification", "system-summary"],
        activeSectionId: "control-panel",
        sections: {
          "control-panel": { status: "pass", notes: "", fields: { controlPanels: [], lineVoltageStatus: "normal" } },
          "initiating-devices": { status: "pass", notes: "", fields: { initiatingDevices: [] } },
          notification: { status: "pass", notes: "", fields: { notificationAppliances: [] } },
          "system-summary": { status: "pass", notes: "", fields: { controlPanelsInspected: 1, followUpRequired: false } }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: { siteName: "", customerName: "", scheduledDate: "", assetCount: 0, priorReportSummary: "" }
      }
    });
    const html = await renderPdfHtml(createElement(FireAlarmReportDocument, { model }));
    expect(html).toContain("Compliance Standards");
    expect(html).toContain("NFPA 72");
    expect(html).toContain("NFPA 70");
  });

  it("keeps optional table cells blank instead of dash spam", () => {
    const model = buildReportRenderModelV2({
      ...createBaseInput(),
      task: { inspectionType: "fire_extinguisher" },
      draft: {
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
                  location: "Lobby",
                  manufacturer: "",
                  serialNumber: "",
                  extinguisherType: "5 lb ABC",
                  gaugeStatus: "pass",
                  mountingSecure: "pass",
                  servicePerformed: "",
                  notes: ""
                }
              ]
            }
          },
          service: { status: "pass", notes: "", fields: {} }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: { siteName: "", customerName: "", scheduledDate: "", assetCount: 0, priorReportSummary: "" }
      }
    });

    const table = model.sections.find((section) => section.renderer === "table" && section.key === "extinguishers");
    expect(table && "rows" in table ? table.rows[0]?.manufacturer?.text : "").toBe("");
    expect(JSON.stringify(table)).not.toContain("—");
  });

  it("renders long repeated header content without crashing or collapsing the document", async () => {
    const bytes = await generateInspectionReportPdfV2({
      ...createBaseInput(),
      tenant: {
        name: "Northwest Fire & Safety Regional Compliance Operations Group",
        branding: {
          ...createBaseInput().tenant.branding,
          legalBusinessName: "Northwest Fire & Safety Regional Compliance Operations Group"
        }
      },
      task: { inspectionType: "fire_alarm" },
      draft: {
        templateVersion: 1,
        inspectionType: "fire_alarm",
        overallNotes: new Array(80).fill("System inspected and documented.").join(" "),
        sectionOrder: ["control-panel", "initiating-devices", "notification", "system-summary"],
        activeSectionId: "control-panel",
        sections: {
          "control-panel": { status: "pass", notes: "", fields: { controlPanels: [], lineVoltageStatus: "normal" } },
          "initiating-devices": { status: "pass", notes: "", fields: { initiatingDevices: Array.from({ length: 20 }, (_, i) => ({ location: `Area ${i + 1}`, deviceType: "Smoke Detector", functionalTestResult: "pass", physicalCondition: "good", sensitivityOrOperationResult: "pass" })) } },
          notification: { status: "pass", notes: "", fields: { notificationAppliances: Array.from({ length: 20 }, (_, i) => ({ location: `Zone ${i + 1}`, applianceType: "Horn Strobe", audibleOperation: "pass", visualOperation: "pass" })) } },
          "system-summary": { status: "pass", notes: "", fields: { controlPanelsInspected: 1, initiatingDevicesInspected: 20, notificationAppliancesInspected: 20 } }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: { siteName: "", customerName: "", scheduledDate: "", assetCount: 0, priorReportSummary: "" }
      }
    });

    expect(Buffer.from(bytes).slice(0, 4).toString()).toBe("%PDF");

    const model = buildFireAlarmRenderModel({
      ...createBaseInput(),
      tenant: {
        name: "Northwest Fire & Safety Regional Compliance Operations Group",
        branding: {
          ...createBaseInput().tenant.branding,
          legalBusinessName: "Northwest Fire & Safety Regional Compliance Operations Group"
        }
      },
      task: { inspectionType: "fire_alarm" },
      draft: {
        templateVersion: 1,
        inspectionType: "fire_alarm",
        overallNotes: new Array(80).fill("System inspected and documented.").join(" "),
        sectionOrder: ["control-panel", "initiating-devices", "notification", "system-summary"],
        activeSectionId: "control-panel",
        sections: {
          "control-panel": { status: "pass", notes: "", fields: { controlPanels: [], lineVoltageStatus: "normal" } },
          "initiating-devices": { status: "pass", notes: "", fields: { initiatingDevices: Array.from({ length: 20 }, (_, i) => ({ location: `Area ${i + 1}`, deviceType: "Smoke Detector", functionalTestResult: "pass", physicalCondition: "good", sensitivityOrOperationResult: "pass" })) } },
          notification: { status: "pass", notes: "", fields: { notificationAppliances: Array.from({ length: 20 }, (_, i) => ({ location: `Zone ${i + 1}`, applianceType: "Horn Strobe", audibleOperation: "pass", visualOperation: "pass" })) } },
          "system-summary": { status: "pass", notes: "", fields: { controlPanelsInspected: 1, initiatingDevicesInspected: 20, notificationAppliancesInspected: 20 } }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: { siteName: "", customerName: "", scheduledDate: "", assetCount: 0, priorReportSummary: "" }
      }
    });
    const html = await renderPdfHtml(createElement(FireAlarmReportDocument, { model }));
    expect(html).toContain("Northwest Fire &amp; Safety Regional Compliance Operations Group");
    expect(html).toContain("Fire Alarm Inspection and Testing Report");
  });

  it("routes non-bespoke report types through the generic v2 engine", async () => {
    expect(resolvePdfVersionForInspectionType("fire_pump")).toBe("v2");

    const bytes = await generateInspectionReportPdfV2({
      ...createBaseInput(),
      task: { inspectionType: "fire_pump" },
      draft: {
        templateVersion: 1,
        inspectionType: "fire_pump",
        overallNotes: "Pump test complete.",
        sectionOrder: ["pump-overview"],
        activeSectionId: "pump-overview",
        sections: {
          "pump-overview": {
            status: "pass",
            notes: "",
            fields: {
              pumpType: "Electric",
              pumpRoomCondition: "good",
              churnPressure: "110",
              noFlowPressure: "100"
            }
          }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: { siteName: "", customerName: "", scheduledDate: "", assetCount: 0, priorReportSummary: "" }
      }
    });

    expect(Buffer.from(bytes).slice(0, 4).toString()).toBe("%PDF");
  });
});
