import Link from "next/link";
import { format } from "date-fns";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  formatInspectionTaskTypeLabel,
  getAdminInspectionArchiveDetail,
  getInspectionStatusTone,
  inspectionStatusLabels
} from "@testworx/lib";

import { InspectionPacketCard } from "../../../inspection-packet-card";
import { AppPageShell, PageHeader, SectionCard, StatusBadge, WorkspaceSplit } from "../../operations-ui";

export default async function InspectionArchiveDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ inspectionId: string }>;
  searchParams?: Promise<{ from?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app/admin");
  }

  const { inspectionId } = await params;
  const resolvedSearch = searchParams ? await searchParams : {};
  const returnHref = typeof resolvedSearch.from === "string" && resolvedSearch.from.startsWith("/app/admin/archive")
    ? resolvedSearch.from
    : "/app/admin/archive";

  const detail = await getAdminInspectionArchiveDetail(
    {
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId
    },
    inspectionId
  );

  if (!detail) {
    notFound();
  }

  return (
    <AppPageShell density="wide">
      <PageHeader
        backNavigation={{ label: "Back to archive", fallbackHref: returnHref }}
        eyebrow="Inspection archive"
        title={`${detail.snapshot.siteName} • ${detail.inspectionNumber}`}
        description="Review the archived inspection snapshot, report packet, deficiency outcome, and any linked quote or billing references."
        actions={(
          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              href={`/app/admin/inspections/${detail.id}?from=${encodeURIComponent(returnHref)}`}
            >
              Open inspection workspace
            </Link>
          </div>
        )}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SectionCard>
          <p className="text-sm text-slate-500">Completed</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{format(detail.completedAt, "MMM d, yyyy")}</p>
          <p className="mt-1 text-sm text-slate-500">{format(detail.completedAt, "h:mm a")}</p>
        </SectionCard>
        <SectionCard>
          <p className="text-sm text-slate-500">Technician</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{detail.snapshot.technicianName}</p>
        </SectionCard>
        <SectionCard>
          <p className="text-sm text-slate-500">Result</p>
          <div className="mt-3">
            <StatusBadge label={detail.resultStatus} tone={detail.deficiencies.length > 0 ? "amber" : "emerald"} />
          </div>
        </SectionCard>
        <SectionCard>
          <p className="text-sm text-slate-500">Inspection status</p>
          <div className="mt-3">
            <StatusBadge label={inspectionStatusLabels[detail.status]} tone={getInspectionStatusTone(detail.status)} />
          </div>
        </SectionCard>
      </section>

      <WorkspaceSplit variant="content-heavy">
        <div className="space-y-6">
          <SectionCard>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Archive snapshot</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Customer</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{detail.snapshot.customerName}</p>
                {detail.customerCompany.contactName ? <p className="mt-1 text-sm text-slate-500">{detail.customerCompany.contactName}</p> : null}
                {detail.customerCompany.billingEmail ? <p className="mt-1 text-sm text-slate-500">{detail.customerCompany.billingEmail}</p> : null}
                {detail.customerCompany.phone ? <p className="mt-1 text-sm text-slate-500">{detail.customerCompany.phone}</p> : null}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Site</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{detail.snapshot.siteName}</p>
                <p className="mt-1 text-sm text-slate-500">{detail.snapshot.siteAddress}</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Archived report context</p>
            <div className="mt-4 space-y-3">
              {detail.tasks.map((task) => (
                <div key={task.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{task.inspectionTypeLabel}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {task.finalizedAt ? `Finalized ${format(task.finalizedAt, "MMM d, yyyy h:mm a")}` : task.reportStatus ? task.reportStatus : "No report history"}
                    </p>
                  </div>
                  {task.reportId ? (
                    <Link
                      className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      href={`/app/admin/reports/${detail.id}/${task.id}`}
                    >
                      Open report
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          </SectionCard>

          <InspectionPacketCard
            description="Download report PDFs, signed documents, and archived inspection attachments from one archive packet."
            documents={detail.packetDocuments}
            emptyDescription="No archived report PDFs or packet documents are attached to this inspection yet."
            emptyTitle="No archive packet documents available"
            showCustomerVisibility
            title="Archive packet"
          />

          <SectionCard>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Deficiency outcome</p>
            <div className="mt-4 space-y-3">
              {detail.deficiencies.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No deficiencies were recorded on this archived inspection.</p>
              ) : (
                detail.deficiencies.map((deficiency) => (
                  <div key={deficiency.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-950">{deficiency.title}</p>
                      <StatusBadge label={deficiency.severity} tone="amber" />
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{deficiency.description}</p>
                    <p className="mt-2 text-sm text-slate-500">{deficiency.location ?? deficiency.section.replaceAll("-", " ")}</p>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Archive metadata</p>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <p>Inspection #: <span className="font-semibold text-slate-950">{detail.inspectionNumber}</span></p>
              <p>Archived: <span className="font-semibold text-slate-950">{format(detail.archivedAt, "MMM d, yyyy h:mm a")}</span></p>
              <p>Snapshot city: <span className="font-semibold text-slate-950">{detail.snapshot.city}</span></p>
              <p>Task mix: <span className="font-semibold text-slate-950">{detail.tasks.map((task) => formatInspectionTaskTypeLabel(task.inspectionType)).join(", ")}</span></p>
            </div>
          </SectionCard>

          <SectionCard>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Linked records</p>
            <div className="mt-4 space-y-3">
              {detail.quote ? (
                <Link className="block rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50" href={`/app/admin/quotes/${detail.quote.id}`}>
                  <p className="text-sm font-semibold text-slate-950">Quote {detail.quote.quoteNumber}</p>
                  <p className="mt-1 text-sm text-slate-500">{detail.quote.status.replaceAll("_", " ")}</p>
                </Link>
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No linked quote is stored for this archived inspection.</p>
              )}
              {detail.billingSummary ? (
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-950">Billing summary</p>
                  <p className="mt-1 text-sm text-slate-500">Status: {detail.billingSummary.status}</p>
                  {detail.billingSummary.quickbooksInvoiceNumber ? (
                    <p className="mt-1 text-sm text-slate-500">Invoice: {detail.billingSummary.quickbooksInvoiceNumber}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </SectionCard>
        </div>
      </WorkspaceSplit>
    </AppPageShell>
  );
}
