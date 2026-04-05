import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getAdminReportReviewQueueData } from "@testworx/lib";

import {
  AppPageShell,
  EmptyState,
  KPIStatCard,
  PageHeader,
  SectionCard,
  StatusBadge,
  WorkQueueNav
} from "../operations-ui";

function taskDisplayLabel(task: { inspectionType: string; displayLabel?: string }) {
  return task.displayLabel ?? task.inspectionType.replaceAll("_", " ");
}

export default async function AdminReportsQueuePage({
  searchParams
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const params = searchParams ? await searchParams : {};
  const status = typeof params.status === "string" ? params.status : "awaiting-review";

  const data = await getAdminReportReviewQueueData(
    {
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId
    },
    { status }
  );

  return (
    <AppPageShell>
      <PageHeader
        actions={
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            href="/app/admin"
          >
            Back to dashboard
          </Link>
        }
        description="Move directly into completed inspections that still need office review before final billing or follow-up."
        eyebrow="Reports / review"
        title="Awaiting office review"
      />

      <WorkQueueNav activeKey="review" />

      <section className="grid gap-3 md:grid-cols-2">
        <KPIStatCard
          label="Awaiting review"
          note="Completed inspections still needing office review or downstream action."
          tone="blue"
          value={data.counts.awaitingReview}
        />
        <KPIStatCard
          label="Completed reports"
          note="Completed inspections with finalized reports available for office access."
          tone="slate"
          value={data.counts.completed}
        />
      </section>

      <SectionCard>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Review queue
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
              Completed inspections awaiting office review
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            {data.inspections.length} inspection{data.inspections.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="mt-5 space-y-4">
          {data.inspections.length === 0 ? (
            <EmptyState
              description="No completed inspections are currently waiting on office review."
              title="Review queue is clear"
            />
          ) : (
            data.inspections.map((inspection) => (
              <div
                key={inspection.id}
                className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-5 transition hover:border-slate-300 hover:bg-white"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-slate-950">
                        {inspection.primaryTitle ?? inspection.site.name}
                      </p>
                      <StatusBadge label={inspection.billingStatus ?? "not invoiced"} tone="blue" />
                    </div>
                    <p className="text-sm text-slate-500">
                      {inspection.secondaryTitle ?? inspection.customerCompany.name} •{" "}
                      {format(inspection.scheduledStart, "MMM d, yyyy h:mm a")}
                    </p>
                    <p className="text-sm text-slate-500">
                      Assigned: {inspection.assignedTechnicianNames.join(", ") || "Shared queue"}
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                        <p className="font-medium text-slate-800">Reviewable report types</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {inspection.reviewTasks.map((task) => (
                            <span
                              key={task.id}
                              className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600"
                            >
                              {taskDisplayLabel(task)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                        <p>Billing status: {inspection.billingStatus ?? "Not started"}</p>
                        <p className="mt-1">Finalized reports: {inspection.reviewTasks.length}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex min-w-64 flex-col gap-3">
                    {inspection.reviewTasks[0] ? (
                      <Link
                        className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#1f4678] px-4 py-3 text-sm font-semibold text-white"
                        href={`/app/admin/reports/${inspection.id}/${inspection.reviewTasks[0].id}`}
                      >
                        Open report review
                      </Link>
                    ) : null}
                    <Link
                      className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                      href={`/app/admin/inspections/${inspection.id}`}
                    >
                      View inspection
                    </Link>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </SectionCard>
    </AppPageShell>
  );
}
