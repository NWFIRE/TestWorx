/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { addMonths, format } from "date-fns";
import { useMemo, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { LiveUrlSearchInput } from "@/app/live-url-search-input";
import { ClaimButton } from "./claim-button";
import { DispatchNotesCard } from "./dispatch-notes-card";
import { InspectionCustomerContactCard } from "./inspection-customer-contact-card";
import { isTechnicianActionableSchedulingStatus } from "./mobile-inspection-workspace";
import { MobileInspectionPdfAccessCard } from "./mobile-inspection-pdf-access-card";
import { useOfflineScreenSnapshot } from "./offline/use-offline-screen-snapshot";
import { PriorityInspectionBadge } from "./priority-inspection-badge";
import { toDateValue } from "./date-value";

type WorkFilter = "today" | "upcoming" | "overdue" | "open" | "claimable";
type TechnicianMonthGroup = {
  key: string;
  title: string;
  inspections: any[];
  defaultOpen: boolean;
};

function firstOpenTask(inspection: any) {
  return inspection.tasks.find((task: any) => task.report?.status !== "finalized" && isTechnicianActionableSchedulingStatus(task.schedulingStatus))
    ?? inspection.tasks.find((task: any) => isTechnicianActionableSchedulingStatus(task.schedulingStatus))
    ?? null;
}

function inspectionHref(inspection: any) {
  const task = firstOpenTask(inspection);
  return task ? `/app/tech/reports/${inspection.id}/${task.id}` : null;
}

function hasAttachedPdfs(inspection: any) {
  return (inspection.documents?.length ?? 0) > 0 || (inspection.attachments?.length ?? 0) > 0;
}

function isPlaceholderMonthAnchor(task: any, dueDate: Date) {
  return typeof task.dueMonth === "string" && dueDate.toISOString().slice(0, 10) === `${task.dueMonth}-01`;
}

function getHardDueDate(inspection: any) {
  const dates = (inspection.tasks ?? [])
    .map((task: any) => {
      if (!task.dueDate) {
        return null;
      }
      const dueDate = toDateValue(task.dueDate);
      return isPlaceholderMonthAnchor(task, dueDate) ? null : dueDate;
    })
    .filter(Boolean) as Date[];

  return dates.sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
}

function formatTechnicianWorkTiming(inspection: any) {
  const hardDueDate = getHardDueDate(inspection);
  if (hardDueDate) {
    return `Hard date ${format(hardDueDate, "MMM d")}`;
  }

  const dueMonth = (inspection.tasks ?? []).find((task: any) => typeof task.dueMonth === "string" && task.dueMonth)?.dueMonth;
  if (dueMonth) {
    return `Due ${format(toDateValue(`${dueMonth}-01T00:00:00`), "MMMM yyyy")}`;
  }

  return `Due ${format(toDateValue(inspection.scheduledStart), "MMMM yyyy")}`;
}

function getInspectionDueMonthKey(inspection: any) {
  const dueMonth = (inspection.tasks ?? []).find((task: any) => typeof task.dueMonth === "string" && task.dueMonth)?.dueMonth;
  const scheduledMonthKey = format(toDateValue(inspection.scheduledStart), "yyyy-MM");
  if (typeof dueMonth === "string" && /^\d{4}-\d{2}$/.test(dueMonth)) {
    return dueMonth < scheduledMonthKey ? scheduledMonthKey : dueMonth;
  }

  const hardDueDate = getHardDueDate(inspection);
  const hardDueMonthKey = hardDueDate ? format(hardDueDate, "yyyy-MM") : null;
  return hardDueMonthKey && hardDueMonthKey > scheduledMonthKey ? hardDueMonthKey : scheduledMonthKey;
}

function formatMonthTitle(monthKey: string) {
  return format(toDateValue(`${monthKey}-01T00:00:00`), "MMMM yyyy");
}

function groupTechnicianInspectionsByMonth(inspections: any[], query: string): TechnicianMonthGroup[] {
  const currentMonthKey = format(new Date(), "yyyy-MM");
  const nextMonthKey = format(addMonths(new Date(), 1), "yyyy-MM");
  const groups = new Map<string, any[]>();

  for (const inspection of inspections) {
    const dueMonthKey = getInspectionDueMonthKey(inspection);

    const groupKey = inspection.displayStatus === "past_due" || dueMonthKey < currentMonthKey
      ? "past_due"
      : dueMonthKey;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), inspection]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => {
      if (left === "past_due") {
        return -1;
      }
      if (right === "past_due") {
        return 1;
      }
      return left.localeCompare(right);
    })
    .map(([key, groupInspections]) => ({
      key,
      title: key === "past_due" ? "Past Due" : formatMonthTitle(key),
      inspections: groupInspections,
      defaultOpen: Boolean(query) || key === "past_due" || key === currentMonthKey || key === nextMonthKey
    }));
}

function shouldIgnoreCardNavigation(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("a, button, input, select, textarea, label"));
}

function matchesQuery(inspection: any, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    inspection.site?.name,
    inspection.customerCompany?.name,
    inspection.primaryTitle,
    inspection.secondaryTitle,
    inspection.locationLabel,
    ...inspection.tasks.map((task: any) => task.displayLabel ?? task.inspectionType.replaceAll("_", " "))
  ].filter(Boolean).join(" ").toLowerCase();

  return haystack.includes(query);
}

function uniqueInspections<T extends { id?: string | null }>(inspections: T[] = []) {
  const seen = new Set<string>();
  return inspections.filter((inspection) => {
    if (!inspection.id) {
      return true;
    }
    if (seen.has(inspection.id)) {
      return false;
    }
    seen.add(inspection.id);
    return true;
  });
}

function inspectionCardClassName(inspection: any) {
  return inspection.isPriority
    ? "cursor-pointer rounded-[1.75rem] border border-amber-300 bg-amber-50/70 p-4 shadow-[0_16px_38px_rgba(217,119,6,0.12)] transition hover:border-amber-400 hover:shadow-[0_18px_42px_rgba(217,119,6,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
    : "cursor-pointer rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition hover:border-[color:var(--tenant-primary-border)] hover:shadow-[0_16px_36px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tenant-primary)]";
}

function passiveInspectionCardClassName(inspection: any) {
  return inspection.isPriority
    ? "rounded-[1.75rem] border border-amber-300 bg-amber-50/70 p-4 shadow-[0_16px_38px_rgba(217,119,6,0.12)]"
    : "rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]";
}

function TechnicianMonthAccordion({
  groups,
  emptyText,
  renderInspection
}: {
  groups: TechnicianMonthGroup[];
  emptyText: string;
  renderInspection: (inspection: any) => ReactNode;
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <details
          className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.05)]"
          key={group.key}
          open={group.defaultOpen}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-slate-50 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <div>
              <h3 className="text-base font-semibold text-slate-950">{group.title}</h3>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {group.inspections.length} inspection{group.inspections.length === 1 ? "" : "s"}
              </p>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              Open / Close
            </span>
          </summary>
          <div className="space-y-3 border-t border-slate-100 bg-slate-50/40 p-3">
            {group.inspections.map(renderInspection)}
          </div>
        </details>
      ))}
    </div>
  );
}

export function TechnicianWorkScreen({ initialData }: { initialData: any }) {
  const snapshot = useOfflineScreenSnapshot("technician-work", initialData);
  const searchParams = useSearchParams();
  const router = useRouter();
  const dashboard = useMemo(() => {
    if (!snapshot?.dashboard) {
      return null;
    }

    return {
      ...snapshot.dashboard,
      assigned: uniqueInspections(snapshot.dashboard.assigned ?? []),
      today: uniqueInspections(snapshot.dashboard.today ?? []),
      unassigned: uniqueInspections(snapshot.dashboard.unassigned ?? [])
    };
  }, [snapshot]);

  const filter = (searchParams.get("filter") as WorkFilter | null) ?? "today";
  const query = (searchParams.get("query") ?? "").trim().toLowerCase();
  const claimableWorkCount = dashboard?.unassigned?.length ?? 0;

  const filtered = useMemo(() => {
    if (!dashboard) {
      return { assigned: [], claimable: [], open: [] };
    }

    if (filter === "open") {
      return {
        assigned: dashboard.assigned
          .filter((inspection: any) => inspection.tasks.some((task: any) => task.report?.status !== "finalized" && isTechnicianActionableSchedulingStatus(task.schedulingStatus)))
          .filter((inspection: any) => matchesQuery(inspection, query)),
        claimable: [],
        open: []
      };
    }

    if (filter === "claimable") {
      return {
        assigned: [],
        claimable: dashboard.unassigned.filter((inspection: any) => matchesQuery(inspection, query)),
        open: []
      };
    }

    const todayKey = format(new Date(), "yyyy-MM-dd");
    const assignedSource =
      filter === "today"
        ? dashboard.today
        : filter === "upcoming"
          ? dashboard.assigned.filter((inspection: any) => !dashboard.today.some((todayInspection: any) => todayInspection.id === inspection.id))
          : dashboard.assigned.filter((inspection: any) => inspection.displayStatus === "past_due");

    const claimableSource =
      filter === "today"
        ? dashboard.unassigned.filter((inspection: any) => format(toDateValue(inspection.scheduledStart), "yyyy-MM-dd") === todayKey)
        : filter === "upcoming"
          ? dashboard.unassigned.filter((inspection: any) => format(toDateValue(inspection.scheduledStart), "yyyy-MM-dd") > todayKey)
          : dashboard.unassigned.filter((inspection: any) => inspection.displayStatus === "past_due");

    return {
      assigned: assignedSource.filter((inspection: any) => matchesQuery(inspection, query)),
      claimable: claimableSource.filter((inspection: any) => matchesQuery(inspection, query)),
      open: []
    };
  }, [dashboard, filter, query]);
  const assignedMonthGroups = useMemo(() => groupTechnicianInspectionsByMonth(filtered.assigned, query), [filtered.assigned, query]);
  const claimableMonthGroups = useMemo(() => groupTechnicianInspectionsByMonth(filtered.claimable, query), [filtered.claimable, query]);

  if (!snapshot) {
    return <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading work queue…</div>;
  }

  function openInspectionFromCard(href: string | null, event: MouseEvent<HTMLElement>) {
    if (!href || shouldIgnoreCardNavigation(event.target)) {
      return;
    }

    router.push(href);
  }

  function openInspectionFromKeyboard(href: string | null, event: KeyboardEvent<HTMLElement>) {
    if (!href || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    router.push(href);
  }

  return (
    <div className="space-y-5 pb-4">
      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_14px_35px_rgba(15,23,42,0.06)]">
        <form className="space-y-4">
          <LiveUrlSearchInput
            initialValue={query}
            name="query"
            paramKey="query"
            placeholder="Search by site, customer, or job type"
          />
          <div className="grid grid-cols-2 gap-2">
            {[
              ["today", "Today"],
              ["upcoming", "Upcoming"],
              ["overdue", "Overdue"],
              ["open", "Open"],
              ["claimable", "Claimable"]
            ].map(([value, label]) => {
              const isSelected = filter === value;
              const showClaimableBadge = value === "claimable" && claimableWorkCount > 0;

              return (
                <button
                  key={value}
                  aria-label={showClaimableBadge ? `${label}, ${claimableWorkCount} claimable inspections available` : label}
                  className={isSelected
                    ? "relative flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--tenant-primary)] px-4 py-2 text-sm font-semibold text-[var(--tenant-primary-contrast)]"
                    : "relative flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600"}
                  name="filter"
                  type="submit"
                  value={value}
                >
                  <span>{label}</span>
                  {showClaimableBadge ? (
                    <span
                      className={isSelected
                        ? "inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-bold leading-none text-[var(--tenant-primary)] shadow-sm"
                        : "inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--tenant-primary)] px-1.5 text-[11px] font-bold leading-none text-[var(--tenant-primary-contrast)] shadow-sm"}
                    >
                      {claimableWorkCount > 99 ? "99+" : claimableWorkCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </form>
      </section>

      {filter === "open" ? (
        <section className="space-y-3">
          <TechnicianMonthAccordion
            emptyText="No open assigned work matches this filter."
            groups={assignedMonthGroups}
            renderInspection={(inspection: any) => {
              const href = inspectionHref(inspection);
              return (
                <article
                  aria-label={`${inspection.isPriority ? "Priority inspection. " : ""}Open ${inspection.primaryTitle}`}
                  className={inspectionCardClassName(inspection)}
                  key={inspection.id}
                  onClick={(event) => openInspectionFromCard(href, event)}
                  onKeyDown={(event) => openInspectionFromKeyboard(href, event)}
                  role={href ? "link" : undefined}
                  tabIndex={href ? 0 : undefined}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {inspection.isPriority ? <div className="mb-2"><PriorityInspectionBadge compact /></div> : null}
                      <p className="text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
                      {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
                      {inspection.locationLabel ? <p className="mt-1 text-sm leading-5 text-slate-600">{inspection.locationLabel}</p> : null}
                    </div>
                    <span className="rounded-full border border-[color:var(--tenant-primary-border)] bg-[var(--tenant-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--tenant-primary)]">
                      Open
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    {formatTechnicianWorkTiming(inspection)}
                  </p>
                  <DispatchNotesCard className="mt-4" compact notes={inspection.notes} />
                  <div className="mt-4">
                    <InspectionCustomerContactCard
                      compact
                      contactName={inspection.customerCompany?.contactName}
                      email={inspection.customerCompany?.billingEmail}
                      phone={inspection.customerCompany?.phone}
                      serviceAddress={inspection.locationLabel}
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
                </article>
              );
            }}
          />
        </section>
      ) : filter === "claimable" ? (
        <section className="space-y-3">
          <TechnicianMonthAccordion
            emptyText="No claimable work matches this filter."
            groups={claimableMonthGroups}
            renderInspection={(inspection: any) => (
              <article className={passiveInspectionCardClassName(inspection)} key={inspection.id}>
                {inspection.isPriority ? <div className="mb-2"><PriorityInspectionBadge compact /></div> : null}
                <p className="text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
                {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
                {inspection.locationLabel ? <p className="mt-1 text-sm leading-5 text-slate-600">{inspection.locationLabel}</p> : null}
                <p className="mt-3 text-sm text-slate-600">{inspection.tasks.map((task: any) => task.displayLabel ?? task.inspectionType.replaceAll("_", " ")).join(", ")}</p>
                <DispatchNotesCard className="mt-4" compact notes={inspection.notes} />
                <div className="mt-4">
                  <InspectionCustomerContactCard
                    compact
                    contactName={inspection.customerCompany?.contactName}
                    email={inspection.customerCompany?.billingEmail}
                    phone={inspection.customerCompany?.phone}
                    serviceAddress={inspection.locationLabel}
                  />
                </div>
                <div className="mt-4">
                  <ClaimButton inspectionId={inspection.id} />
                </div>
              </article>
            )}
          />
        </section>
      ) : (
        <div className="space-y-5">
          <section className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Assigned</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Your field queue</h2>
            </div>
            <TechnicianMonthAccordion
              emptyText="No assigned work matches this filter."
              groups={assignedMonthGroups}
              renderInspection={(inspection: any) => {
                const action = firstOpenTask(inspection);
                const href = inspectionHref(inspection);
                return (
                  <article
                    aria-label={`${inspection.isPriority ? "Priority inspection. " : ""}Open ${inspection.primaryTitle}`}
                    className={inspectionCardClassName(inspection)}
                    key={inspection.id}
                    onClick={(event) => openInspectionFromCard(href, event)}
                    onKeyDown={(event) => openInspectionFromKeyboard(href, event)}
                    role={href ? "link" : undefined}
                    tabIndex={href ? 0 : undefined}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {inspection.isPriority ? <div className="mb-2"><PriorityInspectionBadge compact /></div> : null}
                        <p className="truncate text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
                        {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
                        {inspection.locationLabel ? <p className="mt-1 text-sm leading-5 text-slate-600">{inspection.locationLabel}</p> : null}
                      </div>
                      <span className="inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                        {formatTechnicianWorkTiming(inspection)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">{inspection.tasks.map((task: any) => task.displayLabel ?? task.inspectionType.replaceAll("_", " ")).join(", ")}</p>
                    <DispatchNotesCard className="mt-4" compact notes={inspection.notes} />
                    <div className="mt-4">
                      <InspectionCustomerContactCard
                        compact
                        contactName={inspection.customerCompany?.contactName}
                        email={inspection.customerCompany?.billingEmail}
                        phone={inspection.customerCompany?.phone}
                        serviceAddress={inspection.locationLabel}
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
                      {action ? (
                        <Link className="flex min-h-12 items-center justify-center rounded-2xl bg-[var(--tenant-primary)] px-4 py-3 text-sm font-semibold text-[var(--tenant-primary-contrast)]" href={`/app/tech/reports/${inspection.id}/${action.id}`}>
                          {action.report?.status === "draft" || action.report?.status === "submitted" ? "Resume inspection" : "Start inspection"}
                        </Link>
                      ) : null}
                      {href ? (
                        <Link className="flex min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700" href={href}>
                          Open inspection
                        </Link>
                      ) : null}
                    </div>
                  </article>
                );
              }}
            />
          </section>

          <section className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Claimable</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Shared queue</h2>
            </div>
            <TechnicianMonthAccordion
              emptyText="No claimable work matches this filter."
              groups={claimableMonthGroups}
              renderInspection={(inspection: any) => (
                <article className={passiveInspectionCardClassName(inspection)} key={inspection.id}>
                  {inspection.isPriority ? <div className="mb-2"><PriorityInspectionBadge compact /></div> : null}
                  <p className="text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
                  {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
                  {inspection.locationLabel ? <p className="mt-1 text-sm leading-5 text-slate-600">{inspection.locationLabel}</p> : null}
                  <p className="mt-3 text-sm text-slate-600">{inspection.tasks.map((task: any) => task.displayLabel ?? task.inspectionType.replaceAll("_", " ")).join(", ")}</p>
                  <DispatchNotesCard className="mt-4" compact notes={inspection.notes} />
                  <div className="mt-4">
                    <InspectionCustomerContactCard
                      compact
                      contactName={inspection.customerCompany?.contactName}
                      email={inspection.customerCompany?.billingEmail}
                      phone={inspection.customerCompany?.phone}
                      serviceAddress={inspection.locationLabel}
                    />
                  </div>
                  <div className="mt-4">
                    <ClaimButton inspectionId={inspection.id} />
                  </div>
                </article>
              )}
            />
          </section>
        </div>
      )}
    </div>
  );
}
