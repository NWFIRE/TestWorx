import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  buildInspectionPacketDocuments,
  editableInspectionStatuses,
  formatInspectionClassificationLabel,
  formatInspectionStatusLabel,
  formatInspectionTaskTypeLabel,
  getAdminDashboardData,
  getAdminInspectionPdfAttachments,
  getDefaultInspectionRecurrenceFrequency,
  getInspectionClassificationTone,
  getInspectionDisplayLabels,
  getInspectionDocuments,
  getInspectionForEdit,
  getInspectionPriorityTone,
  getInspectionStatusTone,
  isDueAtTimeOfServiceCustomer
} from "@testworx/lib";

import { amendInspectionAction, deleteInspectionAction, reopenCompletedReportAction, updateInspectionAction, updateInspectionStatusAdminAction, uploadInspectionExternalDocumentAction, uploadInspectionPdfAction } from "../../actions";
import { DeleteInspectionCard } from "../../delete-inspection-card";
import { InspectionExternalDocumentsCard } from "../../inspection-external-documents-card";
import { InspectionPdfUploadCard } from "../../inspection-pdf-upload-card";
import { InspectionReportCorrectionsCard } from "../../inspection-report-corrections-card";
import { InspectionSchedulerForm } from "../../inspection-scheduler-form";
import { InspectionStatusUpdateCard } from "../../inspection-status-update-card";
import { StatusBadge } from "../../operations-ui";
import { RemoveReportTypeButton } from "../../../tech/remove-report-type-button";
import { InspectionPacketCard } from "../../../inspection-packet-card";

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
  return lifecycle.replaceAll("_", " ");
}

function formatAuditAction(action: string) {
  return action.replaceAll(".", " ").replaceAll("_", " ");
}

function asMetadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toDateTimeLocal(value: Date | null) {
  if (!value) {
    return "";
  }

  return format(value, "yyyy-MM-dd'T'HH:mm");
}

function formatStatusFromAuditValue(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  if (!editableInspectionStatuses.includes(value as (typeof editableInspectionStatuses)[number]) && value !== "past_due") {
    return null;
  }

  return formatInspectionStatusLabel(value as Parameters<typeof formatInspectionStatusLabel>[0]);
}

function resolveInspectionOrigin(value: string | undefined) {
  const candidate = (value ?? "").trim();
  if (!candidate.startsWith("/app/") || candidate.startsWith("/app/admin/inspections/")) {
    return "/app/admin";
  }

  return candidate;
}

export default async function EditInspectionPage({
  params,
  searchParams
}: {
  params: Promise<{ inspectionId: string }>;
  searchParams?: Promise<{ from?: string }>;
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
  const [dashboardData, inspection] = await Promise.all([
    getAdminDashboardData({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }),
    getInspectionForEdit({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, inspectionId)
  ]);

  if (!inspection) {
    redirect("/app/admin");
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
        finalizedAt: Date | null;
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
    attachments: attachmentView,
    inspectionDocuments: externalDocumentView.map((document) => ({
      ...document,
      uploadedAt: document.uploadedAt
    }))
  });
  type InspectionTask = typeof inspectionView.tasks[number];
  type CorrectionEvent = NonNullable<NonNullable<InspectionTask["report"]>["correctionEvents"]>[number];
  type AuditTrailEntry = { id: string; action: string; createdAt: Date; metadata: unknown; actor?: { id: string; name: string } | null };
  type InspectionDeficiency = NonNullable<typeof inspectionView.deficiencies>[number];
  const auditTrailEntries = (inspectionView.auditTrail ?? []) as AuditTrailEntry[];
  const inspectionDisplay = getInspectionDisplayLabels({
    siteName: inspectionView.site.name,
    customerName: inspectionView.customerCompany.name
  });
  const originalInspectionDisplay = inspectionView.originalAmendment
    ? getInspectionDisplayLabels({
        siteName: inspectionView.originalAmendment.inspection.site.name,
        customerName: inspectionView.originalAmendment.inspection.customerCompany.name
      })
    : null;
  const replacementInspectionDisplay = inspectionView.outgoingAmendment
    ? getInspectionDisplayLabels({
        siteName: inspectionView.outgoingAmendment.replacementInspection.site.name,
        customerName: inspectionView.outgoingAmendment.replacementInspection.customerCompany.name
      })
    : null;
  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Inspection editor</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-3xl font-semibold text-ink">{inspectionDisplay.primaryTitle}</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${lifecycleBadgeStyles[inspectionView.lifecycle ?? "original"]}`}>
            {formatLifecycleLabel(inspectionView.lifecycle ?? "original")}
          </span>
          <Link className="inline-flex rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slateblue" href="/app/admin/amendments">
            Amendment center
          </Link>
        </div>
        <p className="mt-3 text-slate-500">
          {inspectionDisplay.secondaryTitle ? `${inspectionDisplay.secondaryTitle} | ` : ""}
          Adjust assignment, status, recurrence mix, scheduling details, and customer-facing PDF delivery for this visit.
        </p>
        {inspectionView.hasStartedWork ? <p className="mt-3 text-sm text-amber-700">Started work is protected. Changes here create an audited follow-up visit instead of rewriting history.</p> : null}
        {isDueAtTimeOfServiceCustomer(inspection.customerCompany) ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold uppercase tracking-[0.16em]">Payment due at time of service</p>
            <p className="mt-2">Technicians should collect payment on site for this customer and confirm collection before closing the visit.</p>
          </div>
        ) : null}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Visit relationship</p>
            {inspectionView.originalAmendment ? (
              <>
                <p className="mt-2 text-sm text-slate-700">This is a replacement visit created from an earlier inspection.</p>
                <Link className="mt-3 inline-flex text-sm font-semibold text-slateblue" href={`/app/admin/inspections/${inspectionView.originalAmendment.inspection.id}?from=${encodeURIComponent(originPath)}`}>
                  View original inspection
                </Link>
              </>
            ) : inspectionView.outgoingAmendment ? (
              <>
                <p className="mt-2 text-sm text-slate-700">This visit has been superseded by an amended follow-up visit.</p>
                <Link className="mt-3 inline-flex text-sm font-semibold text-slateblue" href={`/app/admin/inspections/${inspectionView.outgoingAmendment.replacementInspection.id}?from=${encodeURIComponent(originPath)}`}>
                  View replacement inspection
                </Link>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-700">This inspection is currently the active original visit.</p>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Amendment reason</p>
            <p className="mt-2 text-sm text-slate-700">
              {inspectionView.originalAmendment?.reason ?? inspectionView.outgoingAmendment?.reason ?? "No amendment reason recorded for this inspection yet."}
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Deficiencies found</p>
              <p className="mt-2 text-sm text-slate-700">{inspectionView.deficiencyCount ?? 0} persisted deficiency record{(inspectionView.deficiencyCount ?? 0) === 1 ? "" : "s"} linked to this inspection.</p>
            </div>
            <Link className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href="/app/deficiencies">
              Open deficiency center
            </Link>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StatusBadge
            label={formatInspectionClassificationLabel(inspection.inspectionClassification)}
            tone={getInspectionClassificationTone(inspection.inspectionClassification)}
          />
          {inspection.isPriority ? (
            <StatusBadge
              label="Priority"
              tone={getInspectionPriorityTone(true)}
            />
          ) : null}
          <StatusBadge
            label={formatInspectionStatusLabel((inspectionView.displayStatus ?? inspection.status) as Parameters<typeof formatInspectionStatusLabel>[0])}
            tone={getInspectionStatusTone((inspectionView.displayStatus ?? inspection.status) as Parameters<typeof getInspectionStatusTone>[0])}
          />
          <p className="text-sm text-slate-500">
            Current inspection status for scheduling, review, billing, and follow-up queues.
          </p>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <InspectionSchedulerForm
          action={inspectionView.hasStartedWork ? amendInspectionAction : updateInspectionAction}
          title={inspectionView.hasStartedWork ? "Create amended follow-up visit" : "Edit inspection"}
          submitLabel={inspectionView.hasStartedWork ? "Create amended visit" : "Save changes"}
          banner={inspectionView.hasStartedWork ? `This inspection already has ${inspectionView.reportActivityCount ?? 0} report activity markers. Saving here will create a new scheduled follow-up visit and preserve the existing inspection exactly as-is.` : undefined}
          workflowNote={inspectionView.hasStartedWork
            ? "The original visit and its report history stay intact. The new replacement visit becomes the schedulable follow-up for dispatch."
            : "Use this form for normal schedule edits. Once field work begins, the workflow switches to an audited amendment instead of rewriting the original visit."}
          reasonLabel={inspectionView.hasStartedWork ? "Amendment reason" : undefined}
          reasonRequired={Boolean(inspectionView.hasStartedWork)}
          customers={dashboardData.customers}
          sites={dashboardData.sites}
          technicians={dashboardData.technicians}
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
        <div className="space-y-6">
          <InspectionPacketCard
            description={
              inspection.status === "completed" || inspection.status === "invoiced" || inspection.status === "follow_up_required"
                ? "Access every PDF tied to this completed visit from one inspection packet view."
                : "This packet becomes the primary PDF handoff area once the visit is completed and documents are available."
            }
            documents={packetDocuments}
            emptyDescription={
              inspection.status === "completed" || inspection.status === "invoiced" || inspection.status === "follow_up_required"
                ? "No PDFs are attached to this completed inspection yet."
                : "This inspection is not completed yet, so the packet is not ready."
            }
            emptyTitle={
              inspection.status === "completed" || inspection.status === "invoiced" || inspection.status === "follow_up_required"
                ? "No inspection packet documents yet"
                : "Inspection packet not ready"
            }
            showCustomerVisibility
          />
          <InspectionStatusUpdateCard
            action={updateInspectionStatusAdminAction}
            currentStatus={inspection.status}
            inspectionId={inspection.id}
            key={`${inspection.id}:${inspection.status}`}
          />
          <div className="rounded-[2rem] bg-white p-6 shadow-panel">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Lifecycle timeline</p>
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current visit</p>
                <p className="mt-2 text-sm font-semibold text-ink">{inspectionDisplay.primaryTitle}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {inspectionDisplay.secondaryTitle ? `${inspectionDisplay.secondaryTitle} | ` : ""}{format(inspectionView.scheduledStart, "MMM d, yyyy h:mm a")}
                </p>
                <p className="mt-1 text-sm text-slate-500">Technicians: {(inspectionView.assignedTechnicianNames ?? []).length ? (inspectionView.assignedTechnicianNames ?? []).join(", ") : "Unassigned"}</p>
              </div>
              {inspectionView.originalAmendment ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-800">Replaces original visit</p>
                  <p className="mt-2 text-sm text-blue-900">{inspectionView.originalAmendment.reason}</p>
                  <p className="mt-2 text-sm text-blue-800">
                    {originalInspectionDisplay?.primaryTitle} {originalInspectionDisplay?.secondaryTitle ? `| ${originalInspectionDisplay.secondaryTitle}` : ""} on {format(inspectionView.originalAmendment.inspection.scheduledStart, "MMM d, yyyy h:mm a")}
                  </p>
                  <Link className="mt-3 inline-flex text-sm font-semibold text-slateblue" href={`/app/admin/inspections/${inspectionView.originalAmendment.inspection.id}?from=${encodeURIComponent(originPath)}`}>
                    Open original visit
                  </Link>
                </div>
              ) : null}
              {inspectionView.outgoingAmendment ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-900">Superseded by replacement visit</p>
                  <p className="mt-2 text-sm text-amber-900">{inspectionView.outgoingAmendment.reason}</p>
                  <p className="mt-2 text-sm text-amber-800">
                    {replacementInspectionDisplay?.primaryTitle} {replacementInspectionDisplay?.secondaryTitle ? `| ${replacementInspectionDisplay.secondaryTitle}` : ""} on {format(inspectionView.outgoingAmendment.replacementInspection.scheduledStart, "MMM d, yyyy h:mm a")}
                  </p>
                  <Link className="mt-3 inline-flex text-sm font-semibold text-slateblue" href={`/app/admin/inspections/${inspectionView.outgoingAmendment.replacementInspection.id}?from=${encodeURIComponent(originPath)}`}>
                    Open replacement visit
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
          <InspectionExternalDocumentsCard
            action={uploadInspectionExternalDocumentAction}
            documents={externalDocumentView.map((document) => ({
              ...document,
              uploadedAt: document.uploadedAt.toISOString(),
              annotatedAt: document.annotatedAt?.toISOString() ?? null,
              signedAt: document.signedAt?.toISOString() ?? null
            }))}
            inspectionId={inspection.id}
          />
          <InspectionReportCorrectionsCard
            action={reopenCompletedReportAction}
            inspectionId={inspection.id}
            reports={inspectionView.tasks.map((task: InspectionTask) => ({
              taskId: task.id,
              inspectionType: task.inspectionType,
              displayLabel: formatInspectionTaskTypeLabel(task.inspectionType),
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
          <div className="rounded-[2rem] bg-white p-6 shadow-panel">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Report type management</p>
            <div className="mt-4 space-y-3">
              {inspectionView.tasks.length ? inspectionView.tasks.map((task: InspectionTask) => {
                const isAddedTask = Boolean(task.addedByUserId);
                const hasReportActivity = Boolean(
                  task.report && (
                    task.report.status === "finalized" ||
                    task.report.correctionEvents.length > 0 ||
                    task.report.finalizedAt ||
                    task.report.correctionRequestedAt ||
                    task.report.correctionResolvedAt
                  )
                );

                return (
                  <div key={task.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-ink">{formatInspectionTaskTypeLabel(task.inspectionType)}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {isAddedTask
                            ? "Added after the original inspection was scheduled."
                            : "Original scheduled report type."}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Assigned technician: {task.assignedTechnicianId ? dashboardData.technicians.find((technician) => technician.id === task.assignedTechnicianId)?.name ?? "Assigned" : "Unassigned"}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Due: {task.dueDate ? format(task.dueDate, "MMM d, yyyy") : task.dueMonth ?? "Not recorded"} | Status: {String(task.schedulingStatus ?? "scheduled_now").replaceAll("_", " ")}
                        </p>
                        {hasReportActivity ? <p className="mt-1 text-sm text-amber-700">This report type already has report activity and cannot be removed.</p> : null}
                      </div>
                      <RemoveReportTypeButton
                        inspectionId={inspection.id}
                        inspectionTaskId={task.id}
                        taskLabel={formatInspectionTaskTypeLabel(task.inspectionType)}
                      />
                    </div>
                  </div>
                );
              }) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-700">No report types on this inspection.</p>
                  <p className="mt-1 text-sm text-slate-500">Report types will appear here when they are attached to the visit.</p>
                </div>
              )}
            </div>
          </div>
          <InspectionPdfUploadCard action={uploadInspectionPdfAction} attachments={attachmentView} inspectionId={inspection.id} />
          <DeleteInspectionCard action={deleteInspectionAction} inspectionId={inspection.id} redirectTo={originPath} />
          <div className="rounded-[2rem] bg-white p-6 shadow-panel">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Audit trail</p>
            <div className="mt-4 space-y-3">
              {auditTrailEntries.length ? auditTrailEntries.map((entry) => {
                const metadata = asMetadataRecord(entry.metadata);
                return (
                <div key={entry.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{formatAuditAction(entry.action)}</p>
                    <p className="text-xs text-slate-400">{format(entry.createdAt, "MMM d, yyyy h:mm a")}</p>
                  </div>
                  {entry.actor?.name ? <p className="mt-2 text-sm text-slate-700">By {entry.actor.name}</p> : null}
                  {metadata && "previousStatus" in metadata && "nextStatus" in metadata && formatStatusFromAuditValue(metadata.previousStatus) && formatStatusFromAuditValue(metadata.nextStatus) ? (
                    <p className="mt-2 text-sm text-slate-700">
                      Status changed from {formatStatusFromAuditValue(metadata.previousStatus)} to {formatStatusFromAuditValue(metadata.nextStatus)}.
                    </p>
                  ) : null}
                  {metadata && "previousClassification" in metadata && "nextClassification" in metadata ? (
                    <p className="mt-2 text-sm text-slate-700">
                      Inspection classification changed from {formatInspectionClassificationLabel(String(metadata.previousClassification) as Parameters<typeof formatInspectionClassificationLabel>[0])} to {formatInspectionClassificationLabel(String(metadata.nextClassification) as Parameters<typeof formatInspectionClassificationLabel>[0])}.
                    </p>
                  ) : null}
                  {entry.action === "inspection.classification_set" && metadata && "inspectionClassification" in metadata ? (
                    <p className="mt-2 text-sm text-slate-700">
                      Inspection classification set to {formatInspectionClassificationLabel(String(metadata.inspectionClassification) as Parameters<typeof formatInspectionClassificationLabel>[0])}.
                    </p>
                  ) : null}
                  {metadata && "previousPriority" in metadata && "nextPriority" in metadata ? (
                    <p className="mt-2 text-sm text-slate-700">
                      Priority changed from {Boolean(metadata.previousPriority) ? "On" : "Off"} to {Boolean(metadata.nextPriority) ? "On" : "Off"}.
                    </p>
                  ) : null}
                  {entry.action === "inspection.priority_enabled" ? (
                    <p className="mt-2 text-sm text-slate-700">Priority enabled for this inspection.</p>
                  ) : null}
                  {metadata && "reason" in metadata ? <p className="mt-2 text-sm text-slate-700">{String(metadata.reason ?? "")}</p> : null}
                  {metadata && "note" in metadata && String(metadata.note ?? "").trim() ? <p className="mt-2 text-sm text-slate-700">{String(metadata.note ?? "")}</p> : null}
                  {metadata && "replacementInspectionId" in metadata ? (
                    <p className="mt-2 text-sm text-slate-500">Replacement visit id: {String(metadata.replacementInspectionId ?? "")}</p>
                  ) : null}
                  {metadata && "amendmentType" in metadata ? (
                    <p className="mt-1 text-sm text-slate-500">Type: {String(metadata.amendmentType ?? "").replaceAll("_", " ")}</p>
                  ) : null}
                </div>
              );}) : <p className="text-sm text-slate-500">No audit entries are recorded for this inspection yet.</p>}
            </div>
          </div>
          <div className="rounded-[2rem] bg-white p-6 shadow-panel">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Deficiency records</p>
            <div className="mt-4 space-y-3">
              {(inspectionView.deficiencies ?? []).length ? (inspectionView.deficiencies ?? []).map((deficiency: InspectionDeficiency) => (
                <div key={deficiency.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{deficiency.title}</p>
                    <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">{deficiency.severity}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">{deficiency.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{deficiency.description}</p>
                  <p className="mt-2 text-xs text-slate-400">{String((deficiency as { section?: string }).section ?? "manual").replaceAll("-", " ")}{(deficiency as { location?: string | null }).location ? ` | ${(deficiency as { location?: string | null }).location}` : ""}</p>
                </div>
              )) : <p className="text-sm text-slate-500">No persisted deficiencies are linked to this inspection yet.</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
