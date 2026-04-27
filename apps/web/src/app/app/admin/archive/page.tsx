import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  getAdminInspectionArchiveData,
  getArchiveResultStatusTone
} from "@testworx/lib/server/index";

import { LiveUrlDateFilter } from "@/app/live-url-date-filter";
import { LiveUrlSearchInput } from "@/app/live-url-search-input";
import { LiveUrlSelectFilter } from "@/app/live-url-select-filter";
import {
  AppPageShell,
  EmptyState,
  KPIStatCard,
  PageHeader,
  SectionCard,
  StatusBadge
} from "../operations-ui";

type SearchParams = Record<string, string | string[] | undefined>;

function readSearchParam(params: SearchParams, key: string, fallback = "") {
  const value = params[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? fallback : fallback;
}

function readPositiveInt(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildArchiveHref(input: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value && value.trim().length > 0) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `/app/admin/archive?${query}` : "/app/admin/archive";
}

function formatDivisionLabel(division: string) {
  switch (division) {
    case "fire_extinguishers":
      return "Fire Extinguishers";
    case "fire_alarm":
      return "Fire Alarm";
    case "fire_sprinkler":
      return "Fire Sprinkler";
    case "kitchen_suppression":
      return "Kitchen Suppression";
    case "work_order":
      return "Work Order";
    default:
      return division.replaceAll("_", " ");
  }
}

export default async function InspectionArchivePage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app/admin");
  }

  const params = searchParams ? await searchParams : {};
  const actor = {
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  };

  const filters = {
    query: readSearchParam(params, "query"),
    page: readPositiveInt(readSearchParam(params, "page", "1"), 1),
    customerId: readSearchParam(params, "customerId"),
    siteId: readSearchParam(params, "siteId"),
    division: readSearchParam(params, "division"),
    inspectionType: readSearchParam(params, "inspectionType"),
    technicianId: readSearchParam(params, "technicianId"),
    hasDeficiencies: readSearchParam(params, "hasDeficiencies", "all") as "all" | "yes" | "no",
    hasReport: readSearchParam(params, "hasReport", "all") as "all" | "yes" | "no",
    completedFrom: readSearchParam(params, "completedFrom"),
    completedTo: readSearchParam(params, "completedTo")
  };

  const data = await getAdminInspectionArchiveData(actor, filters);
  const currentParams = {
    query: data.filters.query,
    customerId: data.filters.customerId,
    siteId: data.filters.siteId,
    division: data.filters.division,
    inspectionType: data.filters.inspectionType,
    technicianId: data.filters.technicianId,
    hasDeficiencies: data.filters.hasDeficiencies !== "all" ? data.filters.hasDeficiencies : "",
    hasReport: data.filters.hasReport !== "all" ? data.filters.hasReport : "",
    completedFrom: data.filters.completedFrom,
    completedTo: data.filters.completedTo
  };

  return (
    <AppPageShell density="wide">
      <PageHeader
        eyebrow="Inspection archive"
        title="Inspection Archive"
        description="Search completed inspections across months of history without cluttering the active dispatch and review workflows."
        contentWidth="full"
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPIStatCard
          label="Archived inspections"
          note="Completed and invoiced inspections available for long-term reference."
          tone="slate"
          value={data.pagination.totalCount}
        />
        <KPIStatCard
          label="With deficiencies"
          note="Archived inspections that still show one or more recorded deficiencies."
          tone="amber"
          value={data.summary.withDeficiencies}
        />
        <KPIStatCard
          label="With reports"
          note="Archived inspections that already include finalized report history."
          tone="emerald"
          value={data.summary.withReports}
        />
        <KPIStatCard
          label="This month"
          note="Archive records completed inside the current month."
          tone="blue"
          value={data.summary.thisMonth}
        />
      </section>

      <SectionCard>
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Archive filters</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Historical lookup</h2>
            <p className="mt-2 text-sm text-slate-500">Type to search, narrow by customer or technician, and refine by completion date without leaving the archive view.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
            <LiveUrlSearchInput
              initialValue={data.filters.query}
              paramKey="query"
              placeholder="Search inspection #, customer, site, address, city, or technician"
              resetPageKeys={["page"]}
            />
            <LiveUrlSelectFilter
              options={[
                { value: "", label: "All customers" },
                ...data.options.customers.map((customer) => ({ value: customer.id, label: customer.name }))
              ]}
              paramKey="customerId"
              value={data.filters.customerId}
            />
            <LiveUrlSelectFilter
              options={[
                { value: "", label: "All sites" },
                ...data.options.sites.map((site) => ({ value: site.id, label: site.city ? `${site.name} • ${site.city}` : site.name }))
              ]}
              paramKey="siteId"
              value={data.filters.siteId}
            />
            <LiveUrlSelectFilter
              options={[
                { value: "", label: "All technicians" },
                ...data.options.technicians.map((technician) => ({ value: technician.id, label: technician.name }))
              ]}
              paramKey="technicianId"
              value={data.filters.technicianId}
            />
            <LiveUrlSelectFilter
              options={[
                { value: "", label: "All divisions" },
                ...data.options.divisions
              ]}
              paramKey="division"
              value={data.filters.division}
            />
            <LiveUrlSelectFilter
              options={[
                { value: "", label: "All inspection types" },
                ...data.options.inspectionTypes
              ]}
              paramKey="inspectionType"
              value={data.filters.inspectionType}
            />
            <LiveUrlSelectFilter
              options={[
                { value: "", label: "Deficiencies: all" },
                { value: "yes", label: "Deficiencies: yes" },
                { value: "no", label: "Deficiencies: no" }
              ]}
              paramKey="hasDeficiencies"
              value={data.filters.hasDeficiencies === "all" ? "" : data.filters.hasDeficiencies}
            />
            <LiveUrlSelectFilter
              options={[
                { value: "", label: "Reports: all" },
                { value: "yes", label: "Reports: yes" },
                { value: "no", label: "Reports: no" }
              ]}
              paramKey="hasReport"
              value={data.filters.hasReport === "all" ? "" : data.filters.hasReport}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(2,minmax(0,14rem))_auto]">
            <LiveUrlDateFilter paramKey="completedFrom" value={data.filters.completedFrom} />
            <LiveUrlDateFilter paramKey="completedTo" value={data.filters.completedTo} />
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              href="/app/admin/archive"
            >
              Clear filters
            </Link>
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Archive results</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Completed inspection history</h2>
            <p className="mt-2 text-sm text-slate-500">Open any archived inspection to review the snapshot, documents, report packet, and related quote/billing context.</p>
          </div>
          <p className="text-sm text-slate-500">
            Page {data.pagination.page} of {data.pagination.totalPages} • {data.pagination.totalCount} inspection{data.pagination.totalCount === 1 ? "" : "s"}
          </p>
        </div>

        {data.inspections.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              description="No archived inspections matched the current search and filter combination. Clear filters to return to the full archive."
              title="No archived inspections found"
            />
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200/80">
            <div className="hidden grid-cols-[10rem_8rem_minmax(12rem,1fr)_minmax(12rem,1fr)_minmax(10rem,0.9fr)_minmax(10rem,0.9fr)_9rem_7rem_8rem_8rem] gap-4 bg-slate-50 px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 xl:grid">
              <span>Completed</span>
              <span>Inspection #</span>
              <span>Customer</span>
              <span>Site</span>
              <span>Inspection type</span>
              <span>Division</span>
              <span>Technician</span>
              <span>Result</span>
              <span>Report</span>
              <span>Actions</span>
            </div>
            <div className="divide-y divide-slate-200/80">
              {data.inspections.map((inspection) => (
                <div key={inspection.id} className="grid gap-4 px-5 py-5 xl:grid-cols-[10rem_8rem_minmax(12rem,1fr)_minmax(12rem,1fr)_minmax(10rem,0.9fr)_minmax(10rem,0.9fr)_9rem_7rem_8rem_8rem] xl:items-start">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 xl:hidden">Completed</p>
                    <p className="text-sm font-semibold text-slate-950">{format(inspection.completedAt, "MMM d, yyyy")}</p>
                    <p className="mt-1 text-sm text-slate-500">{format(inspection.completedAt, "h:mm a")}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 xl:hidden">Inspection #</p>
                    <p className="text-sm font-semibold text-slate-950">{inspection.inspectionNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 xl:hidden">Customer</p>
                    <p className="text-sm font-semibold text-slate-950">{inspection.customerName}</p>
                    {inspection.quoteNumber ? <p className="mt-1 text-sm text-slate-500">Quote {inspection.quoteNumber}</p> : null}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 xl:hidden">Site</p>
                    <p className="text-sm font-semibold text-slate-950">{inspection.siteName}</p>
                    <p className="mt-1 text-sm text-slate-500">{inspection.siteAddress}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 xl:hidden">Inspection type</p>
                    <p className="text-sm text-slate-700">{inspection.inspectionTypeLabels.join(", ")}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 xl:hidden">Division</p>
                    <p className="text-sm text-slate-700">{inspection.divisions.map(formatDivisionLabel).join(", ")}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 xl:hidden">Technician</p>
                    <p className="text-sm text-slate-700">{inspection.technicianName}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={inspection.resultStatus}
                      tone={getArchiveResultStatusTone({
                        resultStatus: inspection.resultStatus,
                        hasDeficiencies: inspection.hasDeficiencies
                      })}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 xl:hidden">Report</p>
                    <p className="text-sm text-slate-700">{inspection.hasReport ? `${inspection.reportCount} available` : "No report"}</p>
                  </div>
                  <div className="flex items-start">
                    <Link
                      className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      href={`/app/admin/archive/${inspection.id}?from=${encodeURIComponent(buildArchiveHref({ ...currentParams, page: String(data.pagination.page) }))}`}
                    >
                      Open
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.pagination.totalPages > 1 ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Showing {(data.pagination.page - 1) * data.pagination.limit + 1}-{Math.min(data.pagination.page * data.pagination.limit, data.pagination.totalCount)} of {data.pagination.totalCount}
            </p>
            <div className="flex flex-wrap gap-2">
              {data.pagination.page > 1 ? (
                <Link
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  href={buildArchiveHref({ ...currentParams, page: String(data.pagination.page - 1) })}
                >
                  Previous
                </Link>
              ) : null}
              {data.pagination.page < data.pagination.totalPages ? (
                <Link
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  href={buildArchiveHref({ ...currentParams, page: String(data.pagination.page + 1) })}
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </SectionCard>
    </AppPageShell>
  );
}

