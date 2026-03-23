import { describe, expect, it } from "vitest";

import { buildInitialReportDraft } from "../report-engine";

describe("draft save foundations", () => {
  it("hydrates a report draft from template defaults", () => {
    const draft = buildInitialReportDraft({
      inspectionType: "fire_extinguisher",
      siteName: "Pinecrest Tower",
      customerName: "Pinecrest",
      scheduledDate: "2026-03-20T15:00:00.000Z",
      assetCount: 12
    });

    expect(draft.sectionOrder).toContain("inventory");
    expect(draft.context.assetCount).toBe(12);
    expect(draft.sections.inventory?.status).toBe("pending");
  });

  it("carries forward existing content when rebuilding a draft", () => {
    const draft = buildInitialReportDraft({
      inspectionType: "fire_alarm",
      siteName: "Harbor Main",
      customerName: "Harbor",
      scheduledDate: "2026-03-20T15:00:00.000Z",
      assetCount: 3,
      previousDraft: {
        overallNotes: "Existing notes",
        sectionOrder: ["control-panel"],
        sections: {
          "control-panel": {
            status: "pass",
            notes: "Panel clear",
            fields: { panelCondition: "pass" }
          }
        }
      }
    });

    expect(draft.overallNotes).toBe("Existing notes");
    expect(draft.sections["control-panel"]?.status).toBe("pass");
  });
});