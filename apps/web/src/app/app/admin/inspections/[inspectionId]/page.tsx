import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PageBackControl } from "@/app/page-back-control";
import {
  buildInspectionPacketDocuments,
  editableInspectionStatuses,
  formatInspectionCloseoutRequestStatusLabel,
  formatInspectionCloseoutRequestTypeLabel,
  formatInspectionClassificationLabel,
  formatInspectionStatusLabel,
  formatInspectionTaskTypeLabel,
  formatBillingPricingSourceLabel,
  formatBillingResolutionModeLabel,
  formatWorkOrderProviderSourceLabel,
  getAdminDashboardData,
  getAdminInspectionPdfAttachments,
  getDefaultInspectionRecurrenceFrequency,
  getInspectionClassificationTone,
  getInspectionDisplayLabels,
  getInspectionDocuments,
  getInspectionForEdit,
  getInspectionStatusTone,
  isDueAtTimeOfServiceCustomer
} from "@testworx/lib/server/index";

import { amendInspectionAction, deleteInspectionAction, regenerateCompletedReportPdfAction, reopenCompletedReportAction, updateInspectionAction, updateInspectionBillingSourceTypeAction, updateInspectionStatusAdminAction } from "../../actions";
import { AdminReportDeleteButton } from "../../admin-report-delete-button";
import { DeleteInspectionCard } from "../../delete-inspection-card";
import { InspectionExternalDocumentsCard } from "../../inspection-external-documents-card";
import { InspectionCloseoutRequestActions } from "../../inspection-closeout-request-actions";
import { InspectionPdfUploadCard } from "../../inspection-pdf-upload-card";
import { InspectionReportCorrectionsCard } from "../../inspection-report-corrections-card";
import { InspectionSchedulerForm } from "../../inspection-scheduler-form";
import { InspectionStatusUpdateCard } from "../../inspection-status-update-card";
import { PriorityBadge, StatusBadge, WorkspaceSplit } from "../../operations-ui";
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

function formatAuditAction(action: string) {
  if (action === "inspection.amendment_created") {
    return "new visit created";
  }

  if (action === "inspection.amendment_replacement_created") {
    return "updated visit linked";
  }

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

function inspectionTaskLabel(task: { inspectionType: string; customDisplayLabel?: string | null }) {
  return task.customDisplayLabel?.trim() || formatInspectionTaskTypeLabel(task.inspectionType as InspectionType);
}

function resolveInspectionOrigin(value: string | undefined) {
  const candidate = (value ?? "").trim();
  if (!candidate.startsWith("/app/") || candidate.startsWith("/app/admin/inspections/")) {
    return "/app/admin/dashboard";
  }

  return candidate;
}

function resolveInspectionMode(value: string | undefined) {
  return value === "review" ? "review" : "workspace";
}

function resolveInspectionBackLabel(originPath: string) {
  if (originPath.startsWith("/app/admin/billing")) {
    return "Back to billing";
  }

  if (originPath.startsWith("/app/admin/reports")) {
    return "Back to review";
  }

  if (originPath.startsWith("/app/admin/amendments")) {
    return "Back to inspections";
  }

  if (originPath.startsWith("/app/admin/inspections") || originPath.startsWith("/app/admin/scheduling")) {
    return "Back to inspections";
  }

  return "Back to dashboard";
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
    redirect("/app/admin/dashboard");
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
    providerContextRecord?: {
      id: string;
      sourceType: "direct" | "third_party_provider";
      providerWorkOrderNumber: string | null;
      providerReferenceNumber: string | null;
      providerAccount?: { id: string; name: string } | null;
      providerContractProfile?: { id: string; name: string } | null;
      siteProviderAssignment?: {
        id: string;
        externalAccountName?: string | null;
        externalAccountNumber?: string | null;
        externalLocationCode?: string | null;
      } | null;
    } | null;
    providerContextSnapshot?: {
      id: string;
      sourceType: "direct" | "third_party_provider";
      providerWorkOrderNumber: string | null;
      providerReferenceNumber: string | null;
      providerAccount?: { id: string; name: string } | null;
      providerContractProfile?: { id: string; name: string } | null;
      siteProviderAssignment?: {
        id: string;
        externalAccountName?: string | null;
        externalAccountNumber?: string | null;
        externalLocationCode?: string | null;
      } | null;
    } | null;
    billingSummary?: {
      billingResolutionSnapshot?: {
        resolvedMode: "direct_customer" | "contract_provider";
        pricingSource: "provider_contract_rate" | "customer_pricing" | "default_pricing" | "manual_override";
        resolutionReason?: string | null;
        createdAt: Date;
        payerCustomer?: { id: string; name: string } | null;
        payerProviderAccount?: { id: string; name: string } | null;
        providerContractProfile?: { id: string; name: string } | null;
      } | null;
      billingResolutionMetadata?: {
        warnings: string[];
        blockingIssueCode: string | null;
        monthlyGroupingDeferred: boolean;
        workOrderLevelOverride: boolean;
      } | null;
    } | null;
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
  const providerContext = inspectionView.providerContextRecord ?? inspectionView.providerContextSnapshot ?? null;
  const billingResolutionMetadata = inspectionView.billingSummary?.billingResolutionMetadata ?? null;
  const backLabel = resolveInspectionBackLabel(originPath);
  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-[color:rgb(203_215_230_/_0.92)] bg-white p-6 shadow-panel">
        <PageBackControl className="mb-2" fallbackHref={originPath} label={backLabel} />
        <p className="text-sm uppercase tracking-[0.25em] text-[color:var(--text-secondary)]">
          {isReviewMode ? "Inspection review command center" : "Inspection command center"}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-3xl font-semibold text-ink">{inspectionDisplay.primaryTitle}</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${lifecycleBadgeStyles[inspectionView.lifecycle ?? "original"]}`}>
            {formatLifecycleLabel(inspectionView.lifecycle ?? "original")}
          </span>
          <Link className="inline-flex rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slateblue" href="/app/admin/amendments">
            Review queue
          </Link>
          {isReviewMode ? (
            <Link className="inline-flex rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slateblue" href={`/app/admin/inspections/${inspection.id}?from=${encodeURIComponent(originPath)}`}>
              Open full inspection workspace
            </Link>
          ) : null}
        </div>
        <p className="mt-3 text-[color:var(--text-secondary)]">
          {inspectionDisplay.secondaryTitle ? `${inspectionDisplay.secondaryTitle} | ` : ""}
          {isReviewMode
            ? "Review status, report completion, signatures, documents, and technician-requested next steps from one focused operational workspace."
            : "Coordinate assignment, status, recurrence mix, scheduling details, and customer-facing outputs for this visit from one focused workspace."}
        </p>
        {inspectionView.hasStartedWork ? <p className="mt-3 text-sm text-amber-700">This visit already has work recorded. Changes here will create a new visit so the original stays in history.</p> : null}
        {isDueAtTimeOfServiceCustomer(inspection.customerCompany) ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold uppercase tracking-[0.16em]">Payment due at time of service</p>
            <p className="mt-2">Technicians should collect payment on site for this customer and confirm collection before closing the visit.</p>
          </div>
        ) : null}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[color:var(--border-default)] bg-[color:rgb(248_250_252_/_0.96)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">Visit history</p>
            {inspectionView.originalAmendment ? (
              <>
                <p className="mt-2 text-sm text-slate-700">This is the updated visit linked to an earlier original visit.</p>
                <Link className="mt-3 inline-flex text-sm font-semibold text-slateblue" href={`/app/admin/inspections/${inspectionView.originalAmendment.inspection.id}?from=${encodeURIComponent(originPath)}`}>
                  Open original visit
                </Link>
              </>
            ) : inspectionView.outgoingAmendment ? (
              <>
                <p className="mt-2 text-sm text-slate-700">This original visit now has a newer linked visit.</p>
                <Link className="mt-3 inline-flex text-sm font-semibold text-slateblue" href={`/app/admin/inspections/${inspectionView.outgoingAmendment.replacementInspection.id}?from=${encodeURIComponent(originPath)}`}>
                  Open updated visit
                </Link>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-700">This visit is currently the active original visit.</p>
            )}
          </div>
          <div className="rounded-2xl border border-[color:var(--border-default)] bg-[color:rgb(248_250_252_/_0.96)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">Visit note</p>
            <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
              {inspectionView.originalAmendment?.reason ?? inspectionView.outgoingAmendment?.reason ?? "No linked visit note has been recorded for this inspection yet."}
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-[color:var(--border-default)] bg-[color:rgb(248_250_252_/_0.98)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">Deficiencies found</p>
              <p className="mt-2 text-sm text-[color:var(--text-secondary)]">{inspectionView.deficiencyCount ?? 0} persisted deficiency record{(inspectionView.deficiencyCount ?? 0) === 1 ? "" : "s"} linked to this inspection.</p>
            </div>
            <Link className="inline-flex rounded-2xl border border-[color:var(--border-default)] bg-white px-4 py-3 text-sm font-semibold text-slateblue" href="/app/deficiencies">
              Open deficiency center
            </Link>
          </div>
        </div>
        {inspectionView.closeoutRequest ? (
          <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-900">Technician next-step request</p>
              <StatusBadge
                label={formatInspectionCloseoutRequestStatusLabel(inspectionView.closeoutRequest.status)}
                tone={inspectionView.closeoutRequest.status === "approved" ? "emerald" : inspectionView.closeoutRequest.status === "dismissed" ? "slate" : "blue"}
              />
            </div>
            <p className="mt-2 text-sm font-semibold text-blue-950">
              {formatInspectionCloseoutRequestTypeLabel(inspectionView.closeoutRequest.requestType)}
            </p>
            <p className="mt-1 text-sm text-blue-900">{inspectionView.closeoutRequest.note}</p>
            <p className="mt-2 text-xs text-blue-800">
              Requested by {inspectionView.closeoutRequest.requestedBy?.name ?? "Technician"} on {format(inspectionView.closeoutRequest.createdAt, "MMM d, yyyy h:mm a")}
            </p>
            {inspectionView.closeoutRequest.status === "pending" ? (
              <div className="mt-4">
                <InspectionCloseoutRequestActions inspectionId={inspection.id} canApprove />
              </div>
            ) : inspectionView.closeoutRequest.createdInspection ? (
              <Link
                className="mt-4 inline-flex text-sm font-semibold text-slateblue"
                href={`/app/admin/inspections/${inspectionView.closeoutRequest.createdInspection.id}?from=${encodeURIComponent(originPath)}`}
              >
                Open created inspection
              </Link>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4 rounded-2xl border border-[color:var(--border-default)] bg-[color:rgb(248_250_252_/_0.98)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">Provider context</p>
              <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
                {providerContext
                  ? "This work order already carries a billing snapshot from the assigned provider context."
                  : "No provider snapshot is attached, so this work order resolves to direct customer billing unless an explicit override is applied later."}
              </p>
            </div>
            {inspectionView.billingSummary?.billingResolutionSnapshot ? (
              <StatusBadge
                label={formatBillingResolutionModeLabel(inspectionView.billingSummary.billingResolutionSnapshot.resolvedMode)}
                tone={inspectionView.billingSummary.billingResolutionSnapshot.resolvedMode === "contract_provider" ? "emerald" : "slate"}
              />
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <form action={updateInspectionBillingSourceTypeAction}>
              <input name="inspectionId" type="hidden" value={inspection.id} />
              <input name="sourceType" type="hidden" value="direct" />
              <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
                Bill direct customer
              </button>
            </form>
            <form action={updateInspectionBillingSourceTypeAction}>
              <input name="inspectionId" type="hidden" value={inspection.id} />
              <input name="sourceType" type="hidden" value="third_party_provider" />
              <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue disabled:opacity-50" disabled={!providerContext} type="submit">
                Use snapped provider billing
              </button>
            </form>
          </div>
          {billingResolutionMetadata?.warnings?.length ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-900">Billing warnings</p>
              <div className="mt-2 space-y-2 text-sm text-amber-900">
                {billingResolutionMetadata.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            </div>
          ) : null}
          {billingResolutionMetadata?.blockingIssueCode === "provider_contract_expired" ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-900">
              This work order is still snapped to an expired provider contract. Update the contract or switch the work order back to direct billing before invoicing.
            </div>
          ) : null}
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Source type</p>
              <p className="mt-2 text-sm font-semibold text-ink">{formatWorkOrderProviderSourceLabel(providerContext?.sourceType ?? inspection.sourceType)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Provider</p>
              <p className="mt-2 text-sm font-semibold text-ink">{providerContext?.providerAccount?.name ?? "Direct customer"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Contract</p>
              <p className="mt-2 text-sm font-semibold text-ink">{providerContext?.providerContractProfile?.name ?? inspectionView.billingSummary?.billingResolutionSnapshot?.providerContractProfile?.name ?? "No contract profile"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Provider work order #</p>
              <p className="mt-2 text-sm font-semibold text-ink">{providerContext?.providerWorkOrderNumber ?? "Not captured"}</p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Provider reference</p>
              <p className="mt-2 text-sm font-semibold text-ink">{providerContext?.providerReferenceNumber ?? "Not captured"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">External account</p>
              <p className="mt-2 text-sm font-semibold text-ink">{providerContext?.siteProviderAssignment?.externalAccountName ?? "Not captured"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">External account #</p>
              <p className="mt-2 text-sm font-semibold text-ink">{providerContext?.siteProviderAssignment?.externalAccountNumber ?? "Not captured"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Location code</p>
              <p className="mt-2 text-sm font-semibold text-ink">{providerContext?.siteProviderAssignment?.externalLocationCode ?? "Not captured"}</p>
            </div>
          </div>
          {inspectionView.billingSummary?.billingResolutionSnapshot ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Billing resolution snapshot</p>
              <p className="mt-2 text-sm text-slate-700">
                Bill to {(inspectionView.billingSummary.billingResolutionSnapshot.payerProviderAccount?.name ?? inspectionView.billingSummary.billingResolutionSnapshot.payerCustomer?.name ?? "Unresolved payer")}
                {" · "}
                Pricing source {formatBillingPricingSourceLabel(inspectionView.billingSummary.billingResolutionSnapshot.pricingSource)}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {inspectionView.billingSummary.billingResolutionSnapshot.resolutionReason ?? "Resolution reason will appear here once billing is generated."}
              </p>
            </div>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StatusBadge
            label={formatInspectionClassificationLabel(inspection.inspectionClassification)}
            tone={getInspectionClassificationTone(inspection.inspectionClassification)}
          />
          {inspection.isPriority ? <PriorityBadge /> : null}
          <StatusBadge
            label={formatInspectionStatusLabel((inspectionView.displayStatus ?? inspection.status) as Parameters<typeof formatInspectionStatusLabel>[0])}
            tone={getInspectionStatusTone((inspectionView.displayStatus ?? inspection.status) as Parameters<typeof getInspectionStatusTone>[0])}
          />
          <p className="text-sm text-[color:var(--text-muted)]">
            Current inspection status for scheduling, review, billing, and follow-up queues.
          </p>
        </div>
      </div>
      <WorkspaceSplit variant={isReviewMode ? "balanced" : "content-heavy"}>
        {!isReviewMode ? (
          <div className="space-y-6">
            <InspectionStatusUpdateCard
              action={updateInspectionStatusAdminAction}
              currentStatus={inspection.status}
              inspectionId={inspection.id}
              key={`${inspection.id}:${inspection.status}:${isReviewMode ? "review" : "workspace"}`}
            />
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
            <details className="group rounded-[2rem] bg-white p-6 shadow-panel">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Visit details</p>
                  <h3 className="mt-2 text-2xl font-semibold text-ink">Update schedule, scope, and assignments</h3>
                  <p className="mt-2 text-sm text-slate-500">
                    Open this section when you need to change the visit itself. Core correction tools stay above for faster day-to-day admin work.
                  </p>
                </div>
                <span className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition group-open:rotate-180">
                  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20">
                    <path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                  </svg>
                </span>
              </summary>
              <div className="mt-5 border-t border-slate-200 pt-5">
                <InspectionSchedulerForm
                  action={inspectionView.hasStartedWork ? amendInspectionAction : updateInspectionAction}
                  title="Edit visit"
                  submitLabel="Save changes"
                  banner={inspectionView.hasStartedWork ? `This visit already has ${inspectionView.reportActivityCount ?? 0} work marker${(inspectionView.reportActivityCount ?? 0) === 1 ? "" : "s"}. Saving here will create a new visit and leave the original visit unchanged.` : undefined}
                  workflowNote={inspectionView.hasStartedWork
                    ? "The original visit and its report history stay intact. The new visit carries these updates forward for dispatch."
                    : "Use this form for normal visit edits. Once field work begins, the system protects the original visit and creates a new one when needed."}
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
              </div>
            </details>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-[2rem] bg-white p-6 shadow-panel">
              <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Review summary</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Report completion</p>
                  <p className="mt-2 text-sm font-semibold text-ink">{inspectionView.reviewSummary?.reportCompletionLabel ?? "0/0 finalized"}</p>
                  <p className="mt-1 text-sm text-slate-500">{inspectionView.reviewSummary?.missingReports ?? 0} report task{(inspectionView.reviewSummary?.missingReports ?? 0) === 1 ? "" : "s"} still not finalized.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Signatures and documents</p>
                  <p className="mt-2 text-sm font-semibold text-ink">{inspectionView.reviewSummary?.pendingSignatureDocuments ? `${inspectionView.reviewSummary.pendingSignatureDocuments} document(s) pending signature` : "All signature documents complete"}</p>
                  <p className="mt-1 text-sm text-slate-500">Packet docs: {inspectionView.reviewSummary?.documentCount ?? 0} | Attachments: {inspectionView.reviewSummary?.attachmentCount ?? 0}</p>
                </div>
              </div>
            </div>
            <div className="rounded-[2rem] bg-white p-6 shadow-panel">
              <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Report task completion</p>
              <div className="mt-4 space-y-3">
                {inspectionView.tasks.map((task: InspectionTask) => (
                  <div key={task.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">{inspectionTaskLabel(task)}</p>
                      <StatusBadge
                        label={task.report?.status === "finalized" ? "Finalized" : "Draft"}
                        tone={task.report?.status === "finalized" ? "emerald" : "amber"}
                      />
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      {task.report?.finalizedAt ? `Finalized ${format(task.report.finalizedAt, "MMM d, yyyy h:mm a")}` : "This report still needs finalization."}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
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
          {isReviewMode ? (
            <div className="rounded-[2rem] bg-white p-6 shadow-panel">
              <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Report access and admin controls</p>
              <div className="mt-4 space-y-3">
                {inspectionView.tasks.map((task: InspectionTask) => (
                  <div key={task.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-ink">{inspectionTaskLabel(task)}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {task.report?.finalizedAt
                            ? `Finalized ${format(task.report.finalizedAt, "MMM d, yyyy h:mm a")}`
                            : task.report
                              ? `Current report status: ${task.report.status.replaceAll("_", " ")}`
                              : "No report started yet."}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slateblue"
                          href={`/app/admin/reports/${inspection.id}/${task.id}`}
                        >
                          {task.report?.status === "finalized" ? "Open admin editor" : "Open report"}
                        </Link>
                        <AdminReportDeleteButton
                          inspectionId={inspection.id}
                          inspectionTaskId={task.id}
                          taskLabel={inspectionTaskLabel(task)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="rounded-[2rem] bg-white p-6 shadow-panel">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Visit history</p>
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
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-800">Original visit</p>
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
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-900">Updated visit</p>
                  <p className="mt-2 text-sm text-amber-900">{inspectionView.outgoingAmendment.reason}</p>
                  <p className="mt-2 text-sm text-amber-800">
                    {replacementInspectionDisplay?.primaryTitle} {replacementInspectionDisplay?.secondaryTitle ? `| ${replacementInspectionDisplay.secondaryTitle}` : ""} on {format(inspectionView.outgoingAmendment.replacementInspection.scheduledStart, "MMM d, yyyy h:mm a")}
                  </p>
                  <Link className="mt-3 inline-flex text-sm font-semibold text-slateblue" href={`/app/admin/inspections/${inspectionView.outgoingAmendment.replacementInspection.id}?from=${encodeURIComponent(originPath)}`}>
                    Open updated visit
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
          {!isReviewMode ? (
          <InspectionExternalDocumentsCard
            documents={externalDocumentView.map((document) => ({
              ...document,
              uploadedAt: document.uploadedAt.toISOString(),
              annotatedAt: document.annotatedAt?.toISOString() ?? null,
              signedAt: document.signedAt?.toISOString() ?? null
            }))}
            inspectionId={inspection.id}
          />
          ) : null}
          {!isReviewMode ? (
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
                        <p className="text-sm font-semibold text-ink">{inspectionTaskLabel(task)}</p>
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
                        taskLabel={inspectionTaskLabel(task)}
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
          ) : null}
          {!isReviewMode ? <InspectionPdfUploadCard attachments={attachmentView} inspectionId={inspection.id} /> : null}
          {!isReviewMode ? <DeleteInspectionCard action={deleteInspectionAction} inspectionId={inspection.id} redirectTo={originPath} /> : null}
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
                    <p className="mt-2 text-sm text-slate-500">Updated visit id: {String(metadata.replacementInspectionId ?? "")}</p>
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
      </WorkspaceSplit>
    </section>
  );
}
