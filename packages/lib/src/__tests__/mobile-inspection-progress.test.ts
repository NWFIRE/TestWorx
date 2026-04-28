import { describe, expect, it } from "vitest";

import { buildInitialReportDraft } from "../report-engine";
import { buildMobileInspectionProgressSummary } from "../mobile-inspection-progress";
import { resolveReportTemplate } from "../report-config";

describe("mobile inspection progress", () => {
  it("hides invalid zero progress while tracking meaningful fire alarm section progress", () => {
    const template = resolveReportTemplate({ inspectionType: "fire_alarm", assets: [] });
    const draft = buildInitialReportDraft({
      inspectionType: "fire_alarm",
      siteName: "Pinecrest Tower",
      customerName: "Pinecrest Property Management",
      scheduledDate: "2026-04-24T15:00:00.000Z",
      assetCount: 0,
      siteDefaults: {},
      tenantBrandingDefaults: {},
      assets: []
    });

    const initial = buildMobileInspectionProgressSummary(template, draft);
    const initialControlPanelSection = initial.sections.find((section) => section.sectionId === "control-panel");
    expect(initial.reportStatus).toBe("Not Started");
    expect(initialControlPanelSection?.status).toBe("not_started");
    expect(initial.completedCount).toBeGreaterThan(0);
    expect(initial.totalCount).toBeGreaterThan(initial.completedCount ?? 0);

    draft.sections["control-panel"] = {
      ...draft.sections["control-panel"],
      fields: {
        ...draft.sections["control-panel"]?.fields,
        controlPanels: [
          {
            assetId: "asset_1",
            panelName: "Main Panel",
            manufacturer: "Notifier",
            model: "NFS2",
            serialNumber: "SN-1",
            location: "Electrical Room",
            communicationPathType: "dual_path",
            batteryDateCode: "2026-01",
            batterySize: "12v_18ah",
            batteryQuantity: "2",
            batteryChargeLevel: "normal",
            batteryLoadTest: "pass",
            batteriesReplacementNeeded: false
          }
        ],
        lineVoltageStatus: "normal",
        acPowerIndicator: "yes",
        acBreakerLocked: "yes",
        powerSupplyCondition: "good",
        audibleAlarm: "pass",
        visualAlarm: "pass",
        audibleTrouble: "pass",
        visualTrouble: "pass",
        lcdDisplayFunctional: "yes",
        remoteMonitoring: "yes",
        centralStationSignalTest: "pass",
        remoteAnnunciator: "yes",
        remoteIndicators: "pass",
        doorAndLockCondition: "good",
        controlPanelCondition: "pass"
      }
    };

    const progressed = buildMobileInspectionProgressSummary(template, draft);
    const controlPanelSection = progressed.sections.find((section) => section.sectionId === "control-panel");

    expect(progressed.reportStatus).toBe("In Progress");
    expect(controlPanelSection?.status).toBe("complete");
    expect(controlPanelSection?.totalCount).toBeGreaterThan(0);
    expect(controlPanelSection?.completedCount).toBe(controlPanelSection?.totalCount);
  });
});
