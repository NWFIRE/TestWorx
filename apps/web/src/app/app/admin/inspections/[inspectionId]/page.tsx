import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  getAdminDashboardData,
  getAdminInspectionPdfAttachments,
  getDefaultInspectionRecurrenceFrequency,
  getInspectionDocuments,
  getInspectionForEdit
} from "@testworx/lib";

import { amendInspectionAction, reopenCompletedReportAction, updateInspectionAction, uploadInspectionExternalDocumentAction, uploadInspectionPdfAction } from "../../actions";
import { InspectionExternalDocumentsCard } from "../../inspection-external-documents-card";
import { InspectionPdfUploadCard } from "../../inspection-pdf-upload-card";
import { InspectionReportCorrectionsCard } from "../../inspection-report-corrections-card";
import { InspectionSchedulerForm } from "../../inspection-scheduler-form";

type InspectionType = Parameters<typeof getDefaultInspectionRecurrenceFrequency>[0];
type RecurrenceFrequency = ReturnType<typeof getDefaultInspectionRecurrenceFrequency>;

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

export default async function EditInspectionPage({ params }: { params: Promise<{ inspectionId: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return null;
  }
  if (!["tenant_admin", "office_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const { inspectionId } = await params;
  const [dashboardData, inspection, attachments, documents] = await Promise.all([
    getAdminDashboardData({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }),
    getInspectionForEdit({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, inspectionId),
    getAdminInspectionPdfAttachments({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, inspectionId),
    getInspectionDocuments({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, inspectionId)
  ]);

  if (!inspection) {
    redirect("/app/admin");
  }

  const inspectionView = inspection as unknown as typeof inspection & {
    site: { name: string };
    tasks: Array<{
      id: string;
      inspectionType: InspectionType;
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
    auditTrail?: Array<{ id: string; action: string; createdAt: Date; metadata: Record<string, unknown> | null }>;
    originalAmendment?: {
      id: string;
      reason: string;
      type: string;
      createdAt: Date;
      inspection: { id: string; scheduledStart: Date; site: { name: string }; assignedTechnician: { name: string } | null };
    } | null;
    outgoingAmendment?: {
      id: string;
      reason: string;
      type: string;
      createdAt: Date;
      replacementInspection: { id: string; scheduledStart: Date; site: { name: string }; assignedTechnician: { name: string } | null };
    } | null;
    amendments?: Array<{ id: string; reason: string; type: string; createdAt: Date; replacementInspection: { id: string; scheduledStart: Date; site: { name: string }; assignedTechnician: { name: string } | null } }>;
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
    signedAt: Date | null;
    signedStorageKey: string | null;
  }>;
  type TechnicianAssignment = NonNullable<typeof inspectionView.technicianAssignments>[number];
  type InspectionTask = typeof inspectionView.tasks[number];
  type CorrectionEvent = NonNullable<NonNullable<InspectionTask["report"]>["correctionEvents"]>[number];

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Inspection editor</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-3xl font-semibold text-ink">{inspectionView.site.name}</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${lifecycleBadgeStyles[inspectionView.lifecycle ?? "original"]}`}>
            {formatLifecycleLabel(inspectionView.lifecycle ?? "original")}
          </span>
          <Link className="inline-flex rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slateblue" href="/app/admin/amendments">
            Amendment center
          </Link>
        </div>
        <p className="mt-3 text-slate-500">Adjust assignment, status, recurrence mix, scheduling details, and customer-facing PDF delivery for this visit.</p>
        {inspectionView.hasStartedWork ? <p className="mt-3 text-sm text-amber-700">Started work is protected. Changes here create an audited follow-up visit instead of rewriting history.</p> : null}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Visit relationship</p>
            {inspectionView.originalAmendment ? (
              <>
                <p className="mt-2 text-sm text-slate-700">This is a replacement visit created from an earlier inspection.</p>
                <Link className="mt-3 inline-flex text-sm font-semibold text-slateblue" href={`/app/admin/inspections/${inspectionView.originalAmendment.inspection.id}`}>
                  View original inspection
                </Link>
              </>
            ) : inspectionView.outgoingAmendment ? (
              <>
                <p className="mt-2 text-sm text-slate-700">This visit has been superseded by an amended follow-up visit.</p>
                <Link className="mt-3 inline-flex text-sm font-semibold text-slateblue" href={`/app/admin/inspections/${inspectionView.outgoingAmendment.replacementInspection.id}`}>
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
            inspectionMonth: format(inspection.scheduledStart, "yyyy-MM"),
            scheduledStart: toDateTimeLocal(inspection.scheduledStart),
            scheduledEnd: toDateTimeLocal(inspection.scheduledEnd),
            assignedTechnicianIds: inspectionView.technicianAssignments?.map((assignment: TechnicianAssignment) => assignment.technicianId) ?? (inspection.assignedTechnicianId ? [inspection.assignedTechnicianId] : []),
            status: inspection.status,
            notes: inspection.notes ?? "",
            tasks: inspectionView.tasks.map((task: InspectionTask) => ({ inspectionType: task.inspectionType, frequency: task.recurrence?.frequency ?? getDefaultInspectionRecurrenceFrequency(task.inspectionType) }))
          }}
        />
        <div className="space-y-6">
          <div className="rounded-[2rem] bg-white p-6 shadow-panel">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Lifecycle timeline</p>
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current visit</p>
                <p className="mt-2 text-sm font-semibold text-ink">{inspectionView.site.name}</p>
                <p className="mt-1 text-sm text-slate-500">{format(inspectionView.scheduledStart, "MMM d, yyyy h:mm a")}</p>
                <p className="mt-1 text-sm text-slate-500">Technicians: {(inspectionView.assignedTechnicianNames ?? []).length ? (inspectionView.assignedTechnicianNames ?? []).join(", ") : "Unassigned"}</p>
              </div>
              {inspectionView.originalAmendment ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-800">Replaces original visit</p>
                  <p className="mt-2 text-sm text-blue-900">{inspectionView.originalAmendment.reason}</p>
                  <p className="mt-2 text-sm text-blue-800">{inspectionView.originalAmendment.inspection.site.name} on {format(inspectionView.originalAmendment.inspection.scheduledStart, "MMM d, yyyy h:mm a")}</p>
                  <Link className="mt-3 inline-flex text-sm font-semibold text-slateblue" href={`/app/admin/inspections/${inspectionView.originalAmendment.inspection.id}`}>
                    Open original visit
                  </Link>
                </div>
              ) : null}
              {inspectionView.outgoingAmendment ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-900">Superseded by replacement visit</p>
                  <p className="mt-2 text-sm text-amber-900">{inspectionView.outgoingAmendment.reason}</p>
                  <p className="mt-2 text-sm text-amber-800">{inspectionView.outgoingAmendment.replacementInspection.site.name} on {format(inspectionView.outgoingAmendment.replacementInspection.scheduledStart, "MMM d, yyyy h:mm a")}</p>
                  <Link className="mt-3 inline-flex text-sm font-semibold text-slateblue" href={`/app/admin/inspections/${inspectionView.outgoingAmendment.replacementInspection.id}`}>
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
              displayLabel: task.inspectionType.replaceAll("_", " "),
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
          <InspectionPdfUploadCard action={uploadInspectionPdfAction} attachments={attachmentView} inspectionId={inspection.id} />
          <div className="rounded-[2rem] bg-white p-6 shadow-panel">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Audit trail</p>
            <div className="mt-4 space-y-3">
              {(inspectionView.auditTrail ?? []).length ? (inspectionView.auditTrail ?? []).map((entry) => {
                const metadata = asMetadataRecord(entry.metadata);
                return (
                <div key={entry.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{formatAuditAction(entry.action)}</p>
                    <p className="text-xs text-slate-400">{format(entry.createdAt, "MMM d, yyyy h:mm a")}</p>
                  </div>
                  {metadata && "reason" in metadata ? <p className="mt-2 text-sm text-slate-700">{String(metadata.reason ?? "")}</p> : null}
                  {metadata && "replacementInspectionId" in metadata ? (
                    <p className="mt-2 text-sm text-slate-500">Replacement visit id: {String(metadata.replacementInspectionId ?? "")}</p>
                  ) : null}
                  {metadata && "amendmentType" in metadata ? (
                    <p className="mt-1 text-sm text-slate-500">Type: {String(metadata.amendmentType ?? "").replaceAll("_", " ")}</p>
                  ) : null}
                </div>
              );}) : <p className="text-sm text-slate-500">No amendment-related audit entries yet.</p>}
            </div>
          </div>
          <div className="rounded-[2rem] bg-white p-6 shadow-panel">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Deficiency records</p>
            <div className="mt-4 space-y-3">
              {(inspectionView.deficiencies ?? []).length ? (inspectionView.deficiencies ?? []).map((deficiency) => (
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
