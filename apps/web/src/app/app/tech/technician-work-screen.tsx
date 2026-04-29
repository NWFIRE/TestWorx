/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { format } from "date-fns";
import { useMemo, type KeyboardEvent, type MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ClaimButton } from "./claim-button";
import { InspectionCustomerContactCard } from "./inspection-customer-contact-card";
import { isTechnicianActionableSchedulingStatus } from "./mobile-inspection-workspace";
import { MobileInspectionPdfAccessCard } from "./mobile-inspection-pdf-access-card";
import { useOfflineScreenSnapshot } from "./offline/use-offline-screen-snapshot";
import { toDateValue } from "./date-value";

type WorkFilter = "today" | "upcoming" | "overdue" | "open" | "claimable";

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
    ...inspection.tasks.map((task: any) => task.displayLabel ?? task.inspectionType.replaceAll("_", " "))
  ].filter(Boolean).join(" ").toLowerCase();

  return haystack.includes(query);
}

export function TechnicianWorkScreen({ initialData }: { initialData: any }) {
  const snapshot = useOfflineScreenSnapshot("technician-work", initialData);
  const searchParams = useSearchParams();
  const router = useRouter();

  const filter = (searchParams.get("filter") as WorkFilter | null) ?? "today";
  const query = (searchParams.get("query") ?? "").trim().toLowerCase();
  const claimableWorkCount = snapshot?.dashboard?.unassigned?.length ?? 0;

  const filtered = useMemo(() => {
    if (!snapshot) {
      return { assigned: [], claimable: [], open: [] };
    }

    const dashboard = snapshot.dashboard;
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
  }, [filter, query, snapshot]);

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
          <input
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-[15px] text-slate-900 outline-none transition focus:border-[var(--tenant-primary)]/30 focus:bg-white"
            defaultValue={query}
            name="query"
            placeholder="Search by site, customer, or job type"
            type="search"
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
          {filtered.assigned.length > 0 ? filtered.assigned.map((inspection: any) => {
            const href = inspectionHref(inspection);
            return (
              <article
                aria-label={`Open ${inspection.primaryTitle}`}
                className="cursor-pointer rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition hover:border-[color:var(--tenant-primary-border)] hover:shadow-[0_16px_36px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tenant-primary)]"
                key={inspection.id}
                onClick={(event) => openInspectionFromCard(href, event)}
                onKeyDown={(event) => openInspectionFromKeyboard(href, event)}
                role={href ? "link" : undefined}
                tabIndex={href ? 0 : undefined}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
                    {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
                  </div>
                  <span className="rounded-full border border-[color:var(--tenant-primary-border)] bg-[var(--tenant-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--tenant-primary)]">
                    Open
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  {formatTechnicianWorkTiming(inspection)}
                </p>
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
          }) : (
            <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
              No open assigned work matches this filter.
            </div>
          )}
        </section>
      ) : filter === "claimable" ? (
        <section className="space-y-3">
          {filtered.claimable.length > 0 ? filtered.claimable.map((inspection: any) => (
            <article className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" key={inspection.id}>
              <p className="text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
              {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
              <p className="mt-3 text-sm text-slate-600">{inspection.tasks.map((task: any) => task.displayLabel ?? task.inspectionType.replaceAll("_", " ")).join(", ")}</p>
              <div className="mt-4">
                <InspectionCustomerContactCard
                  compact
                  contactName={inspection.customerCompany?.contactName}
                  email={inspection.customerCompany?.billingEmail}
                  phone={inspection.customerCompany?.phone}
                />
              </div>
              <div className="mt-4">
                <ClaimButton inspectionId={inspection.id} />
              </div>
            </article>
          )) : (
            <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
              No claimable work matches this filter.
            </div>
          )}
        </section>
      ) : (
        <div className="space-y-5">
          <section className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Assigned</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Your field queue</h2>
            </div>
            {filtered.assigned.length > 0 ? filtered.assigned.map((inspection: any) => {
              const action = firstOpenTask(inspection);
              const href = inspectionHref(inspection);
              return (
                <article
                  aria-label={`Open ${inspection.primaryTitle}`}
                  className="cursor-pointer rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition hover:border-[color:var(--tenant-primary-border)] hover:shadow-[0_16px_36px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tenant-primary)]"
                  key={inspection.id}
                  onClick={(event) => openInspectionFromCard(href, event)}
                  onKeyDown={(event) => openInspectionFromKeyboard(href, event)}
                  role={href ? "link" : undefined}
                  tabIndex={href ? 0 : undefined}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
                      {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
                    </div>
                    <span className="inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                      {formatTechnicianWorkTiming(inspection)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{inspection.tasks.map((task: any) => task.displayLabel ?? task.inspectionType.replaceAll("_", " ")).join(", ")}</p>
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
            }) : (
              <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
                No assigned work matches this filter.
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Claimable</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Shared queue</h2>
            </div>
            {filtered.claimable.length > 0 ? filtered.claimable.map((inspection: any) => (
              <article className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" key={inspection.id}>
                <p className="text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
                {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
                <p className="mt-3 text-sm text-slate-600">{inspection.tasks.map((task: any) => task.displayLabel ?? task.inspectionType.replaceAll("_", " ")).join(", ")}</p>
                <div className="mt-4">
                  <InspectionCustomerContactCard
                    compact
                    contactName={inspection.customerCompany?.contactName}
                    email={inspection.customerCompany?.billingEmail}
                    phone={inspection.customerCompany?.phone}
                  />
                </div>
                <div className="mt-4">
                  <ClaimButton inspectionId={inspection.id} />
                </div>
              </article>
            )) : (
              <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
                No claimable work matches this filter.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
