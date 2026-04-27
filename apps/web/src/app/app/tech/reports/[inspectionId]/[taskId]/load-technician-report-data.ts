import { format } from "date-fns";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getInspectionDisplayLabels, getInspectionReportDraft, isDueAtTimeOfServiceCustomer } from "@testworx/lib/server/index";

import type { TechnicianReportEditorData } from "../../../report-editor";

function buildCorrectionNotice(report: Awaited<ReturnType<typeof getInspectionReportDraft>>) {
  if (!report || report.correctionState === "none") {
    return null;
  }

  const requestedAt = report.correctionRequestedAt ? new Date(report.correctionRequestedAt).toLocaleString() : "recently";
  const reason = report.correctionReason ? ` Reason: ${report.correctionReason}` : "";
  if (report.correctionState === "reissued_to_technician") {
    return `This report was re-issued for correction on ${requestedAt}.${reason}`;
  }

  return `This completed report is in an admin correction workflow as of ${requestedAt}.${reason}`;
}

export async function loadTechnicianReportData(inspectionId: string, taskId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    notFound();
  }

  if (!["technician", "tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  let report;
  try {
    report = await getInspectionReportDraft({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, inspectionId, taskId);
  } catch (error) {
    if (
      error instanceof Error &&
      session.user.role === "technician" &&
      /completed inspections are no longer available in the technician app/i.test(error.message)
    ) {
      redirect("/app/tech?report=finalized");
    }

    throw error;
  }

  if (!report) {
    notFound();
  }

  const inspectionDisplay = getInspectionDisplayLabels({
    siteName: report.inspection.site.name,
    customerName: report.inspection.customerCompany.name
  });

  const data: TechnicianReportEditorData = {
    reportId: report.id,
    reportStatus: report.status,
    reportUpdatedAt: report.updatedAt,
    finalizedAt: report.finalizedAt,
    correctionNotice: buildCorrectionNotice(report),
    canEdit: report.permissions.canEdit,
    canFinalize: report.permissions.canFinalize,
    inspectionTypeLabel: report.task.displayLabel ?? report.template.label,
    defaultInspectionTypeLabel: report.template.label,
    customInspectionTypeLabel: report.task.customDisplayLabel ?? null,
    siteName: inspectionDisplay.primaryTitle,
    customerName: inspectionDisplay.secondaryTitle || report.inspection.customerCompany.name,
    customerContactName: report.inspection.customerCompany.contactName ?? null,
    customerPhone: report.inspection.customerCompany.phone ?? null,
    customerEmail: report.inspection.customerCompany.billingEmail ?? null,
    scheduledDateLabel: format(report.inspection.scheduledStart, "MMM d, yyyy h:mm a"),
    inspectionWorkspace: {
      inspectionId,
      totalTaskCount: report.relatedTasks.length,
      currentTaskIndex: report.relatedTasks.find((task) => task.isCurrent)?.currentTaskIndex ?? 1,
      relatedTasks: report.relatedTasks.map((task) => ({
        id: task.id,
        displayLabel: task.displayLabel,
        reportStatus: task.reportStatus,
        hasMeaningfulProgress: task.hasMeaningfulProgress,
        progressCompletedCount: task.progressCompletedCount,
        progressTotalCount: task.progressTotalCount,
        progressPercent: task.progressPercent,
        isCurrent: task.isCurrent
      }))
    },
    dispatchNotes: report.inspection.notes,
    paymentCollectionNotice: isDueAtTimeOfServiceCustomer(report.inspection.customerCompany)
      ? "Payment due at time of service. Collect payment before leaving the site."
      : null,
    template: report.template,
    draft: report.draft
  };

  return {
    report,
    data
  };
}
