import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  formatInspectionStatusLabel,
  getAdminSchedulingQueueData,
  getInspectionStatusTone,
  inspectionFilterStatuses,
  normalizeInspectionStatusFilters,
  pickEarliestNextDueAt
} from "@testworx/lib";

import {
  AppPageShell,
  EmptyState,
  FilterBar,
  FilterChipLink,
  KPIStatCard,
  PageHeader,
  SectionCard,
  StatusBadge,
  WorkQueueNav
} from "../operations-ui";

const statusOptions = inspectionFilterStatuses.map((status) => ({
  value: status,
  label: formatInspectionStatusLabel(status),
  tone: getInspectionStatusTone(status)
}));

function taskDisplayLabel(task: { inspectionType: string; displayLabel?: string }) {
  return task.displayLabel ?? task.inspectionType.replaceAll("_", " ");
}

function taskDueLabel(task: { dueDate?: Date | null; dueMonth?: string | null; schedulingStatus?: string | null }) {
  if (task.dueDate) {
    return format(task.dueDate, "MMM d, yyyy");
  }
  if (task.dueMonth) {
    return task.dueMonth;
  }
  return "No due date";
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
  const requestedStatuses = normalizeInspectionStatusFilters(typeof params.status === "string" ? params.status : null);
  const activeStatusParam = requestedStatuses.length ? requestedStatuses.join(",") : "all";
  const currentPath = requestedStatuses.length
    ? `/app/admin/scheduling?status=${requestedStatuses.join(",")}`
    : "/app/admin/scheduling";

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
        description="Filter the inspection workflow by status so dispatch, follow-up, completed, invoiced, and cancelled work can be reviewed without losing context."
        eyebrow="Scheduling / dispatch"
        title="Inspection management"
      />

      <WorkQueueNav activeKey="open" />

      <section className="grid gap-3 md:grid-cols-3">
        <KPIStatCard
          label="To Be Completed"
          note="Newly created or not-yet-started inspections that still need scheduling follow-through."
          tone="blue"
          value={data.counts.toBeCompleted}
        />
        <KPIStatCard
          label="Scheduled"
          note="Inspections committed to the board and ready for dispatch execution."
          tone="slate"
          value={data.counts.scheduled}
        />
        <KPIStatCard
          label="In Progress"
          note="Inspections where technicians have already started work."
          tone="amber"
          value={data.counts.inProgress}
        />
      </section>

      <FilterBar
        description="Filter the inspection board by canonical workflow status. Shareable URLs keep the same status view when you send someone this page."
        title="Inspection status"
      >
        <FilterChipLink
          active={requestedStatuses.length === 0}
          href="/app/admin/scheduling"
          label="All statuses"
          tone="slate"
        />
        {statusOptions.map((option) => (
          <FilterChipLink
            active={requestedStatuses.length > 0 && activeStatusParam === option.value}
            href={`/app/admin/scheduling?status=${option.value}`}
            key={option.value}
            label={option.label}
            tone={option.tone}
          />
        ))}
      </FilterBar>

      <SectionCard>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Inspection queue
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
              Status-filtered inspection workflow
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            {data.inspections.length} inspection{data.inspections.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="mt-5 space-y-4">
          {data.inspections.length === 0 ? (
            <EmptyState
              description="No inspections match the current status filters. Clear the filter to return to the full inspection board."
              title="No inspections match this status view"
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
                          tone={getInspectionStatusTone(inspection.displayStatus as Parameters<typeof getInspectionStatusTone>[0])}
                        />
                      </div>
                      <p className="text-sm text-slate-500">
                        {inspection.secondaryTitle ?? inspection.customerCompany.name} •{" "}
                        {format(inspection.scheduledStart, "MMM d, yyyy h:mm a")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {inspection.tasks.map((task) => (
                          <span
                            key={task.id}
                            className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600"
                          >
                            {taskDisplayLabel(task)} - {task.assignedTechnician?.name ?? "Unassigned"} - {taskDueLabel(task)}
                          </span>
                        ))}
                      </div>
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
                        href={`/app/admin/inspections/${inspection.id}?from=${encodeURIComponent(currentPath)}`}
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
