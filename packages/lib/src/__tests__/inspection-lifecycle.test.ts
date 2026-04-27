import { describe, expect, it } from "vitest";

import {
  formatLifecycleInspectionStatusLabel,
  resolveInspectionLifecycleSummary
} from "../inspection-lifecycle";

const finalizedReport = {
  status: "finalized",
  finalizedAt: new Date("2026-04-10T14:00:00.000Z")
};

describe("inspection lifecycle resolver", () => {
  it("closes completed finalized invoiced work with no action queue state", () => {
    const summary = resolveInspectionLifecycleSummary({
      inspectionStatus: "completed",
      reports: [finalizedReport],
      billingStatus: "invoiced"
    });

    expect(summary).toMatchObject({
      inspectionStatus: "completed",
      reportStatus: "finalized",
      billingStatus: "invoiced",
      actionState: "none",
      primaryLabel: "Invoiced"
    });
  });

  it("routes completed finalized non-invoiced work to Ready to Bill", () => {
    const summary = resolveInspectionLifecycleSummary({
      inspectionStatus: "completed",
      reports: [finalizedReport],
      billingStatus: null
    });

    expect(summary).toMatchObject({
      actionState: "ready_to_bill",
      primaryLabel: "Ready to Bill",
      nextAction: "Create Invoice"
    });
  });

  it("keeps draft reports out of Ready to Bill", () => {
    const summary = resolveInspectionLifecycleSummary({
      inspectionStatus: "in_progress",
      hasStartedWork: true,
      reports: [{ status: "draft" }],
      billingStatus: null
    });

    expect(summary.reportStatus).toBe("draft");
    expect(summary.actionState).toBe("none");
    expect(summary.primaryLabel).toBe("In Progress");
  });

  it("routes reissued reports to Needs Correction when not invoiced", () => {
    const summary = resolveInspectionLifecycleSummary({
      inspectionStatus: "completed",
      reports: [{ status: "finalized", correctionState: "reissued_to_technician" }],
      billingStatus: null
    });

    expect(summary).toMatchObject({
      reportStatus: "reissued_for_correction",
      actionState: "needs_correction",
      primaryLabel: "Correction Required",
      nextAction: "Resume Correction"
    });
  });

  it("keeps paid invoices closed from action queues", () => {
    const summary = resolveInspectionLifecycleSummary({
      inspectionStatus: "completed",
      reports: [finalizedReport],
      billingStatus: "paid"
    });

    expect(summary).toMatchObject({
      billingStatus: "paid",
      actionState: "none",
      primaryLabel: "Paid"
    });
  });

  it("routes failed sync to Sync Issues", () => {
    const summary = resolveInspectionLifecycleSummary({
      inspectionStatus: "completed",
      reports: [finalizedReport],
      billingStatus: "reviewed",
      quickbooksSyncStatus: "failed"
    });

    expect(summary).toMatchObject({
      actionState: "sync_issue",
      primaryLabel: "Sync Attention Required",
      nextAction: "Review Sync Issue"
    });
  });

  it("maps legacy scheduled inspection status to To Be Completed for display", () => {
    expect(formatLifecycleInspectionStatusLabel("scheduled")).toBe("To Be Completed");
  });
});
