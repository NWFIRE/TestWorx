import { format } from "date-fns";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getInspectionReportDraft } from "@testworx/lib/server/index";

import { ReportEditor } from "../../../../tech/report-editor";
import { buildAcceptanceTestViewModel } from "../../../../../reports/acceptance-test/buildAcceptanceTestViewModel";
import { AcceptanceReportEditView } from "../../../../../reports/acceptance-test/pages/AcceptanceReportEditView";

function buildCorrectionNotice(report: Awaited<ReturnType<typeof getInspectionReportDraft>>) {
  if (!report || report.correctionState === "none") {
    return null;
  }

  const requestedAt = report.correctionRequestedAt ? new Date(report.correctionRequestedAt).toLocaleString() : "recently";
  const reason = report.correctionReason ? ` Reason: ${report.correctionReason}` : "";
  if (report.correctionState === "reissued_to_technician") {
    return `This report was re-issued to the assigned technician on ${requestedAt}.${reason}`;
  }

  return `This report is being corrected directly from the admin workflow as of ${requestedAt}.${reason}`;
}

export default async function AdminReportCorrectionPage({ params }: { params: Promise<{ inspectionId: string; taskId: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    notFound();
  }

  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const { inspectionId, taskId } = await params;
  const report = await getInspectionReportDraft({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, inspectionId, taskId);
  if (!report) {
    notFound();
  }

  const adminOverrideForFinalized = report.status === "finalized";
  const correctionNotice = adminOverrideForFinalized
    ? "Admin override mode. Saving changes will return this report to draft until you finalize it again."
    : buildCorrectionNotice(report);
  const editor = (
    <ReportEditor
      data={{
        reportId: report.id,
        reportStatus: adminOverrideForFinalized ? "draft" : report.status,
        reportUpdatedAt: report.updatedAt,
        finalizedAt: report.finalizedAt,
        correctionNotice,
        canEdit: report.permissions.canEdit || adminOverrideForFinalized,
        canFinalize: report.permissions.canFinalize || adminOverrideForFinalized,
        inspectionTypeLabel: report.task.displayLabel ?? report.template.label,
        defaultInspectionTypeLabel: report.template.label,
        customInspectionTypeLabel: report.task.customDisplayLabel ?? null,
        siteName: report.inspection.site.name,
        customerName: report.inspection.customerCompany.name,
        scheduledDateLabel: format(report.inspection.scheduledStart, "MMM d, yyyy h:mm a"),
        template: report.template,
        draft: report.draft
      }}
    />
  );

  if (report.task.inspectionType === "wet_chemical_acceptance_test") {
    const model = buildAcceptanceTestViewModel({
      tenant: {
        name: report.inspection.tenant.name,
        branding: report.inspection.tenant.branding
      },
      customerCompany: report.inspection.customerCompany,
      site: report.inspection.site,
      inspection: report.inspection,
      task: {
        inspectionType: report.task.inspectionType
      },
      report: {
        id: report.id,
        finalizedAt: report.finalizedAt,
        technicianName: null,
        status: adminOverrideForFinalized ? "draft" : report.status,
        assignedTo: report.task.assignedTechnician?.name ?? report.inspection.assignedTechnician?.name ?? null
      },
      draft: report.draft,
      deficiencies: [],
      photos: [],
      technicianSignature: report.draft.signatures.technician ?? null,
      customerSignature: report.draft.signatures.customer ?? null
    });

    return <AcceptanceReportEditView model={model} editor={editor} />;
  }

  return editor;
}
