import { describe, expect, it } from "vitest";

import { canEditReport, canFinalizeReport, normalizeSignaturePayload, validateDraftForTemplate, validateFinalizationDraft } from "../report-engine";

describe("finalization and authorization", () => {
  const completeDraft = {
    templateVersion: 1,
    inspectionType: "fire_extinguisher",
    overallNotes: "All good",
    sectionOrder: ["inventory"],
    activeSectionId: "inventory",
    sections: {
      inventory: {
        status: "pass",
        notes: "Checked",
        fields: {
          extinguishers: [
            {
              location: "Lobby",
              extinguisherType: "5_lb_abc",
              ulRating: "3-A:40-B:C",
              manufacturer: "Amerex",
              mfgDate: "24",
              lastHydro: "19",
              lastSixYear: "",
              nextHydro: "31",
              servicePerformed: "annual_inspection",
              gaugeStatus: "pass",
              mountingSecure: "pass",
              notes: ""
            }
          ]
        }
      }
    },
    deficiencies: [],
    attachments: [],
    signatures: {
      technician: { signerName: "Alex Turner", imageDataUrl: "data:image/png;base64,abc", signedAt: "2026-03-20T15:00:00.000Z" },
      customer: { signerName: "Customer Rep", imageDataUrl: "data:image/png;base64,def", signedAt: "2026-03-20T15:05:00.000Z" }
    },
    context: {
      siteName: "Pinecrest Tower",
      customerName: "Pinecrest",
      scheduledDate: "2026-03-20T15:00:00.000Z",
      assetCount: 10,
      priorReportSummary: ""
    }
  };

  it("requires both signatures and completed section statuses to finalize", () => {
    expect(() => validateFinalizationDraft({ ...completeDraft, signatures: { technician: completeDraft.signatures.technician } })).toThrow(/signatures are required/i);
    expect(() => validateFinalizationDraft({ ...completeDraft, sections: { inventory: { ...completeDraft.sections.inventory, status: "pending" } } })).toThrow(/all report sections must be marked/i);
    expect(validateFinalizationDraft(completeDraft)).toBe(true);
  });

  it("normalizes signature payloads", () => {
    const payload = normalizeSignaturePayload("technician", { signerName: " Alex Turner ", imageDataUrl: "data:image/png;base64,abc" });
    expect(payload.signerName).toBe("Alex Turner");
    expect(payload.kind).toBe("technician");
  });

  it("locks finalized reports from standard editing for every role", () => {
    expect(canEditReport("technician", "finalized")).toBe(false);
    expect(canEditReport("office_admin", "finalized")).toBe(false);
    expect(canFinalizeReport("customer_user", "draft")).toBe(false);
  });

  it("rejects drafts that do not match the inspection task type", () => {
    expect(() => validateDraftForTemplate({ ...completeDraft, inspectionType: "fire_alarm" }, "fire_extinguisher")).toThrow(/does not match/i);
  });
});
