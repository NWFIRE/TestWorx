import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  formatInspectionClassificationLabel,
  formatInspectionStatusLabel,
  getAdminUpcomingInspectionsData,
  getInspectionClassificationTone,
  getInspectionStatusTone,
  pickEarliestNextDueAt
} from "@testworx/lib";

import { createInspectionAction } from "../actions";
import { InspectionSchedulerForm } from "../inspection-scheduler-form";
import {
  AppPageShell,
  EmptyState,
  FilterBar,
  FilterChipLink,
  KPIStatCard,
  PageHeader,
  PriorityBadge,
  SectionCard,
  StatusBadge,
  WorkspaceSplit
} from "../operations-ui";

function taskDisplayLabel(task: { inspectionType: string; displayLabel?: string }) {
  return task.displayLabel ?? task.inspectionType.replaceAll("_", " ");
}

function taskDueLabel(task: { dueDate?: Date | null; dueMonth?: string | null }) {
  if (task.dueDate) {
    return format(task.dueDate, "MMM d, yyyy");
  }
  return task.dueMonth ?? "No due month";
}

export default async function UpcomingInspectionsPage({
  searchParams
}: {
  searchParams?: Promise<{ month?: string; customerCompanyId?: string; siteId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  if (!["tenant_admin", "office_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const params = searchParams ? await searchParams : {};
  const selectedMonth = typeof params.month === "string" ? params.month : undefined;
  const data = await getAdminUpcomingInspectionsData(
    {
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId
    },
    {
      startMonth: selectedMonth,
      monthsAhead: 6
    }
  );
  const requestedCustomerId = typeof params.customerCompanyId === "string" ? params.customerCompanyId : "";
  const requestedSiteId = typeof params.siteId === "string" ? params.siteId : "";
  const resolvedCustomerId = data.customers.some((customer) => customer.id === requestedCustomerId) ? requestedCustomerId : "";
  const resolvedSiteId = data.sites.some((site) => site.id === requestedSiteId && site.customerCompanyId === resolvedCustomerId)
    ? requestedSiteId
    : "";

  return (
    <AppPageShell density="wide">
      <PageHeader
        backNavigation={{ label: "Back to admin", fallbackHref: "/app/admin" }}
        eyebrow="Scheduling / planning"
        title="Upcoming inspections"
        description="Plan the next several months of inspections with a month-by-month view of what is already scheduled, what still needs assignment, and where new work should be added."
        actions={
          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              href="/app/admin/scheduling"
            >
              Open scheduling queue
            </Link>
          </div>
        }
        contentWidth="full"
      />

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
        <KPIStatCard
          label="Upcoming Inspections"
          note="All active inspections scheduled in the current planning window."
          tone="blue"
          value={data.summary.totalUpcomingInspections}
        />
        <KPIStatCard
          label="Priority Inspections"
          note="Inspections marked priority across the planning horizon."
          tone="amber"
          value={data.summary.priorityInspections}
        />
        <KPIStatCard
          label="Unassigned"
          note="Upcoming inspections that still need a technician assignment."
          tone="slate"
          value={data.summary.unassignedInspections}
        />
        <KPIStatCard
          label="Months Loaded"
          note="How many planning months are currently visible on the board."
          tone="emerald"
          value={data.summary.monthCount}
        />
      </section>

      <FilterBar
        title="Planning window"
        description="Jump the planning form and board to a specific starting month without losing the surrounding month-by-month view."
      >
        {data.months.map((month) => (
          <FilterChipLink
            key={month.monthKey}
            active={data.startMonth === month.monthKey}
            href={`/app/admin/upcoming-inspections?month=${month.monthKey}`}
            label={month.monthLabel}
            tone="blue"
          />
        ))}
      </FilterBar>

      <WorkspaceSplit variant="content-heavy">
        <div className="space-y-6">
          {data.months.map((month) => (
            <SectionCard key={month.monthKey}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Planning month
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                    {month.monthLabel}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {month.inspectionCount} inspection{month.inspectionCount === 1 ? "" : "s"} scheduled, {month.unassignedCount} unassigned, {month.priorityCount} priority.
                  </p>
                </div>
                <Link
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white"
                  href={`/app/admin/upcoming-inspections?month=${month.monthKey}#schedule-inspection`}
                >
                  Add inspection to {month.monthLabel}
                </Link>
              </div>

              <div className="mt-5 space-y-4">
                {month.inspections.length === 0 ? (
                  <EmptyState
                    title={`Nothing scheduled for ${month.monthLabel}`}
                    description="Use the scheduling panel to add inspections directly into this month."
                  />
                ) : (
                  month.inspections.map((inspection) => {
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
                                label={formatInspectionClassificationLabel(inspection.inspectionClassification)}
                                tone={getInspectionClassificationTone(inspection.inspectionClassification)}
                              />
                              {inspection.isPriority ? <PriorityBadge /> : null}
                              <StatusBadge
                                label={formatInspectionStatusLabel(
                                  inspection.displayStatus as Parameters<typeof formatInspectionStatusLabel>[0]
                                )}
                                tone={getInspectionStatusTone(
                                  inspection.displayStatus as Parameters<typeof getInspectionStatusTone>[0]
                                )}
                              />
                            </div>
                            <p className="text-sm text-slate-500">
                              {inspection.secondaryTitle ?? inspection.customerCompany.name} -{" "}
                              {format(inspection.scheduledStart, "EEE, MMM d, yyyy h:mm a")}
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
                                <p>Customer: {inspection.customerCompany.name}</p>
                                <p className="mt-1">Site: {inspection.site.name}</p>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                                <p>Assigned: {inspection.assignedTechnicianNames.join(", ") || "Shared queue"}</p>
                                <p className="mt-1">Claimable: {inspection.claimable ? "Yes" : "No"}</p>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                                <p>Reports: {inspection.tasks.length}</p>
                                <p className="mt-1">Next due: {nextDue ? format(new Date(nextDue), "MMM d, yyyy") : "One-time"}</p>
                              </div>
                            </div>
                          </div>
                          <div className="flex min-w-56 flex-col gap-3">
                            <Link
                              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                              href={`/app/admin/inspections/${inspection.id}?from=${encodeURIComponent(`/app/admin/upcoming-inspections?month=${data.startMonth}`)}`}
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
          ))}
        </div>

        <div id="schedule-inspection">
          <InspectionSchedulerForm
            action={createInspectionAction}
            title={`Add inspection for ${data.months[0]?.monthLabel ?? "this month"}`}
            submitLabel="Create inspection"
            customers={data.customers}
            sites={data.sites}
            technicians={data.technicians}
            initialValues={{
              inspectionMonth: data.startMonth,
              scheduledStart: `${data.startMonth}-01T09:00`,
              customerCompanyId: resolvedCustomerId || undefined,
              siteId: resolvedSiteId || undefined
            }}
            workflowNote="Create a new inspection directly inside the planning month you are reviewing. Service lines can still carry their own due month and assignment details."
            allowDocumentUpload
            autoSelectGenericSiteOnCustomerChange
            allowCustomOneTimeSite
          />
        </div>
      </WorkspaceSplit>
    </AppPageShell>
  );
}
