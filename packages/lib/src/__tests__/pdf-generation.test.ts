import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  buildPdfPhotoCaption,
  formatPdfAddress,
  generateInspectionReportPdf,
  getCustomerFacingOutcomeLabel,
  getCustomerFacingReportState,
  getPdfComplianceStandards
} from "../pdf-report";
import { resolveReportTypeConfig } from "../report-pdf-config";
import { buildDataUrlStorageKey, decodeStoredFile } from "../storage";

const tinyPngBytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=", "base64"));
const tinyPngDataUrl = buildDataUrlStorageKey({ mimeType: "image/png", bytes: tinyPngBytes });

describe("pdf generation workflow", () => {
  it("formats shared PDF customer-facing helpers cleanly", () => {
    expect(buildPdfPhotoCaption(0)).toBe("Photo 1");
    expect(getPdfComplianceStandards("kitchen_suppression")).toEqual(["NFPA 17A", "NFPA 96"]);
    expect(resolveReportTypeConfig("fire_alarm").title).toBe("Fire Alarm Inspection and Testing Report");
    expect(resolveReportTypeConfig("fire_alarm").sections[0]?.key).toBe("control-panel");
    expect(getCustomerFacingReportState({ report: { finalizedAt: new Date("2026-03-12T11:00:00.000Z") } })).toBe("Finalized");
    expect(getCustomerFacingReportState({ report: { finalizedAt: null } })).toBe("In Review");
    expect(getCustomerFacingOutcomeLabel({ report: { finalizedAt: new Date("2026-03-12T11:00:00.000Z") } }, 0)).toBe("Passed");
    expect(getCustomerFacingOutcomeLabel({ report: { finalizedAt: null } }, 0)).toBe("Completed");
    expect(getCustomerFacingOutcomeLabel({ report: { finalizedAt: null } }, 2)).toBe("Deficiencies Found");
    expect(
      formatPdfAddress({
        addressLine1: null,
        addressLine2: null,
        city: null,
        state: null,
        postalCode: null,
        fallback: "No fixed service address on file"
      })
    ).toBe("No fixed service address on file");
    expect(
      formatPdfAddress({
        addressLine1: "100 State St",
        city: "Chicago",
        state: "IL",
        postalCode: "60601"
      })
    ).toBe("100 State St, Chicago, IL 60601");
  });

  it("generates a branded inspection report PDF payload", async () => {
    const bytes = await generateInspectionReportPdf({
      tenant: {
        name: "Evergreen Fire Protection",
        branding: {
          primaryColor: "#1E3A5F",
          accentColor: "#C2410C",
          phone: "312-555-0199",
          email: "service@evergreenfire.com",
          addressLine1: "410 West Erie Street",
          city: "Chicago",
          state: "IL",
          postalCode: "60654"
        }
      },
      customerCompany: {
        name: "Pinecrest Property Management",
        contactName: "Alyssa Reed",
        billingEmail: "ap@pinecrestpm.com",
        phone: "312-555-0110"
      },
      site: {
        name: "Pinecrest Tower",
        addressLine1: "100 State St",
        addressLine2: null,
        city: "Chicago",
        state: "IL",
        postalCode: "60601"
      },
      inspection: {
        id: "inspection_1",
        scheduledStart: new Date("2026-03-12T09:00:00.000Z"),
        scheduledEnd: new Date("2026-03-12T10:00:00.000Z"),
        status: "completed",
        notes: "Annual combo visit"
      },
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
                {
                  assetTag: "EXT-100",
                  location: "Lobby by east stair",
                  manufacturer: "amerex",
                  serialNumber: "AMX-44021",
                  extinguisherType: "5 lb ABC",
                  ulRating: "3-A:40-B:C",
                  gaugeStatus: "pass",
                  mountingSecure: "pass",
                  mfgDate: "24",
                  lastHydro: "20",
                  lastSixYear: "24",
                  nextHydro: "32",
                  servicePerformed: "Annual Inspection",
                  notes: "Ready for service"
                }
              ],
              unitsInspected: 1
            }
          },
          service: { status: "pass", notes: "No recharge required", fields: { followUpRecommended: false, jurisdictionNotes: "None" } }
        },
        deficiencies: [{ id: "def_1", title: "Blocked cabinet", description: "Clear access required.", severity: "medium", status: "open", assetId: null }],
        attachments: [],
        signatures: {
          technician: { signerName: "Alex Turner", imageDataUrl: tinyPngDataUrl, signedAt: "2026-03-12T10:55:00.000Z" },
          customer: { signerName: "Alyssa Reed", imageDataUrl: tinyPngDataUrl, signedAt: "2026-03-12T10:57:00.000Z" }
        },
        context: {
          siteName: "Pinecrest Tower",
          customerName: "Pinecrest Property Management",
          scheduledDate: "2026-03-12T09:00:00.000Z",
          assetCount: 12,
          priorReportSummary: "Previous report finalized on 2025-03-12."
        }
      },
      deficiencies: [{ title: "Blocked cabinet", description: "Clear access required.", severity: "medium", status: "open" }],
      photos: [],
      technicianSignature: null,
      customerSignature: null
    });

    expect(Buffer.from(bytes).slice(0, 4).toString()).toBe("%PDF");
  });

  it("creates additional pages for long content without throwing", async () => {
    const bytes = await generateInspectionReportPdf({
      tenant: { name: "Evergreen Fire Protection", branding: { primaryColor: "#1E3A5F", accentColor: "#C2410C" } },
      customerCompany: { name: "Harbor View Hospital", contactName: "Jon Morales", billingEmail: "facilities@harborview.org", phone: "312-555-0111" },
      site: { name: "Harbor Main Campus", addressLine1: "800 Harbor Dr", addressLine2: null, city: "Chicago", state: "IL", postalCode: "60611" },
      inspection: { id: "inspection_2", scheduledStart: new Date("2026-03-12T09:00:00.000Z"), scheduledEnd: null, status: "completed", notes: null },
      task: { inspectionType: "fire_alarm" },
      report: { id: "report_2", finalizedAt: new Date("2026-03-12T11:00:00.000Z"), technicianName: "Alex Turner" },
      draft: {
        templateVersion: 1,
        inspectionType: "fire_alarm",
        overallNotes: new Array(120).fill("Panel tested and devices responded correctly.").join(" "),
        sectionOrder: ["control-panel", "initiating-devices", "notification", "system-summary"],
        activeSectionId: "control-panel",
        sections: {
          "control-panel": {
            status: "attention",
            notes: new Array(30).fill("Primary power, batteries, and annunciation were reviewed at the panel.").join(" "),
            fields: {
              controlPanelsInspected: 1,
              lineVoltageStatus: "normal",
              acPowerIndicator: "yes",
              acBreakerLocked: "yes",
              batteryLoadTest: "pass",
              centralStationSignalTest: "pass",
              controlPanelCondition: "pass",
              controlPanelComments: "No active troubles."
            }
          },
          "initiating-devices": {
            status: "attention",
            notes: new Array(30).fill("One initiating device required label replacement and cleaning.").join(" "),
            fields: { initiatingDevicesInspected: 48, initiatingDeviceDeficiencyCount: 1, initiatingDeviceNotes: "ANSI sample with one detector flagged for follow-up." }
          },
          notification: {
            status: "pass",
            notes: new Array(30).fill("Notification appliances activated correctly throughout the tested sample.").join(" "),
            fields: { notificationAppliancesInspected: 30, notificationDeficiencyCount: 0, notificationNotes: "Speaker strobes synchronized and audibility confirmed." }
          },
          "system-summary": {
            status: "attention",
            notes: "",
            fields: {
              controlPanelsInspected: 1,
              initiatingDevicesInspected: 48,
              notificationAppliancesInspected: 30,
              deficiencyCount: 1,
              deficienciesFound: true,
              fireAlarmSystemStatus: "pass_with_deficiencies",
              inspectorNotes: "Secondary power verified under load.",
              recommendedRepairs: "Replace missing detector label and retest.",
              followUpRequired: true
            }
          }
        },
        deficiencies: Array.from({ length: 8 }, (_, index) => ({ id: `def_${index}`, title: `Issue ${index + 1}`, description: new Array(12).fill("Detailed deficiency wording for the report and follow-up planning.").join(" "), severity: "medium", status: "open", assetId: null })),
        attachments: [],
        signatures: {
          technician: { signerName: "Alex Turner", imageDataUrl: tinyPngDataUrl, signedAt: "2026-03-12T10:55:00.000Z" },
          customer: { signerName: "Jon Morales", imageDataUrl: tinyPngDataUrl, signedAt: "2026-03-12T10:57:00.000Z" }
        },
        context: { siteName: "Harbor Main Campus", customerName: "Harbor View Hospital", scheduledDate: "2026-03-12T09:00:00.000Z", assetCount: 48, priorReportSummary: "Prior annual inspection completed." }
      },
      deficiencies: Array.from({ length: 8 }, (_, index) => ({ title: `Issue ${index + 1}`, description: new Array(12).fill("Detailed deficiency wording for the report and follow-up planning.").join(" "), severity: "medium", status: "open" })),
      photos: [],
      technicianSignature: { signerName: "Alex Turner", imageDataUrl: tinyPngDataUrl, signedAt: "2026-03-12T10:55:00.000Z" },
      customerSignature: { signerName: "Jon Morales", imageDataUrl: tinyPngDataUrl, signedAt: "2026-03-12T10:57:00.000Z" }
    });

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it("generates a branded work order report PDF using the shared premium renderer", async () => {
    const bytes = await generateInspectionReportPdf({
      tenant: {
        name: "Evergreen Fire Protection",
        branding: {
          primaryColor: "#1E3A5F",
          accentColor: "#C2410C",
          phone: "312-555-0199",
          email: "service@evergreenfire.com",
          website: "https://evergreenfire.com"
        }
      },
      customerCompany: {
        name: "Pinecrest Property Management",
        contactName: "Alyssa Reed",
        billingEmail: "ap@pinecrestpm.com",
        phone: "312-555-0110"
      },
      site: {
        name: "Pinecrest Tower",
        addressLine1: "100 State St",
        addressLine2: null,
        city: "Chicago",
        state: "IL",
        postalCode: "60601"
      },
      inspection: {
        id: "inspection_work_order_1",
        scheduledStart: new Date("2026-03-15T09:00:00.000Z"),
        scheduledEnd: new Date("2026-03-15T11:30:00.000Z"),
        status: "completed",
        notes: "Customer approved replacement devices on site."
      },
      task: { inspectionType: "work_order" },
      report: { id: "report_work_order_1", finalizedAt: new Date("2026-03-15T11:45:00.000Z"), technicianName: "Alex Turner" },
      draft: {
        templateVersion: 1,
        inspectionType: "work_order",
        overallNotes: "",
        sectionOrder: ["work-performed", "parts-equipment-used", "service-provided"],
        activeSectionId: "work-performed",
        sections: {
          "work-performed": {
            status: "completed",
            notes: "",
            fields: {
              workOrderNumber: "WO-2026-0142",
              descriptionOfWork: "Replaced two extinguishers in the lobby, recharged one 10 lb ABC unit, and completed light service in the north corridor.",
              jobsiteHours: "2.5",
              jobsiteHoursCustom: "",
              followUpRequired: true,
              additionalNotes: "Recommend follow-up visit for additional corridor fixtures next week."
            }
          },
          "parts-equipment-used": {
            status: "completed",
            notes: "",
            fields: {
              partsEquipmentUsed: [
                { item: "5 lb ABC", itemCustom: "", category: "Fire extinguisher", quantity: 2, notes: "New units installed at lobby exits." },
                { item: "Exit Sign", itemCustom: "", category: "Exit / emergency lighting", quantity: 1, notes: "North corridor replacement." }
              ]
            }
          },
          "service-provided": {
            status: "completed",
            notes: "",
            fields: {
              serviceProvided: [
                { service: "Recharge", serviceCustom: "", applicableEquipment: "10 lb ABC", applicableEquipmentCustom: "", quantity: 1, notes: "Existing unit recharged and tagged." },
                { service: "Emergency Light Service", serviceCustom: "", applicableEquipment: "Emergency Light", applicableEquipmentCustom: "", quantity: 2, notes: "Battery and lamp verification complete." }
              ]
            }
          }
        },
        deficiencies: [],
        attachments: [],
        signatures: {
          technician: { signerName: "Alex Turner", imageDataUrl: tinyPngDataUrl, signedAt: "2026-03-15T11:42:00.000Z" },
          customer: { signerName: "Alyssa Reed", imageDataUrl: tinyPngDataUrl, signedAt: "2026-03-15T11:44:00.000Z" }
        },
        context: {
          siteName: "Pinecrest Tower",
          customerName: "Pinecrest Property Management",
          scheduledDate: "2026-03-15T09:00:00.000Z",
          assetCount: 0,
          priorReportSummary: ""
        }
      },
      deficiencies: [],
      photos: [],
      technicianSignature: { signerName: "Alex Turner", imageDataUrl: tinyPngDataUrl, signedAt: "2026-03-15T11:42:00.000Z" },
      customerSignature: { signerName: "Alyssa Reed", imageDataUrl: tinyPngDataUrl, signedAt: "2026-03-15T11:44:00.000Z" }
    });

    expect(Buffer.from(bytes).slice(0, 4).toString()).toBe("%PDF");
  });

  it("round-trips stored attachment payloads through the storage abstraction", async () => {
    const storageKey = buildDataUrlStorageKey({ mimeType: "application/pdf", bytes: new Uint8Array([37, 80, 68, 70]) });
    const decoded = await decodeStoredFile(storageKey);

    expect(decoded.mimeType).toBe("application/pdf");
    expect(Array.from(decoded.bytes)).toEqual([37, 80, 68, 70]);
  });
});
