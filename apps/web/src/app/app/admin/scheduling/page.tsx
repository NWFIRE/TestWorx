import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { formatInspectionStatusLabel, getAdminSchedulingQueueData, pickEarliestNextDueAt } from "@testworx/lib";

import {
  AppPageShell,
  EmptyState,
  KPIStatCard,
  PageHeader,
  SectionCard,
  StatusBadge,
  WorkQueueNav
} from "../operations-ui";

const statusOptions = ["open", "in_progress"] as const;

function taskDisplayLabel(task: { inspectionType: string; displayLabel?: string }) {
  return task.displayLabel ?? task.inspectionType.replaceAll("_", " ");
}

export default async function AdminSchedulingQueuePage({
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
  const requestedStatuses = typeof params.status === "string"
    ? params.status
        .split(",")
        .map((status) => status.trim())
        .filter((status): status is (typeof statusOptions)[number] => statusOptions.includes(status as (typeof statusOptions)[number]))
    : ["open", "in_progress"];

  const data = await getAdminSchedulingQueueData(
    {
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId
    },
    { statuses: requestedStatuses }
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
        description="Focus the dispatch board on open and in-progress field work instead of scanning the broader dashboard."
        eyebrow="Scheduling / dispatch"
        title="Open inspections queue"
      />

      <WorkQueueNav activeKey="open" />

      <section className="grid gap-3 md:grid-cols-3">
        <KPIStatCard
          label="Open inspections"
          note="Scheduled, due, and past-due work still waiting to be finished."
          tone="blue"
          value={data.counts.open}
        />
        <KPIStatCard
          label="In progress"
          note="Inspections where technicians have already started work."
          tone="amber"
          value={data.counts.inProgress}
        />
        <KPIStatCard
          label="Shared queue"
          note="Claimable work that still needs a technician assignment."
          tone="slate"
          value={data.counts.sharedQueue}
        />
      </section>

      <SectionCard>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Dispatch board
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
              Current field work
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            {data.inspections.length} inspection{data.inspections.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="mt-5 space-y-4">
          {data.inspections.length === 0 ? (
            <EmptyState
              description="No inspections match the current open or in-progress scheduling filters."
              title="No active dispatch work in this queue"
            />
          ) : (
            data.inspections.map((inspection) => {
              const nextDue = pickEarliestNextDueAt(
                inspection.tasks.map((task) => task.recurrence?.nextDueAt)
              );

              return (
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
                        <StatusBadge
                          label={formatInspectionStatusLabel(inspection.displayStatus as Parameters<typeof formatInspectionStatusLabel>[0])}
                          tone={inspection.displayStatus === "in_progress" ? "amber" : "blue"}
                        />
                      </div>
                      <p className="text-sm text-slate-500">
                        {inspection.secondaryTitle ?? inspection.customerCompany.name} •{" "}
                        {format(inspection.scheduledStart, "MMM d, yyyy h:mm a")}
                      </p>
                      <p className="text-sm text-slate-500">
                        {inspection.tasks.map((task) => taskDisplayLabel(task)).join(", ") || "Inspection workflow"}
                      </p>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                          <p>Assigned: {inspection.assignedTechnicianNames.join(", ") || "Shared queue"}</p>
                          <p className="mt-1">Claimable: {inspection.claimable ? "Yes" : "No"}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                          <p>Reports: {inspection.tasks.length}</p>
                          <p className="mt-1">Next due: {nextDue ? format(new Date(nextDue), "MMM d, yyyy") : "One-time"}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                          <p>Site: {inspection.site.name}</p>
                          <p className="mt-1">Customer: {inspection.customerCompany.name}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex min-w-56 flex-col gap-3">
                      <Link
                        className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#1f4678] px-4 py-3 text-sm font-semibold text-white"
                        href={`/app/admin/inspections/${inspection.id}`}
                      >
                        Open inspection
                      </Link>
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
