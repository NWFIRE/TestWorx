import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getAdminAmendmentManagementData } from "@testworx/lib";

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

type AmendmentManagementItem = Awaited<ReturnType<typeof getAdminAmendmentManagementData>>["items"][number];

const lifecycleOptions = [
  { value: "all", label: "All lifecycle states" },
  { value: "original", label: "Original" },
  { value: "amended", label: "Amended" },
  { value: "replacement", label: "Replacement" },
  { value: "superseded", label: "Superseded" }
] as const;

const lifecycleTones = {
  original: "slate",
  amended: "amber",
  replacement: "blue",
  superseded: "rose"
} as const;

function formatLifecycle(value: string) {
  return value.replaceAll("_", " ");
}

function formatAuditAction(value: string) {
  return value.replaceAll(".", " ").replaceAll("_", " ");
}

function getRelationshipSummary(item: AmendmentManagementItem) {
  if (item.originalAmendment) {
    return {
      label: "Replacement for",
      inspectionId: item.originalAmendment.inspection.id,
      href: `/app/admin/inspections/${item.originalAmendment.inspection.id}`,
      siteName: item.originalAmendment.inspection.site.name,
      scheduledStart: item.originalAmendment.inspection.scheduledStart
    };
  }

  if (item.outgoingAmendment) {
    return {
      label: "Superseded by",
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
  searchParams: Promise<{ lifecycle?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const params = await searchParams;
  const lifecycle = lifecycleOptions.some((option) => option.value === params.lifecycle) ? params.lifecycle : "all";
  const data = await getAdminAmendmentManagementData(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    { lifecycle: lifecycle as "all" | "original" | "amended" | "replacement" | "superseded" }
  );

  return (
    <AppPageShell>
      <PageHeader
        actions={
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            href="/app/admin"
          >
            Back to scheduling
          </Link>
        }
        description="Track original visits, started-work amendments, and replacement scheduling from one operational view without rewriting history."
        eyebrow="Amendment center"
        title="Replacement and superseded visit management"
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(["original", "amended", "replacement", "superseded"] as const).map((key) => (
          <KPIStatCard
            key={key}
            label={formatLifecycle(key)}
            note={`${data.lifecycleCounts[key]} inspection${data.lifecycleCounts[key] === 1 ? "" : "s"} in this lifecycle state.`}
            tone={lifecycleTones[key]}
            value={data.lifecycleCounts[key]}
          />
        ))}
      </section>

      <FilterBar
        description="Use lifecycle filters to keep amendment chains readable without losing the original or replacement context."
        title="Lifecycle filters"
      >
        {lifecycleOptions.map((option) => (
          <FilterChipLink
            active={data.lifecycleFilter === option.value}
            href={option.value === "all" ? "/app/admin/amendments" : `/app/admin/amendments?lifecycle=${option.value}`}
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
              Inspection relationships
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
              Recent amendment activity
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            {data.items.length} inspection record{data.items.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="mt-5 space-y-4">
          {data.items.length === 0 ? (
            <EmptyState
              description="No inspections matched the selected amendment lifecycle filter."
              title="No amendment activity matches these filters"
            />
          ) : (
            data.items.map((inspection: AmendmentManagementItem) => {
              const relationship = getRelationshipSummary(inspection);
              const amendmentReason =
                inspection.originalAmendment?.reason ?? inspection.outgoingAmendment?.reason ?? null;

              return (
                <div
                  key={inspection.id}
                  className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-5 transition hover:border-slate-300 hover:bg-white"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-slate-950">{inspection.site.name}</p>
                        <StatusBadge
                          label={formatLifecycle(inspection.lifecycle)}
                          tone={lifecycleTones[inspection.lifecycle as keyof typeof lifecycleTones] ?? "slate"}
                        />
                      </div>
                      <p className="text-sm text-slate-500">
                        {inspection.customerCompany.name} • {format(inspection.scheduledStart, "MMM d, yyyy h:mm a")}
                      </p>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Visit status
                          </p>
                          <p className="mt-2 text-sm text-slate-700">
                            {(inspection.displayStatus ?? inspection.status).replaceAll("_", " ")}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Assigned: {(inspection.assignedTechnicianNames ?? []).length
                              ? inspection.assignedTechnicianNames.join(", ")
                              : "Shared queue"}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Report activity markers: {inspection.reportActivityCount}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Relationship
                          </p>
                          {relationship ? (
                            <>
                              <p className="mt-2 text-sm text-slate-700">
                                {relationship.label}: {relationship.siteName}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                {format(relationship.scheduledStart, "MMM d, yyyy h:mm a")}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                Inspection id: {relationship.inspectionId}
                              </p>
                            </>
                          ) : (
                            <p className="mt-2 text-sm text-slate-700">
                              No linked replacement or superseding visit yet.
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Amendment reason
                          </p>
                          <p className="mt-2 text-sm text-slate-700">
                            {amendmentReason ?? "No amendment reason recorded on this inspection."}
                          </p>
                          {(inspection.originalAmendment?.createdAt ?? inspection.outgoingAmendment?.createdAt) ? (
                            <p className="mt-2 text-xs text-slate-400">
                              Logged{" "}
                              {format(
                                inspection.originalAmendment?.createdAt
                                  ?? inspection.outgoingAmendment?.createdAt
                                  ?? inspection.createdAt,
                                "MMM d, yyyy h:mm a"
                              )}
                            </p>
                          ) : null}
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Latest audit note
                          </p>
                          {inspection.latestAuditEntry ? (
                            <>
                              <p className="mt-2 text-sm text-slate-700">
                                {formatAuditAction(inspection.latestAuditEntry.action)}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {format(inspection.latestAuditEntry.createdAt, "MMM d, yyyy h:mm a")}
                              </p>
                            </>
                          ) : (
                            <p className="mt-2 text-sm text-slate-700">
                              No amendment-related audit entries yet.
                            </p>
                          )}
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
                      {relationship ? (
                        <Link
                          className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                          href={relationship.href}
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
