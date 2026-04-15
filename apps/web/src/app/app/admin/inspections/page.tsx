import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LiveUrlSearchInput } from "@/app/live-url-search-input";
import { LiveUrlSelectFilter } from "@/app/live-url-select-filter";
import {
  activeOperationalInspectionStatuses,
  formatInspectionClassificationLabel,
  formatInspectionStatusLabel,
  getAdminDashboardData,
  getAdminSchedulingQueueData,
  getInspectionClassificationTone,
  getInspectionStatusTone,
  normalizeInspectionClassificationFilters,
  normalizeInspectionPriorityFilter,
  normalizeInspectionStatusFilters,
  pickEarliestNextDueAt
} from "@testworx/lib";

import {
  AppPageShell,
  EmptyState,
  KPIStatCard,
  PageHeader,
  PriorityBadge,
  SectionCard,
  StatusBadge,
  WorkQueueNav
} from "../operations-ui";
import { InspectionCreatePanel } from "./inspection-create-panel";

const statusOptions = [
  { value: "", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
  { value: "follow_up_required", label: "Follow-Up Required" },
  { value: "cancelled", label: "Cancelled" }
];

const typeOptions = [
  { value: "", label: "All types" },
  { value: "standard", label: "Standard" },
  { value: "call_in", label: "Call-In" },
  { value: "follow_up", label: "Follow-Up" },
  { value: "emergency", label: "Emergency" }
];

const priorityOptions = [
  { value: "all", label: "All priorities" },
  { value: "priority", label: "Priority only" },
  { value: "non_priority", label: "Non-priority only" }
];

function buildInspectionsHref(input: {
  statuses?: string[];
  classifications?: string[];
  priority?: string;
  query?: string;
  technicianId?: string;
  create?: boolean;
}) {
  const params = new URLSearchParams();
  if (input.statuses?.length) {
    params.set("status", input.statuses.join(","));
  }
  if (input.classifications?.length) {
    params.set("classification", input.classifications.join(","));
  }
  if (input.priority && input.priority !== "all") {
    params.set("priority", input.priority);
  }
  if (input.query?.trim()) {
    params.set("q", input.query.trim());
  }
  if (input.technicianId?.trim()) {
    params.set("technician", input.technicianId.trim());
  }
  if (input.create) {
    params.set("create", "1");
  }

  const query = params.toString();
  return query ? `/app/admin/inspections?${query}` : "/app/admin/inspections";
}

function taskDisplayLabel(task: { inspectionType: string; displayLabel?: string }) {
  return task.displayLabel ?? task.inspectionType.replaceAll("_", " ");
}

function resolveStatusSelectValue(statuses: string[]) {
  const normalized = statuses.join(",");
  if (!normalized || normalized === activeOperationalInspectionStatuses.join(",")) {
    return "open";
  }
  if (statuses.length === 1) {
    return statuses[0] ?? "";
  }
  return "";
}

function resolveTypeSelectValue(classifications: string[]) {
  return classifications.length === 1 ? classifications[0] ?? "" : "";
}

export default async function AdminInspectionsPage({
  searchParams
}: {
  searchParams?: Promise<{
    status?: string;
    classification?: string;
    priority?: string;
    q?: string;
    technician?: string;
    create?: string;
    month?: string;
    customerCompanyId?: string;
    siteId?: string;
  }>;
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
  const effectiveStatuses = requestedStatuses.length ? requestedStatuses : [...activeOperationalInspectionStatuses];
  const requestedClassifications = normalizeInspectionClassificationFilters(typeof params.classification === "string" ? params.classification : null);
  const requestedPriority = normalizeInspectionPriorityFilter(typeof params.priority === "string" ? params.priority : null);
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const technicianId = typeof params.technician === "string" ? params.technician.trim() : "";
  const createOpen = typeof params.create === "string" && params.create === "1";
  const requestedMonth = typeof params.month === "string" ? params.month.trim() : "";
  const requestedCustomerId =
    typeof params.customerCompanyId === "string" ? params.customerCompanyId.trim() : "";
  const requestedSiteId = typeof params.siteId === "string" ? params.siteId.trim() : "";
  const currentPath = buildInspectionsHref({
    statuses: requestedStatuses.length ? requestedStatuses : undefined,
    classifications: requestedClassifications,
    priority: requestedPriority,
    query,
    technicianId
  });

  const actor = {
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  };

  const [queueData, dashboardData] = await Promise.all([
    getAdminSchedulingQueueData(actor, {
      statuses: effectiveStatuses,
      classifications: requestedClassifications,
      priority: requestedPriority,
      query,
      technicianId
    }),
    getAdminDashboardData(actor)
  ]);
  const initialCustomerId = dashboardData.customers.some((customer) => customer.id === requestedCustomerId)
    ? requestedCustomerId
    : undefined;
  const initialSiteId = dashboardData.sites.some(
    (site) => site.id === requestedSiteId && (!initialCustomerId || site.customerCompanyId === initialCustomerId)
  )
    ? requestedSiteId
    : undefined;

  return (
    <AppPageShell density="wide">
      <PageHeader
        actions={
          <Link
            className="inline-flex min-h-12 items-center rounded-2xl bg-slateblue px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgb(var(--tenant-primary-rgb)_/_0.2)] transition duration-150 hover:brightness-110 active:scale-[0.99]"
            href={buildInspectionsHref({
              statuses: requestedStatuses.length ? requestedStatuses : undefined,
              classifications: requestedClassifications,
              priority: requestedPriority,
              query,
              technicianId,
              create: true
            })}
          >
            + Create Inspection
          </Link>
        }
        backNavigation={{ label: "Back to dashboard", fallbackHref: "/app/admin/dashboard" }}
        description="Create new inspections, filter active work fast, and open each visit into a focused operational command center."
        eyebrow="Inspections"
        title="Inspections"
      />

      <WorkQueueNav activeKey="open" />

      <InspectionCreatePanel
        customers={dashboardData.customers}
        initialOpen={createOpen}
        initialValues={{
          inspectionMonth: requestedMonth || undefined,
          scheduledStart: requestedMonth ? `${requestedMonth}-01T09:00` : undefined,
          customerCompanyId: initialCustomerId,
          siteId: initialSiteId
        }}
        showTrigger={false}
        sites={dashboardData.sites}
        technicians={dashboardData.technicians}
      />

      <section className="grid gap-3 lg:grid-cols-4 lg:gap-4">
        <KPIStatCard
          label="Open"
          note="Inspections still moving through live execution."
          tone="blue"
          value={queueData.counts.open}
        />
        <KPIStatCard
          label="Priority"
          note="Flagged work that should stand out in dispatch."
          tone="amber"
          value={queueData.inspections.filter((inspection) => inspection.isPriority).length}
        />
        <KPIStatCard
          label="Shared queue"
          note="Inspections with no technician assignment yet."
          tone="slate"
          value={queueData.counts.sharedQueue}
        />
        <KPIStatCard
          label="Completed"
          note="Visits returned by the current filter set."
          tone="emerald"
          value={queueData.counts.completed}
        />
      </section>

      <SectionCard className="sticky top-4 z-10">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--text-secondary)]">
              Inspection Filters
            </p>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">
              Search by customer, site, address, or inspection id and keep the queue tight for daily office work.
            </p>
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.8fr))]">
            <LiveUrlSearchInput
              initialValue={queueData.filters.query}
              paramKey="q"
              placeholder="Search customer, location, address, or inspection reference"
            />
            <LiveUrlSelectFilter options={statusOptions} paramKey="status" value={resolveStatusSelectValue(queueData.filters.statuses)} />
            <LiveUrlSelectFilter options={typeOptions} paramKey="classification" value={resolveTypeSelectValue(queueData.filters.classifications)} />
            <LiveUrlSelectFilter options={priorityOptions} paramKey="priority" value={queueData.filters.priority} />
            <LiveUrlSelectFilter
              options={[{ value: "", label: "All technicians" }, ...queueData.technicians]}
              paramKey="technician"
              value={queueData.filters.technicianId}
            />
          </div>
          {(queueData.filters.query ||
            queueData.filters.statuses.length ||
            queueData.filters.classifications.length ||
            queueData.filters.priority !== "all" ||
            queueData.filters.technicianId) ? (
            <div className="flex justify-end">
              <Link
                className="inline-flex min-h-10 items-center rounded-2xl border border-[color:var(--border-default)] bg-white px-4 text-sm font-semibold text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-subtle)]"
                href="/app/admin/inspections"
              >
                Clear filters
              </Link>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--text-secondary)]">
              Operational List
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
              Fast inspection management
            </h2>
          </div>
          <p className="text-sm text-[color:var(--text-muted)]">
            {queueData.inspections.length} inspection{queueData.inspections.length === 1 ? "" : "s"}
          </p>
        </div>

        {queueData.inspections.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              description="Try broadening the filters or clearing the search to bring more inspection work back into view."
              title="No inspections match this view"
            />
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-[24px] border border-[color:rgb(203_215_230_/_0.92)] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
            <div className="hidden bg-[color:rgb(248_250_252_/_0.98)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-secondary)] lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_0.7fr_0.7fr_0.7fr_0.9fr_0.9fr_0.6fr] lg:gap-4">
              <span>Customer</span>
              <span>Location</span>
              <span>Type</span>
              <span>Status</span>
              <span>Priority</span>
              <span>Scheduled Date</span>
              <span>Technician</span>
              <span>Actions</span>
            </div>

            <div className="divide-y divide-[color:rgb(220_229_240_/_0.9)]">
              {queueData.inspections.map((inspection) => {
                const nextDue = pickEarliestNextDueAt(
                  inspection.tasks.map((task) => task.recurrence?.nextDueAt)
                );
                const scheduledLabel = format(inspection.scheduledStart, "MMM d, yyyy h:mm a");
                const locationLabel = [
                  inspection.primaryTitle ?? inspection.site.name,
                  inspection.site.addressLine1,
                  inspection.site.city
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <div
                    key={inspection.id}
                    className="grid gap-3 px-5 py-4 transition hover:bg-[color:rgb(248_250_252_/_0.96)] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_0.7fr_0.7fr_0.7fr_0.9fr_0.9fr_0.6fr] lg:items-center lg:gap-4"
                  >
                    <div className="min-w-0">
                      <Link
                        className="block truncate text-sm font-semibold text-slate-950 hover:text-slateblue"
                        href={`/app/admin/inspections/${inspection.id}?from=${encodeURIComponent(currentPath)}`}
                      >
                        {inspection.secondaryTitle ?? inspection.customerCompany.name}
                      </Link>
                      <p className="mt-1 text-sm text-[color:var(--text-secondary)] lg:hidden">
                        {locationLabel}
                      </p>
                      <p className="mt-1 text-xs text-[color:var(--text-tertiary)]">
                        {inspection.tasks.map((task) => taskDisplayLabel(task)).join(", ") || "Inspection workflow"}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm text-[color:var(--text-secondary)]">{locationLabel}</p>
                      <p className="mt-1 text-xs text-[color:var(--text-tertiary)]">
                        Next due: {nextDue ? format(new Date(nextDue), "MMM d, yyyy") : "One-time"}
                      </p>
                    </div>

                    <div className="text-sm text-slate-700">
                      <StatusBadge
                        label={formatInspectionClassificationLabel(inspection.inspectionClassification)}
                        tone={getInspectionClassificationTone(inspection.inspectionClassification)}
                      />
                    </div>

                    <div className="text-sm text-slate-700">
                      <StatusBadge
                        label={formatInspectionStatusLabel(inspection.displayStatus as Parameters<typeof formatInspectionStatusLabel>[0])}
                        tone={getInspectionStatusTone(inspection.displayStatus as Parameters<typeof getInspectionStatusTone>[0])}
                      />
                    </div>

                    <div className="text-sm text-slate-700">
                      {inspection.isPriority ? <PriorityBadge /> : <span className="text-sm text-[color:var(--text-tertiary)]">Normal</span>}
                    </div>

                    <div className="text-sm text-slate-700">
                      {scheduledLabel}
                    </div>

                    <div className="text-sm text-slate-700">
                      {inspection.assignedTechnicianNames.join(", ") || "Shared queue"}
                    </div>

                    <div className="flex justify-start lg:justify-end">
                      <Link
                        className="inline-flex min-h-10 items-center rounded-2xl border border-[color:var(--border-default)] bg-white px-4 text-sm font-semibold text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-subtle)]"
                        href={`/app/admin/inspections/${inspection.id}?from=${encodeURIComponent(currentPath)}`}
                      >
                        Open
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>
    </AppPageShell>
  );
}
