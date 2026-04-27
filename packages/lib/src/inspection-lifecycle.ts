export type LifecycleInspectionStatus =
  | "to_be_completed"
  | "assigned"
  | "in_progress"
  | "ready_for_completion"
  | "completed"
  | "cancelled";

export type LifecycleReportStatus =
  | "not_started"
  | "draft"
  | "finalized"
  | "reissued_for_correction"
  | "corrected"
  | "void";

export type LifecycleBillingStatus =
  | "not_billable"
  | "not_billed"
  | "ready_to_bill"
  | "invoice_draft"
  | "invoiced"
  | "paid"
  | "write_off_no_charge";

export type LifecycleActionState =
  | "none"
  | "needs_attention"
  | "needs_correction"
  | "ready_to_bill"
  | "sync_issue";

export type LifecycleSummary = {
  inspectionStatus: LifecycleInspectionStatus;
  reportStatus: LifecycleReportStatus;
  billingStatus: LifecycleBillingStatus;
  actionState: LifecycleActionState;
  primaryLabel: string;
  secondaryLabel?: string;
  nextAction?: string;
};

export type LifecycleReportInput = {
  status?: string | null;
  correctionState?: string | null;
  correctionResolvedAt?: Date | string | null;
  finalizedAt?: Date | string | null;
};

export function formatLifecycleInspectionStatusLabel(status: string) {
  if (status === "scheduled" || status === "to_be_completed") {
    return "To Be Completed";
  }
  if (status === "assigned") {
    return "Assigned";
  }
  if (status === "ready_for_completion") {
    return "Ready for Completion";
  }
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function resolveReportLifecycleStatus(reports: LifecycleReportInput[]): LifecycleReportStatus {
  if (reports.some((report) => report.correctionState === "reissued_to_technician")) {
    return "reissued_for_correction";
  }
  if (reports.some((report) => report.correctionResolvedAt)) {
    return "corrected";
  }
  if (reports.length > 0 && reports.every((report) => report.status === "finalized" || report.finalizedAt)) {
    return "finalized";
  }
  if (reports.some((report) => report.status === "draft" || report.status === "submitted" || report.finalizedAt)) {
    return "draft";
  }
  return "not_started";
}

export function resolveBillingLifecycleStatus(input: {
  billingStatus?: string | null;
  quickbooksSyncStatus?: string | null;
  quickbooksInvoiceId?: string | null;
  quickbooksInvoiceNumber?: string | null;
  notBillable?: boolean;
}) {
  if (input.notBillable) {
    return "not_billable" satisfies LifecycleBillingStatus;
  }
  if (input.billingStatus === "paid") {
    return "paid" satisfies LifecycleBillingStatus;
  }
  if (input.billingStatus === "write_off" || input.billingStatus === "no_charge") {
    return "write_off_no_charge" satisfies LifecycleBillingStatus;
  }
  if (
    input.billingStatus === "invoiced" ||
    input.quickbooksInvoiceId ||
    input.quickbooksInvoiceNumber ||
    input.quickbooksSyncStatus === "synced" ||
    input.quickbooksSyncStatus === "sent"
  ) {
    return "invoiced" satisfies LifecycleBillingStatus;
  }
  if (input.billingStatus === "reviewed") {
    return "ready_to_bill" satisfies LifecycleBillingStatus;
  }
  if (input.billingStatus === "draft") {
    return "invoice_draft" satisfies LifecycleBillingStatus;
  }
  return "not_billed" satisfies LifecycleBillingStatus;
}

function resolveInspectionLifecycleStatus(input: {
  inspectionStatus?: string | null;
  assignedTechnicianCount?: number;
  hasStartedWork?: boolean;
}): LifecycleInspectionStatus {
  if (input.inspectionStatus === "cancelled") {
    return "cancelled";
  }
  if (input.inspectionStatus === "completed" || input.inspectionStatus === "invoiced") {
    return "completed";
  }
  if (input.inspectionStatus === "follow_up_required") {
    return "ready_for_completion";
  }
  if (input.inspectionStatus === "in_progress" || input.hasStartedWork) {
    return "in_progress";
  }
  if ((input.assignedTechnicianCount ?? 0) > 0) {
    return "assigned";
  }
  return "to_be_completed";
}

function hasClosedBillingStatus(status: LifecycleBillingStatus) {
  return status === "invoiced" || status === "paid" || status === "write_off_no_charge";
}

function labelForBillingStatus(status: LifecycleBillingStatus) {
  switch (status) {
    case "not_billable":
      return "Not Billable";
    case "not_billed":
      return "Not Billed";
    case "ready_to_bill":
      return "Ready to Bill";
    case "invoice_draft":
      return "Invoice Draft";
    case "invoiced":
      return "Invoiced";
    case "paid":
      return "Paid";
    case "write_off_no_charge":
      return "Write-Off / No Charge";
    default:
      return "Not Billed";
  }
}

function labelForReportStatus(status: LifecycleReportStatus) {
  switch (status) {
    case "reissued_for_correction":
      return "Correction Required";
    case "corrected":
      return "Corrected";
    case "finalized":
      return "Finalized";
    case "draft":
      return "Draft";
    case "void":
      return "Void";
    case "not_started":
    default:
      return "Not Started";
  }
}

export function resolveInspectionLifecycleSummary(input: {
  inspectionStatus?: string | null;
  assignedTechnicianCount?: number;
  hasStartedWork?: boolean;
  reports?: LifecycleReportInput[];
  billingStatus?: string | null;
  quickbooksSyncStatus?: string | null;
  quickbooksInvoiceId?: string | null;
  quickbooksInvoiceNumber?: string | null;
  notBillable?: boolean;
  hasSyncIssue?: boolean;
  hasBlockingIssue?: boolean;
  missingRequiredSignature?: boolean;
  isPriority?: boolean;
  isOverdue?: boolean;
}): LifecycleSummary {
  const inspectionStatus = resolveInspectionLifecycleStatus(input);
  const reportStatus = resolveReportLifecycleStatus(input.reports ?? []);
  const billingStatus = resolveBillingLifecycleStatus(input);
  const hasClosedBilling = hasClosedBillingStatus(billingStatus);

  if (input.hasSyncIssue || input.quickbooksSyncStatus === "failed" || input.quickbooksSyncStatus === "sync_error") {
    return {
      inspectionStatus,
      reportStatus,
      billingStatus,
      actionState: "sync_issue",
      primaryLabel: "Sync Attention Required",
      secondaryLabel: "A sync failure needs review before this item can close cleanly.",
      nextAction: "Review Sync Issue"
    };
  }

  if (reportStatus === "reissued_for_correction" && !hasClosedBilling) {
    return {
      inspectionStatus,
      reportStatus,
      billingStatus,
      actionState: "needs_correction",
      primaryLabel: "Correction Required",
      secondaryLabel: "Report returned for correction.",
      nextAction: "Resume Correction"
    };
  }

  if ((input.hasBlockingIssue || input.missingRequiredSignature || input.isOverdue || input.isPriority) && !hasClosedBilling) {
    return {
      inspectionStatus,
      reportStatus,
      billingStatus,
      actionState: "needs_attention",
      primaryLabel: input.missingRequiredSignature ? "Missing Signature" : input.isOverdue ? "Needs Attention" : "Priority Attention",
      secondaryLabel: input.missingRequiredSignature
        ? "A required signature is missing."
        : input.isOverdue
          ? "Assigned work is overdue."
          : "Priority work needs human follow-through.",
      nextAction: "Review Item"
    };
  }

  if (
    inspectionStatus === "completed" &&
    reportStatus === "finalized" &&
    !hasClosedBilling &&
    billingStatus !== "not_billable"
  ) {
    return {
      inspectionStatus,
      reportStatus,
      billingStatus,
      actionState: "ready_to_bill",
      primaryLabel: "Ready to Bill",
      secondaryLabel: "Finalized and ready for invoice.",
      nextAction: "Create Invoice"
    };
  }

  if (hasClosedBilling) {
    return {
      inspectionStatus,
      reportStatus,
      billingStatus,
      actionState: "none",
      primaryLabel: labelForBillingStatus(billingStatus)
    };
  }

  if (reportStatus === "finalized") {
    return {
      inspectionStatus,
      reportStatus,
      billingStatus,
      actionState: "none",
      primaryLabel: "Finalized"
    };
  }

  return {
    inspectionStatus,
    reportStatus,
    billingStatus,
    actionState: "none",
    primaryLabel: inspectionStatus === "in_progress" ? "In Progress" : labelForReportStatus(reportStatus),
    nextAction: inspectionStatus === "in_progress" || reportStatus === "draft" ? "Continue Inspection" : undefined
  };
}
