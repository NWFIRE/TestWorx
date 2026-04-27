/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { format } from "date-fns";
import { useSearchParams } from "next/navigation";

import { buildInspectionTaskSummaryLine } from "./mobile-inspection-workspace";
import { InspectionCustomerContactCard } from "./inspection-customer-contact-card";
import { MobileInspectionPdfAccessCard } from "./mobile-inspection-pdf-access-card";
import { useOfflineScreenSnapshot } from "./offline/use-offline-screen-snapshot";
import { toDateValue } from "./date-value";

function activeTasks(inspection: any) {
  return inspection.tasks.filter((task: any) => task.report?.status !== "finalized");
}

function openTaskLink(inspection: any) {
  const task = activeTasks(inspection)[0] ?? inspection.tasks[0] ?? null;
  return task ? `/app/tech/reports/${inspection.id}/${task.id}` : "/app/tech";
}

function hasAttachedPdfs(inspection: any) {
  return (inspection.documents?.length ?? 0) > 0 || (inspection.attachments?.length ?? 0) > 0;
}

export function TechnicianInspectionsScreen({ initialData }: { initialData: any }) {
  const snapshot = useOfflineScreenSnapshot("technician-inspections", initialData);
  const searchParams = useSearchParams();

  if (!snapshot) {
    return <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading inspections…</div>;
  }

  const dashboard = snapshot.dashboard;
  const active = dashboard.assigned.filter((inspection: any) => activeTasks(inspection).length > 0);
  const filter = searchParams.get("filter") ?? "all";
  return (
    <div className="space-y-5 pb-4">
      <section
        className="rounded-[1.85rem] p-5 text-[var(--tenant-primary-contrast)] shadow-[0_24px_60px_rgb(var(--tenant-primary-rgb)/0.2)]"
        style={{
          background: "linear-gradient(180deg, rgb(var(--tenant-primary-rgb) / 0.96), rgb(var(--tenant-primary-rgb) / 0.82))"
        }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Inspection workflow</p>
        <h2 className="mt-2 text-[28px] font-semibold leading-tight">Continue inspection</h2>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Active</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">In field right now</h3>
        </div>
        {active.length > 0 ? active.map((inspection: any) => (
          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" key={inspection.id}>
            <p className="text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
            {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[color:var(--tenant-primary-border)] bg-[var(--tenant-primary-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--tenant-primary)]">
                {inspection.tasks.some((task: any) => task.report?.status === "draft" || task.report?.status === "submitted") ? "Draft" : "In Progress"}
              </span>
              <p className="text-sm text-slate-600">{inspection.tasks.map((task: any) => task.displayLabel ?? task.inspectionType.replaceAll("_", " ")).join(", ")}</p>
            </div>
            {inspection.tasks.length > 1 ? (
              <p className="mt-3 text-sm text-slate-500">{buildInspectionTaskSummaryLine(inspection.tasks)}</p>
            ) : null}
            <div className="mt-4">
              <InspectionCustomerContactCard
                compact
                contactName={inspection.customerCompany?.contactName}
                email={inspection.customerCompany?.billingEmail}
                phone={inspection.customerCompany?.phone}
              />
            </div>
            {hasAttachedPdfs(inspection) ? (
              <div className="mt-4">
                <MobileInspectionPdfAccessCard
                  attachments={inspection.attachments}
                  documents={inspection.documents}
                  inspectionId={inspection.id}
                />
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Link className="flex min-h-12 items-center justify-center rounded-2xl bg-[var(--tenant-primary)] px-4 py-3 text-sm font-semibold text-[var(--tenant-primary-contrast)]" href={openTaskLink(inspection)}>
                {inspection.tasks.some((task: any) => task.report?.status === "draft" || task.report?.status === "submitted") ? "Continue inspection" : "Start inspection"}
              </Link>
              <div className="flex min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                Last updated: {format(toDateValue(inspection.scheduledStart), "MMM d, h:mm a")}
              </div>
            </div>
          </article>
        )) : (
          <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
            No active inspections are in progress right now.
          </div>
        )}
      </section>

      {filter === "active" ? null : (
      <section className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Recently completed</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">Last two weeks</h3>
        </div>
        {dashboard.recentCompleted.length > 0 ? dashboard.recentCompleted.map((inspection: any) => (
          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" key={inspection.id}>
            <p className="text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
            {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
            <p className="mt-3 text-sm text-slate-600">Completed {format(toDateValue(inspection.scheduledStart), "MMM d, h:mm a")}</p>
          </article>
        )) : (
          <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
            Completed inspections will appear here after you finish and sync them.
          </div>
        )}
      </section>
      )}
    </div>
  );
}
