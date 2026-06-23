import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  buildInspectionPacketDocuments,
  formatInspectionCloseoutRequestStatusLabel,
  formatInspectionCloseoutRequestTypeLabel,
  formatInspectionClassificationLabel,
  formatInspectionStatusLabel,
  formatInspectionTaskTypeLabel,
  allowsMultipleInspectionTasks,
  getAdminDashboardData,
  getAdminInspectionPdfAttachments,
  getDefaultInspectionRecurrenceFrequency,
  getInspectionClassificationTone,
  getInspectionDisplayLabels,
  getInspectionDocuments,
  getInspectionForEdit,
  getInspectionStatusTone,
  inspectionTypeRegistry,
  isDueAtTimeOfServiceCustomer
} from "@testworx/lib/server/index";

import { amendInspectionAction, deleteInspectionAction, regenerateCompletedReportPdfAction, reopenCompletedReportAction, updateInspectionAction, updateInspectionStatusAdminAction } from "../../actions";
import { AdminReportDeleteButton } from "../../admin-report-delete-button";
import { DeleteInspectionCard } from "../../delete-inspection-card";
import { InspectionExternalDocumentsCard } from "../../inspection-external-documents-card";
import { InspectionCloseoutRequestActions } from "../../inspection-closeout-request-actions";
import { InspectionPdfUploadCard } from "../../inspection-pdf-upload-card";
import { InspectionReportCorrectionsCard } from "../../inspection-report-corrections-card";
import { InspectionReportTypeManagement } from "../../inspection-report-type-management";
import { InspectionSchedulerForm } from "../../inspection-scheduler-form";
import { InspectionStatusUpdateCard } from "../../inspection-status-update-card";
import { PriorityBadge, StatusBadge } from "../../operations-ui";
import { InspectionPacketCard } from "../../../inspection-packet-card";
import { InspectionDetailTabs } from "./inspection-detail-tabs";

type InspectionType = Parameters<typeof getDefaultInspectionRecurrenceFrequency>[0];
type RecurrenceFrequency = ReturnType<typeof getDefaultInspectionRecurrenceFrequency>;
type SchedulingStatus =
  | "completed"
  | "due_now"
  | "scheduled_now"
  | "scheduled_future"
  | "not_scheduled"
  | "deferred";

const lifecycleBadgeStyles: Record<string, string> = {
  original: "bg-slate-100 text-slate-700",
  amended: "bg-amber-50 text-amber-800",
  replacement: "bg-blue-50 text-blue-800",
  superseded: "bg-rose-50 text-rose-800"
};

function formatLifecycleLabel(lifecycle: string) {
  switch (lifecycle) {
    case "replacement":
      return "Updated visit";
    case "superseded":
      return "Original visit";
    case "amended":
      return "Current visit";
    default:
      return "Original visit";
  }
}

function toDateTimeLocal(value: Date | null) {
  if (!value) {
    return "";
  }

  return format(value, "yyyy-MM-dd'T'HH:mm");
}

function inspectionTaskLabel(task: { inspectionType: string; customDisplayLabel?: string | null }) {
  return task.customDisplayLabel?.trim() || (task as { displayLabel?: string | null }).displayLabel?.trim() || formatInspectionTaskTypeLabel(task.inspectionType as InspectionType);
}

function resolveInspectionOrigin(value: string | undefined) {
  const candidate = (value ?? "").trim();
  if (!candidate.startsWith("/app/") || candidate.startsWith("/app/admin/inspections/")) {
    return "/app/admin/inspections";
  }

  return candidate;
}

function resolveInspectionMode(value: string | undefined) {
  return value === "review" ? "review" : "workspace";
}

function appendInspectionNotice(path: string, notice: string) {
  return `${path}${path.includes("?") ? "&" : "?"}inspection=${encodeURIComponent(notice)}`;
}

function sanitizePathSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
}

export default async function EditInspectionPage({
  params,
  searchParams
}: {
  params: Promise<{ inspectionId: string }>;
  searchParams?: Promise<{ from?: string; mode?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return null;
  }
  if (!["tenant_admin", "office_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const { inspectionId } = await params;
  const rawSearchParams = searchParams ? await searchParams : {};
  const originPath = resolveInspectionOrigin(typeof rawSearchParams.from === "string" ? rawSearchParams.from : undefined);
  const mode = resolveInspectionMode(typeof rawSearchParams.mode === "string" ? rawSearchParams.mode : undefined);
  const isReviewMode = mode === "review";
  const [dashboardData, inspection] = await Promise.all([
    getAdminDashboardData({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }),
    getInspectionForEdit({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, inspectionId)
  ]);

  if (!inspection) {
    redirect(appendInspectionNotice(originPath, "not-found"));
  }

  const [attachments, documents] = await Promise.all([
    getAdminInspectionPdfAttachments({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, inspectionId),
    getInspectionDocuments({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, inspectionId)
  ]);

  const inspectionView = inspection as unknown as typeof inspection & {
    site: { name: string };
    tasks: Array<{
      id: string;
      inspectionType: InspectionType;
      customDisplayLabel?: string | null;
      displayLabel?: string | null;
      addedByUserId: string | null;
      assignedTechnicianId?: string | null;
      dueMonth?: string | null;
      dueDate?: Date | null;
      schedulingStatus?: string | null;
      notes?: string | null;
      recurrence: { frequency: RecurrenceFrequency } | null;
      report: {
        id: string;
        status: string;
        autosaveVersion?: number;
        finalizedAt: Date | null;
        updatedAt: Date;
        correctionState: string;
        correctionReason: string | null;
        correctionRequestedAt: Date | null;
        correctionResolvedAt: Date | null;
        correctionRequestedBy: { id: string; name: string } | null;
        correctionResolvedBy: { id: string; name: string } | null;
        correctionEvents: Array<{
          id: string;
          actionType: string;
          reason: string | null;
          previousStatus: string | null;
          newStatus: string | null;
          createdAt: Date;
          actedBy: { id: string; name: string };
        }>;
        _count?: {
          attachments: number;
          signatures: number;
          deficiencies: number;
        };
      } | null;
    }>;
    hasStartedWork?: boolean;
    reportActivityCount?: number;
    lifecycle?: string;
    displayStatus?: string;
    assignedTechnicianNames?: string[];
    technicianAssignments?: Array<{ technicianId: string; technician?: { name: string } }>;
    deficiencyCount?: number;
    deficiencies?: Array<{ id: string; title: string; description: string; severity: string; status: string; section: string; location: string | null }>;
    auditTrail?: Array<{ id: string; action: string; createdAt: Date; metadata: Record<string, unknown> | null; actor?: { id: string; name: string } | null }>;
        originalAmendment?: {
      id: string;
      reason: string;
      type: string;
      createdAt: Date;
      inspection: { id: string; scheduledStart: Date; site: { name: string }; customerCompany: { name: string }; assignedTechnician: { name: string } | null };
    } | null;
    outgoingAmendment?: {
      id: string;
      reason: string;
      type: string;
      createdAt: Date;
      replacementInspection: { id: string; scheduledStart: Date; site: { name: string }; customerCompany: { name: string }; assignedTechnician: { name: string } | null };
    } | null;
    amendments?: Array<{ id: string; reason: string; type: string; createdAt: Date; replacementInspection: { id: string; scheduledStart: Date; site: { name: string }; customerCompany: { name: string }; assignedTechnician: { name: string } | null } }>;
    closeoutRequest?: {
      id: string;
      requestType: "new_inspection" | "follow_up_inspection";
      status: "pending" | "approved" | "dismissed";
      note: string;
      createdAt: Date;
      approvedAt: Date | null;
      dismissedAt: Date | null;
      requestedBy?: { id: string; name: string } | null;
      approvedBy?: { id: string; name: string } | null;
      dismissedBy?: { id: string; name: string } | null;
      createdInspection?: { id: string; site: { name: string }; customerCompany: { name: string } } | null;
    } | null;
    reviewSummary?: {
      totalTasks: number;
      finalizedTasks: number;
      missingReports: number;
      reportCompletionLabel: string;
      signaturesReady: boolean;
      pendingSignatureDocuments: number;
      documentCount: number;
      attachmentCount: number;
      deficiencyCount: number;
      readyForOfficeReview: boolean;
    };
  };
  const attachmentView = attachments as unknown as Array<{ id: string; fileName: string; source: "uploaded" | "generated"; customerVisible: boolean; createdAt: Date }>;
  const externalDocumentView = documents as unknown as Array<{
    id: string;
    fileName: string;
    label: string | null;
    requiresSignature: boolean;
    status: string;
    customerVisible: boolean;
    uploadedAt: Date;
    annotatedAt: Date | null;
    signedAt: Date | null;
    annotatedStorageKey: string | null;
    signedStorageKey: string | null;
  }>;
  const packetDocuments = buildInspectionPacketDocuments({
    reports: inspectionView.tasks
      .filter((task) => task.report?.id)
      .map((task) => ({
        id: task.report!.id,
        title: inspectionTaskLabel(task),
        happenedAt: task.report!.finalizedAt ?? task.report!.updatedAt ?? inspection.updatedAt,
        customerVisible: true,
        viewPath: `/app/admin/reports/${inspection.id}/${task.id}`
      })),
    attachments: attachmentView,
    inspectionDocuments: externalDocumentView.map((document) => ({
      ...document,
      uploadedAt: document.uploadedAt
    }))
  });
  type InspectionTask = typeof inspectionView.tasks[number];
  type CorrectionEvent = NonNullable<NonNullable<InspectionTask["report"]>["correctionEvents"]>[number];
  const inspectionDisplay = getInspectionDisplayLabels({
    siteName: inspectionView.site.name,
    customerName: inspectionView.customerCompany.name
  });
  const primaryTask = inspectionView.tasks[0] ?? null;
  const primaryReportHref = primaryTask ? `/app/admin/reports/${inspection.id}/${primaryTask.id}` : null;
  const primaryActionLabel = primaryTask
    ? primaryTask.report?.status === "finalized"
      ? "Open Report"
      : primaryTask.report
        ? "Continue Report"
        : "Start Report"
    : "No Reports";
  const technicianLabel = (inspectionView.assignedTechnicianNames ?? []).length
    ? (inspectionView.assignedTechnicianNames ?? []).join(", ")
    : "Shared queue";
  const inspectionTypeLabel = inspectionView.tasks.length
    ? inspectionView.tasks.map((task: InspectionTask) => inspectionTaskLabel(task)).join(", ")
    : "No report types";
  const statusLabel = formatInspectionStatusLabel((inspectionView.displayStatus ?? inspection.status) as Parameters<typeof formatInspectionStatusLabel>[0]);
  const statusTone = getInspectionStatusTone((inspectionView.displayStatus ?? inspection.status) as Parameters<typeof getInspectionStatusTone>[0]);
  return (
    <section className="space-y-5">
      <div className="rounded-[2rem] border border-[color:rgb(203_215_230_/_0.92)] bg-white p-6 shadow-panel">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label={statusLabel} tone={statusTone} />
              <StatusBadge
                label={formatInspectionClassificationLabel(inspection.inspectionClassification)}
                tone={getInspectionClassificationTone(inspection.inspectionClassification)}
              />
              {inspection.isPriority ? <PriorityBadge /> : null}
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${lifecycleBadgeStyles[inspectionView.lifecycle ?? "original"]}`}>
                {formatLifecycleLabel(inspectionView.lifecycle ?? "original")}
              </span>
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink">{inspectionDisplay.primaryTitle}</h2>
            <p className="mt-2 max-w-4xl text-base text-slate-600">
              {[inspectionTypeLabel, inspectionDisplay.secondaryTitle, format(inspection.scheduledStart, "MMM d, yyyy h:mm a"), technicianLabel].filter(Boolean).join(" · ")}
            </p>
          </div>
          {primaryReportHref ? (
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              href={primaryReportHref}
            >
              {primaryActionLabel}
            </Link>
          ) : (
            <button className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-slate-200 px-5 py-3 text-sm font-semibold text-slate-500" disabled type="button">
              {primaryActionLabel}
            </button>
          )}
        </div>
        {isDueAtTimeOfServiceCustomer(inspection.customerCompany) ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            Payment is due at time of service for this customer.
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {primaryReportHref ? (
          <Link className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slateblue shadow-sm transition hover:border-slate-300 hover:bg-slate-50" href={primaryReportHref}>
            Open report
          </Link>
        ) : null}
        <Link className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slateblue shadow-sm transition hover:border-slate-300 hover:bg-slate-50" href={`/app/admin/inspections/${inspection.id}?from=${encodeURIComponent(originPath)}#documents`}>
          Upload document
        </Link>
        <Link className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slateblue shadow-sm transition hover:border-slate-300 hover:bg-slate-50" href={`/app/admin/inspections/${inspection.id}?from=${encodeURIComponent(originPath)}#scheduling`}>
          Assign technician
        </Link>
        <Link className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slateblue shadow-sm transition hover:border-slate-300 hover:bg-slate-50" href={`/app/admin/inspections/${inspection.id}?from=${encodeURIComponent(originPath)}#scheduling`}>
          Change schedule
        </Link>
      </div>

      <InspectionDetailTabs
        overview={
          <div className="grid gap-5 lg:grid-cols-[1.4fr_0.9fr]">
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Status</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{statusLabel}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Assigned to</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{technicianLabel}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Due</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{format(inspection.scheduledStart, "MMM d, yyyy")}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Reports</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{inspectionView.tasks.length}</p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {inspectionView.tasks.map((task: InspectionTask) => (
                <div className="rounded-2xl border border-slate-200 p-4" key={task.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{inspectionTaskLabel(task)}</p>
                      <p className="mt-1 text-sm text-slate-500">{task.report?.status ? task.report.status.replaceAll("_", " ") : "Not started"}</p>
                    </div>
                    <Link className="text-sm font-semibold text-slateblue" href={`/app/admin/reports/${inspection.id}/${task.id}`}>
                      Open
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        }
        report={
          <div className="space-y-5">
            <div className="grid gap-3">
              {inspectionView.tasks.map((task: InspectionTask) => (
                <div key={task.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-base font-semibold text-ink">{inspectionTaskLabel(task)}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {task.report?.finalizedAt
                          ? `Finalized ${format(task.report.finalizedAt, "MMM d, yyyy h:mm a")}`
                          : task.report
                            ? `Current report status: ${task.report.status.replaceAll("_", " ")}`
                            : "No report started yet."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slateblue" href={`/app/admin/reports/${inspection.id}/${task.id}`}>
                        {task.report?.status === "finalized" ? "Open admin editor" : "Open report"}
                      </Link>
                      <AdminReportDeleteButton inspectionId={inspection.id} inspectionTaskId={task.id} taskLabel={inspectionTaskLabel(task)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {!isReviewMode ? (
              <details className="rounded-2xl border border-slate-200 p-5">
                <summary className="cursor-pointer text-base font-semibold text-slate-950">Admin tools</summary>
                <div className="mt-5 border-t border-slate-200 pt-5">
                  <InspectionReportCorrectionsCard
                    action={reopenCompletedReportAction}
                    inspectionId={inspection.id}
                    regenerateAction={regenerateCompletedReportPdfAction}
                    reports={inspectionView.tasks.map((task: InspectionTask) => ({
                      taskId: task.id,
                      inspectionType: task.inspectionType,
                      displayLabel: inspectionTaskLabel(task),
                      report: task.report ? {
                        id: task.report.id,
                        status: task.report.status,
                        finalizedAt: task.report.finalizedAt?.toISOString() ?? null,
                        correctionState: task.report.correctionState,
                        correctionReason: task.report.correctionReason,
                        correctionRequestedAt: task.report.correctionRequestedAt?.toISOString() ?? null,
                        correctionResolvedAt: task.report.correctionResolvedAt?.toISOString() ?? null,
                        correctionRequestedBy: task.report.correctionRequestedBy,
                        correctionResolvedBy: task.report.correctionResolvedBy,
                        correctionEvents: task.report.correctionEvents.map((event: CorrectionEvent) => ({
                          ...event,
                          createdAt: event.createdAt.toISOString()
                        }))
                      } : null
                    }))}
                  />
                </div>
              </details>
            ) : null}
          </div>
        }
        documents={
          <div className="space-y-5" id="documents">
            <InspectionPacketCard
              description="Generated reports, uploaded customer PDFs, and internal attachments for this inspection."
              documents={packetDocuments}
              emptyDescription="No generated reports, uploaded PDFs, or inspection attachments are available yet."
              emptyTitle="No documents yet"
              showCustomerVisibility
            />
            {!isReviewMode ? (
              <div className="grid gap-5 xl:grid-cols-2">
                <InspectionExternalDocumentsCard
                  documents={externalDocumentView.map((document) => ({
                    ...document,
                    uploadedAt: document.uploadedAt.toISOString(),
                    annotatedAt: document.annotatedAt?.toISOString() ?? null,
                    signedAt: document.signedAt?.toISOString() ?? null
                  }))}
                  inspectionId={inspection.id}
                  tenantStoragePrefix={sanitizePathSegment(session.user.tenantId)}
                />
                <InspectionPdfUploadCard attachments={attachmentView} inspectionId={inspection.id} tenantStoragePrefix={sanitizePathSegment(session.user.tenantId)} />
              </div>
            ) : null}
          </div>
        }
        scheduling={
          <div className="space-y-5" id="scheduling">
            <div className="rounded-2xl border border-slate-200 p-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <p className="text-sm text-slate-500">Status</p>
                  <p className="mt-1 font-semibold text-slate-950">{statusLabel}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Assigned to</p>
                  <p className="mt-1 font-semibold text-slate-950">{technicianLabel}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Scheduled</p>
                  <p className="mt-1 font-semibold text-slate-950">{format(inspection.scheduledStart, "MMM d, yyyy h:mm a")}</p>
                </div>
              </div>
            </div>
            {!isReviewMode ? (
              <details className="rounded-2xl border border-slate-200 p-5">
                <summary className="cursor-pointer text-base font-semibold text-slate-950">Admin tools</summary>
                <div className="mt-5 space-y-5 border-t border-slate-200 pt-5">
                  <InspectionStatusUpdateCard action={updateInspectionStatusAdminAction} currentStatus={inspection.status} inspectionId={inspection.id} key={`${inspection.id}:${inspection.status}:status`} />
                  <InspectionSchedulerForm
                    action={inspectionView.hasStartedWork ? amendInspectionAction : updateInspectionAction}
                    title="Edit visit"
                    submitLabel="Save changes"
                    banner={inspectionView.hasStartedWork ? `This visit already has ${inspectionView.reportActivityCount ?? 0} work marker${(inspectionView.reportActivityCount ?? 0) === 1 ? "" : "s"}. Saving here will create a new visit and leave the original visit unchanged.` : undefined}
                    workflowNote={inspectionView.hasStartedWork ? "The original visit and its report history stay intact. The new visit carries these updates forward for dispatch." : "Use this form for normal visit edits. Once field work begins, the system protects the original visit and creates a new one when needed."}
                    customers={dashboardData.customers}
                    sites={dashboardData.sites}
                    technicians={dashboardData.technicians}
                    protectedSaveMode={Boolean(inspectionView.hasStartedWork)}
                    initialValues={{
                      inspectionId: inspection.id,
                      customerCompanyId: inspection.customerCompanyId,
                      siteId: inspection.siteId,
                      inspectionClassification: inspection.inspectionClassification,
                      isPriority: inspection.isPriority,
                      inspectionMonth: format(inspection.scheduledStart, "yyyy-MM"),
                      scheduledStart: toDateTimeLocal(inspection.scheduledStart),
                      scheduledEnd: toDateTimeLocal(inspection.scheduledEnd),
                      status: inspection.status,
                      notes: inspection.notes ?? "",
                      tasks: inspectionView.tasks.map((task: InspectionTask) => ({
                        inspectionType: task.inspectionType,
                        frequency: task.recurrence?.frequency ?? getDefaultInspectionRecurrenceFrequency(task.inspectionType),
                        assignedTechnicianId: task.assignedTechnicianId ?? inspection.assignedTechnicianId ?? "",
                        dueMonth: task.dueMonth ?? format(inspection.scheduledStart, "yyyy-MM"),
                        dueDate: task.dueDate ? format(task.dueDate, "yyyy-MM-dd") : "",
                        schedulingStatus: (task.schedulingStatus as SchedulingStatus | null) ?? "scheduled_now",
                        notes: task.notes ?? ""
                      }))
                    }}
                  />
                  <InspectionReportTypeManagement
                    inspectionId={inspection.id}
                    reportTypes={Object.entries(inspectionTypeRegistry).map(([value, definition]) => ({
                      canAddMultiple: allowsMultipleInspectionTasks(value as InspectionType),
                      value,
                      label: definition.label
                    }))}
                    tasks={inspectionView.tasks.map((task: InspectionTask) => {
                      const hasReportActivity = Boolean(task.report && ((task.report.autosaveVersion ?? 1) > 1 || task.report.status === "finalized" || task.report.correctionEvents.length > 0 || task.report.finalizedAt || task.report.correctionRequestedAt || task.report.correctionResolvedAt || (task.report._count?.attachments ?? 0) > 0 || (task.report._count?.signatures ?? 0) > 0 || (task.report._count?.deficiencies ?? 0) > 0));
                      return {
                        id: task.id,
                        inspectionType: task.inspectionType,
                        label: inspectionTaskLabel(task),
                        assignedTechnicianName: task.assignedTechnicianId ? dashboardData.technicians.find((technician) => technician.id === task.assignedTechnicianId)?.name ?? "Assigned" : "Unassigned",
                        dueLabel: task.dueDate ? format(task.dueDate, "MMM d, yyyy") : task.dueMonth ?? "Not recorded",
                        taskStatus: task.status,
                        reportStatus: task.report?.status === "finalized" ? "Finalized" : task.report?.status === "submitted" ? "Ready for Review" : "Draft",
                        schedulingStatus: task.schedulingStatus ?? "scheduled_now",
                        isAddedTask: Boolean(task.addedByUserId),
                        hasReportActivity,
                        isFinalized: task.report?.status === "finalized"
                      };
                    })}
                    variant="embedded"
                  />
                </div>
              </details>
            ) : null}
          </div>
        }
        activity={
          <div className="space-y-5">
            {inspectionView.closeoutRequest ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-blue-950">{formatInspectionCloseoutRequestTypeLabel(inspectionView.closeoutRequest.requestType)}</p>
                  <StatusBadge label={formatInspectionCloseoutRequestStatusLabel(inspectionView.closeoutRequest.status)} tone={inspectionView.closeoutRequest.status === "approved" ? "emerald" : inspectionView.closeoutRequest.status === "dismissed" ? "slate" : "blue"} />
                </div>
                <p className="mt-2 text-sm text-blue-900">{inspectionView.closeoutRequest.note}</p>
                <p className="mt-2 text-xs text-blue-800">Requested by {inspectionView.closeoutRequest.requestedBy?.name ?? "Technician"} on {format(inspectionView.closeoutRequest.createdAt, "MMM d, yyyy h:mm a")}</p>
                {inspectionView.closeoutRequest.status === "pending" ? <div className="mt-4"><InspectionCloseoutRequestActions inspectionId={inspection.id} canApprove /></div> : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 p-5">
                <p className="text-base font-semibold text-slate-950">No pending activity</p>
                <p className="mt-1 text-sm text-slate-500">Status changes, correction requests, and technician next-step requests will appear here when action is needed.</p>
              </div>
            )}
            {!isReviewMode ? (
              <details className="rounded-2xl border border-rose-100 p-5">
                <summary className="cursor-pointer text-base font-semibold text-rose-700">Danger zone</summary>
                <div className="mt-5 border-t border-rose-100 pt-5">
                  <DeleteInspectionCard action={deleteInspectionAction} inspectionId={inspection.id} redirectTo={originPath} />
                </div>
              </details>
            ) : null}
          </div>
        }
      />
    </section>
  );
}
