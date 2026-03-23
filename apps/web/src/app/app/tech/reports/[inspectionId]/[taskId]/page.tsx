import { format } from "date-fns";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getInspectionReportDraft } from "@testworx/lib";

import { ReportEditor } from "../../../report-editor";

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

export default async function TechnicianReportPage({ params }: { params: Promise<{ inspectionId: string; taskId: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    notFound();
  }

  if (!["technician", "tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const { inspectionId, taskId } = await params;
  const report = await getInspectionReportDraft({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, inspectionId, taskId);
  if (!report) {
    notFound();
  }

  return (
    <ReportEditor
      data={{
        reportId: report.id,
        reportStatus: report.status,
        reportUpdatedAt: report.updatedAt,
        finalizedAt: report.finalizedAt,
        correctionNotice: buildCorrectionNotice(report),
        canEdit: report.permissions.canEdit,
        canFinalize: report.permissions.canFinalize,
        inspectionTypeLabel: report.task.displayLabel ?? report.template.label,
        siteName: report.inspection.site.name,
        customerName: report.inspection.customerCompany.name,
        scheduledDateLabel: format(report.inspection.scheduledStart, "MMM d, yyyy h:mm a"),
        template: report.template,
        draft: report.draft
      }}
    />
  );
}
