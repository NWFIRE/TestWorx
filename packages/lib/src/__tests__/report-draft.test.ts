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

  it("marks prior report rows as carried-forward visit context without mutating the source report", () => {
    const priorCompletedDraft = {
      sections: {
        inventory: {
          status: "pass",
          notes: "",
          fields: {
            extinguishers: [
              {
                __rowId: "prior-row-1",
                assetTag: "EXT-100",
                location: "Lobby",
                extinguisherType: "5 lb ABC",
                servicePerformed: "Annual Inspection"
              }
            ]
          }
        }
      }
    };
    const priorSnapshot = JSON.parse(JSON.stringify(priorCompletedDraft));

    const draft = buildInitialReportDraft({
      inspectionType: "fire_extinguisher",
      siteName: "Pinecrest Tower",
      customerName: "Pinecrest",
      scheduledDate: "2026-03-20T15:00:00.000Z",
      assetCount: 1,
      priorCompletedDraft,
      priorReportContext: {
        reportId: "report_prior_1",
        finalizedAt: "2026-01-20T15:00:00.000Z"
      }
    });

    const rows = draft.sections.inventory?.fields.extinguishers;
    expect(Array.isArray(rows)).toBe(true);
    const carriedForwardRow = Array.isArray(rows) ? rows[0] : null;

    expect(carriedForwardRow).toMatchObject({
      assetTag: "EXT-100",
      sourceReportId: "report_prior_1",
      sourceReportItemId: "prior-row-1",
      carriedForwardFromDate: "2026-01-20T15:00:00.000Z",
      carryForwardStatus: "carried_forward",
      visitStatus: "not_reviewed",
      billableStatus: "not_billable"
    });
    expect(priorCompletedDraft).toEqual(priorSnapshot);
  });
});
