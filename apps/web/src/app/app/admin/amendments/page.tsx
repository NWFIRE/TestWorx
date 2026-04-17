import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  formatInspectionCloseoutRequestStatusLabel,
  formatInspectionCloseoutRequestTypeLabel,
  getAdminAmendmentManagementData
} from "@testworx/lib/server/index";

import {
  AppPageShell,
  EmptyState,
  FilterBar,
  FilterChipLink,
  KPIStatCard,
  PageHeader,
  SectionCard,
  StatusBadge
} from "../operations-ui";

type ReviewItem = Awaited<ReturnType<typeof getAdminAmendmentManagementData>>["items"][number];

const reviewOptions = [
  { value: "all", label: "All inspections" },
  { value: "needs_review", label: "Needs review" },
  { value: "pending_follow_up_request", label: "Pending requests" },
  { value: "approved_created", label: "Approved / created" },
  { value: "dismissed", label: "Dismissed" },
  { value: "has_amendment_linkage", label: "Has linked visit history" }
] as const;

function formatAuditAction(value: string) {
  return value.replaceAll(".", " ").replaceAll("_", " ");
}

function getRelationshipSummary(item: ReviewItem) {
  if (item.originalAmendment) {
    return {
      label: "Updated from",
      inspectionId: item.originalAmendment.inspection.id,
      href: `/app/admin/inspections/${item.originalAmendment.inspection.id}`,
      siteName: item.originalAmendment.inspection.site.name,
      scheduledStart: item.originalAmendment.inspection.scheduledStart
    };
  }

  if (item.outgoingAmendment) {
    return {
      label: "Updated by",
      inspectionId: item.outgoingAmendment.replacementInspection.id,
      href: `/app/admin/inspections/${item.outgoingAmendment.replacementInspection.id}`,
      siteName: item.outgoingAmendment.replacementInspection.site.name,
      scheduledStart: item.outgoingAmendment.replacementInspection.scheduledStart
    };
  }

  return null;
}

export default async function AdminAmendmentsPage({
  searchParams
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const params = await searchParams;
  const selectedFilter = reviewOptions.some((option) => option.value === params.filter) ? params.filter : "all";
  const currentPath = selectedFilter === "all"
    ? "/app/admin/amendments"
    : `/app/admin/amendments?filter=${selectedFilter}`;
  const data = await getAdminAmendmentManagementData(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    { filter: selectedFilter as "all" | "needs_review" | "pending_follow_up_request" | "approved_created" | "dismissed" | "has_amendment_linkage" }
  );

  return (
    <AppPageShell>
      <PageHeader
        backNavigation={{ label: "Back to admin", fallbackHref: "/app/admin" }}
        description="Review completed visits, confirm the packet is complete, and respond to technician requests for the next inspection without dropping into the full edit workspace."
        eyebrow="Post-visit review"
        title="Visit review and next-step requests"
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KPIStatCard
          label="Needs review"
          note="Inspections with unfinished packet details or a pending technician request."
          tone="violet"
          value={data.filterCounts.needs_review}
        />
        <KPIStatCard
          label="Pending requests"
          note="Technician requests waiting for office approval."
          tone="blue"
          value={data.filterCounts.pending_follow_up_request}
        />
        <KPIStatCard
          label="Approved / created"
          note="Requests already turned into the next inspection."
          tone="emerald"
          value={data.filterCounts.approved_created}
        />
        <KPIStatCard
          label="Linked visit history"
          note="Historical visit relationships still tied to these visits."
          tone="amber"
          value={data.filterCounts.has_amendment_linkage}
        />
      </section>

      <FilterBar
        description="Filter the review queue by technician request state, readiness, and linked visit history."
        title="Review filters"
      >
        {reviewOptions.map((option) => (
          <FilterChipLink
            active={data.filter === option.value}
            href={option.value === "all" ? "/app/admin/amendments" : `/app/admin/amendments?filter=${option.value}`}
            key={option.value}
            label={option.label}
            tone="violet"
          />
        ))}
      </FilterBar>

      <SectionCard>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Review queue
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
              Completed visits ready for office review
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            {data.items.length} inspection record{data.items.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="mt-5 space-y-4">
          {data.items.length === 0 ? (
            <EmptyState
              description="No inspections matched the selected review filter."
              title="Nothing to review with these filters"
            />
          ) : (
            data.items.map((inspection) => {
              const relationship = getRelationshipSummary(inspection);

              return (
                <div
                  key={inspection.id}
                  className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-5 transition hover:border-slate-300 hover:bg-white"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-slate-950">{inspection.primaryTitle ?? inspection.site.name}</p>
                        {inspection.needsReview ? <StatusBadge label="Needs review" tone="violet" /> : <StatusBadge label="Review ready" tone="emerald" />}
                        {inspection.closeoutRequest ? (
                          <StatusBadge
                            label={formatInspectionCloseoutRequestStatusLabel(inspection.closeoutRequest.status)}
                            tone={inspection.closeoutRequest.status === "approved" ? "emerald" : inspection.closeoutRequest.status === "dismissed" ? "slate" : "blue"}
                          />
                        ) : null}
                      </div>
                      <p className="text-sm text-slate-500">
                        {[inspection.secondaryTitle, format(inspection.scheduledStart, "MMM d, yyyy h:mm a")].filter(Boolean).join(" - ")}
                      </p>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Current status
                          </p>
                          <p className="mt-2 text-sm text-slate-700">{(inspection.displayStatus ?? inspection.status).replaceAll("_", " ")}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            Assigned: {(inspection.assignedTechnicianNames ?? []).length
                              ? inspection.assignedTechnicianNames.join(", ")
                              : "Shared queue"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Report completion
                          </p>
                          <p className="mt-2 text-sm text-slate-700">{inspection.reviewSummary.reportCompletionLabel}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {inspection.reviewSummary.pendingSignatureDocuments === 0
                              ? "All required signature documents complete."
                              : `${inspection.reviewSummary.pendingSignatureDocuments} signature document${inspection.reviewSummary.pendingSignatureDocuments === 1 ? "" : "s"} still pending.`}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Packet readiness
                          </p>
                          <p className="mt-2 text-sm text-slate-700">
                            {inspection.reviewSummary.readyForOfficeReview ? "Ready for review" : "Needs attention"}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            PDFs / docs: {inspection.reviewSummary.documentCount} | Attachments: {inspection.reviewSummary.attachmentCount}
                          </p>
                        </div>
                      </div>
                      {inspection.closeoutRequest ? (
                        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-900">
                            Technician next-step request
                          </p>
                          <p className="mt-2 text-sm font-semibold text-blue-950">
                            {formatInspectionCloseoutRequestTypeLabel(inspection.closeoutRequest.requestType)}
                          </p>
                          <p className="mt-1 text-sm text-blue-900">{inspection.closeoutRequest.note}</p>
                          <p className="mt-2 text-xs text-blue-800">
                            Requested by {inspection.closeoutRequest.requestedBy?.name ?? "Technician"} on {format(inspection.closeoutRequest.createdAt, "MMM d, yyyy h:mm a")}
                          </p>
                          {inspection.closeoutRequest.createdInspection ? (
                            <p className="mt-2 text-xs text-blue-800">
                              Created inspection: {inspection.closeoutRequest.createdInspection.site.name} | {inspection.closeoutRequest.createdInspection.customerCompany.name}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Technician request
                          </p>
                          <p className="mt-2 text-sm text-slate-700">No new or follow-up inspection requested at closeout.</p>
                        </div>
                      )}
                      {relationship ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Linked visit history
                          </p>
                          <p className="mt-2 text-sm text-slate-700">
                            {relationship.label}: {relationship.siteName}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {format(relationship.scheduledStart, "MMM d, yyyy h:mm a")}
                          </p>
                        </div>
                      ) : null}
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Latest audit note
                        </p>
                        {inspection.latestAuditEntry ? (
                          <>
                            <p className="mt-2 text-sm text-slate-700">{formatAuditAction(inspection.latestAuditEntry.action)}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              {format(inspection.latestAuditEntry.createdAt, "MMM d, yyyy h:mm a")}
                            </p>
                          </>
                        ) : (
                          <p className="mt-2 text-sm text-slate-700">No review-related audit entries yet.</p>
                        )}
                      </div>
                    </div>
                    <div className="flex min-w-56 flex-col gap-3">
                      <Link
                        className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white"
                        href={`/app/admin/inspections/${inspection.id}?from=${encodeURIComponent(currentPath)}&mode=review`}
                      >
                        Review inspection
                      </Link>
                      {relationship ? (
                        <Link
                          className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                          href={`${relationship.href}?from=${encodeURIComponent(currentPath)}&mode=review`}
                        >
                          Open linked inspection
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SectionCard>
    </AppPageShell>
  );
}

