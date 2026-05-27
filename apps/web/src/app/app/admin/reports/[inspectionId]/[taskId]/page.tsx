import { format } from "date-fns";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getInspectionDisplayLabels, getInspectionReportDraft, getWorkOrderCatalogItems, getWorkOrderLaborTypes, getWorkOrderLineItems, isDueAtTimeOfServiceCustomer } from "@testworx/lib/server/index";

import { MobileSmartReportScreen } from "../../../../tech/mobile-smart-report-screen";
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
  const finalizedAtDate = report.finalizedAt ? new Date(report.finalizedAt) : null;
  const inspectionDisplay = getInspectionDisplayLabels({
    siteName: report.inspection.site.name,
    customerName: report.inspection.customerCompany.name,
    siteAddressLine1: report.inspection.site.addressLine1,
    siteAddressLine2: report.inspection.site.addressLine2,
    siteCity: report.inspection.site.city,
    siteState: report.inspection.site.state,
    sitePostalCode: report.inspection.site.postalCode,
    customerServiceAddressLine1: report.inspection.customerCompany.serviceAddressLine1,
    customerServiceAddressLine2: report.inspection.customerCompany.serviceAddressLine2,
    customerServiceCity: report.inspection.customerCompany.serviceCity,
    customerServiceState: report.inspection.customerCompany.serviceState,
    customerServicePostalCode: report.inspection.customerCompany.servicePostalCode,
    customerBillingAddressLine1: report.inspection.customerCompany.billingAddressLine1,
    customerBillingAddressLine2: report.inspection.customerCompany.billingAddressLine2,
    customerBillingCity: report.inspection.customerCompany.billingCity,
    customerBillingState: report.inspection.customerCompany.billingState,
    customerBillingPostalCode: report.inspection.customerCompany.billingPostalCode
  });
  const isWorkOrderReport = report.task.inspectionType === "work_order";
  const [workOrderCatalogItems, workOrderLineItems, workOrderLaborTypes] = isWorkOrderReport
    ? await Promise.all([
        getWorkOrderCatalogItems({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, inspectionId),
        getWorkOrderLineItems({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, inspectionId),
        getWorkOrderLaborTypes({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, inspectionId)
      ])
    : [[], [], []];
  const editorData = {
    reportId: report.id,
    reportStatus: adminOverrideForFinalized ? "draft" as const : report.status,
    reportUpdatedAt: report.updatedAt,
    finalizedAt: report.finalizedAt,
    correctionNotice,
    canEdit: report.permissions.canEdit || adminOverrideForFinalized,
    canFinalize: report.permissions.canFinalize || adminOverrideForFinalized,
    inspectionTypeLabel: report.task.displayLabel ?? report.template.label,
    defaultInspectionTypeLabel: report.template.label,
    customInspectionTypeLabel: report.task.customDisplayLabel ?? null,
    siteName: inspectionDisplay.primaryTitle,
    customerName: inspectionDisplay.secondaryTitle || report.inspection.customerCompany.name,
    serviceAddress: inspectionDisplay.locationLabel,
    customerContactName: report.inspection.customerCompany.contactName ?? null,
    customerPhone: report.inspection.customerCompany.phone ?? null,
    customerEmail: report.inspection.customerCompany.billingEmail ?? null,
    scheduledDateLabel: format(report.inspection.scheduledStart, "MMM d, yyyy h:mm a"),
    isPriority: report.inspection.isPriority,
    inspectionWorkspace: {
      inspectionId,
      totalTaskCount: 1,
      currentTaskIndex: 1,
      relatedTasks: [
        {
          id: taskId,
          displayLabel: report.task.displayLabel ?? report.template.label,
          reportStatus: adminOverrideForFinalized ? "draft" as const : report.status,
          isCurrent: true
        }
      ]
    },
    dispatchNotes: report.inspection.notes,
    paymentCollectionNotice: isDueAtTimeOfServiceCustomer(report.inspection.customerCompany)
      ? "Payment due at time of service. Collect payment before leaving the site."
      : null,
    workOrderCatalogItems,
    workOrderLineItems,
    workOrderLaborTypes,
    template: report.template,
    draft: report.draft
  };
  const editor = (
    <MobileSmartReportScreen data={editorData} inspectionId={inspectionId} mode="edit" taskId={taskId} />
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
