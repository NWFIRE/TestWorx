import { format } from "date-fns";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getInspectionDisplayLabels, getInspectionReportDraft, getWorkOrderCatalogItems, getWorkOrderLineItems, isDueAtTimeOfServiceCustomer } from "@testworx/lib/server/index";

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
      /(completed|closed) inspections are no longer available in the technician app|future visit.*not available in the technician app yet/i.test(error.message)
    ) {
      redirect("/app/tech/inspections?report=unavailable");
    }

    throw error;
  }

  if (!report) {
    notFound();
  }

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
  const [workOrderCatalogItems, workOrderLineItems] = isWorkOrderReport
    ? await Promise.all([
        getWorkOrderCatalogItems({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, inspectionId),
        getWorkOrderLineItems({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, inspectionId)
      ])
    : [[], []];

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
    serviceAddress: inspectionDisplay.locationLabel,
    customerContactName: report.inspection.customerCompany.contactName ?? null,
    customerPhone: report.inspection.customerCompany.phone ?? null,
    customerEmail: report.inspection.customerCompany.billingEmail ?? null,
    scheduledDateLabel: format(report.inspection.scheduledStart, "MMM d, yyyy h:mm a"),
    isPriority: report.inspection.isPriority,
    inspectionWorkspace: {
      inspectionId,
      totalTaskCount: report.relatedTasks.length,
      currentTaskIndex: report.relatedTasks.find((task) => task.isCurrent)?.currentTaskIndex ?? 1,
      relatedTasks: report.relatedTasks.map((task) => ({
        id: task.id,
        displayLabel: task.displayLabel,
        reportStatus: task.reportStatus,
        schedulingStatus: task.schedulingStatus,
        isAvailableInTechnicianApp: task.isAvailableInTechnicianApp,
        unavailableReason: task.unavailableReason,
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
    workOrderCatalogItems,
    workOrderLineItems,
    template: report.template,
    draft: report.draft
  };

  return {
    report,
    data
  };
}
