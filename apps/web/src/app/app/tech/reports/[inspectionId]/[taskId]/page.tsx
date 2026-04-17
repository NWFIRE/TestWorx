import { format } from "date-fns";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getInspectionDisplayLabels, getInspectionReportDraft, isDueAtTimeOfServiceCustomer } from "@testworx/lib/server/index";

import { ReportEditor } from "../../../report-editor";
import { buildAcceptanceTestViewModel } from "../../../../../reports/acceptance-test/buildAcceptanceTestViewModel";
import { AcceptanceReportEditView } from "../../../../../reports/acceptance-test/pages/AcceptanceReportEditView";

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
  const finalizedAtDate = report.finalizedAt ? new Date(report.finalizedAt) : null;
  const editor = (
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
        defaultInspectionTypeLabel: report.template.label,
        customInspectionTypeLabel: report.task.customDisplayLabel ?? null,
        siteName: inspectionDisplay.primaryTitle,
        customerName: inspectionDisplay.secondaryTitle || report.inspection.customerCompany.name,
        scheduledDateLabel: format(report.inspection.scheduledStart, "MMM d, yyyy h:mm a"),
        paymentCollectionNotice: isDueAtTimeOfServiceCustomer(report.inspection.customerCompany)
          ? "Payment due at time of service. Collect payment before leaving the site."
          : null,
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
        finalizedAt: finalizedAtDate,
        technicianName: null,
        status: report.status,
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
