import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { formatTimesheetHours, getAdminTimesheetWorkspace } from "@testworx/lib/server/index";

import { AppPageShell, FilterBar, KPIStatCard, PageHeader, SectionCard, StatusBadge } from "../operations-ui";
import { correctTimeEntryAction } from "../../timesheets/actions";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

function buildWeekHref(weekStartInput: string, offsetDays: number, employeeId?: string | null) {
  const date = new Date(`${weekStartInput}T00:00:00`);
  date.setDate(date.getDate() + offsetDays);
  const nextWeek = date.toISOString().slice(0, 10);
  const params = new URLSearchParams({ week: nextWeek });
  if (employeeId) {
    params.set("employeeId", employeeId);
  }
  return `/app/admin/timesheets?${params.toString()}`;
}

function toDateTimeLocal(value: Date | null) {
  if (!value) {
    return "";
  }
  const pad = (input: number) => input.toString().padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export default async function AdminTimesheetsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const params = searchParams ? await searchParams : {};
  const workspace = await getAdminTimesheetWorkspace(
    {
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId,
      allowances: session.user.allowances ?? null
    },
    {
      week: readParam(params, "week"),
      employeeId: readParam(params, "employeeId")
    }
  );

  return (
    <AppPageShell>
      <PageHeader
        actions={
          <div className="flex gap-2">
            <Link className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50" href={buildWeekHref(workspace.filters.weekStartInput, -7, workspace.filters.employeeId)}>
              Previous week
            </Link>
            <Link className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50" href={buildWeekHref(workspace.filters.weekStartInput, 7, workspace.filters.employeeId)}>
              Next week
            </Link>
          </div>
        }
        eyebrow="Timesheets"
        title="Weekly employee time"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <KPIStatCard label="Gross hours" value={formatTimesheetHours(workspace.totals.grossMinutes)} tone="blue" />
        <KPIStatCard label="Lunch deductions" value={formatTimesheetHours(workspace.totals.lunchDeductionMinutes)} tone="amber" />
        <KPIStatCard label="Net payable hours" value={formatTimesheetHours(workspace.totals.netMinutes)} tone="emerald" />
      </div>

      <FilterBar title="Timesheet filters">
        <form className="flex w-full flex-wrap gap-3" action="/app/admin/timesheets">
          <label className="min-w-[12rem] flex-1">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Week of</span>
            <input
              className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-[var(--tenant-primary)] focus:ring-4 focus:ring-blue-100"
              defaultValue={workspace.filters.weekStartInput}
              name="week"
              type="date"
            />
          </label>
          <label className="min-w-[16rem] flex-1">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Employee</span>
            <select
              className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-[var(--tenant-primary)] focus:ring-4 focus:ring-blue-100"
              defaultValue={workspace.filters.employeeId}
              name="employeeId"
            >
              <option value="">All employees</option>
              {workspace.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>
          <button className="mt-6 min-h-12 rounded-2xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800" type="submit">
            Apply
          </button>
        </form>
      </FilterBar>

      <div className="space-y-5">
        {workspace.employeeSummaries.map((summary) => (
          <SectionCard key={summary.employee.id}>
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-[-0.035em] text-ink">{summary.employee.name}</h2>
                <p className="mt-1 text-sm font-semibold text-slate-600">{summary.employee.email}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge label={summary.employee.role.replaceAll("_", " ")} tone="slate" />
                <StatusBadge label={`${formatTimesheetHours(summary.totals.netMinutes)} net hrs`} tone="emerald" />
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
              <div className="hidden grid-cols-[1.4fr_0.8fr_0.8fr_0.7fr_0.7fr_0.7fr_1.4fr] bg-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-600 lg:grid">
                <span>Date</span>
                <span>Clock In</span>
                <span>Clock Out</span>
                <span>Gross</span>
                <span>Lunch</span>
                <span>Net</span>
                <span>Notes</span>
              </div>
              <div className="divide-y divide-slate-200">
                {summary.rows.map((row) => (
                  <div key={row.dateKey}>
                    <div className="grid gap-3 px-4 py-4 lg:grid-cols-[1.4fr_0.8fr_0.8fr_0.7fr_0.7fr_0.7fr_1.4fr] lg:items-center">
                      <p className="font-bold text-slate-950">{row.label}</p>
                      <p className="text-sm font-semibold text-slate-700"><span className="lg:hidden">Clock In: </span>{row.clockInLabel}</p>
                      <p className="text-sm font-semibold text-slate-700"><span className="lg:hidden">Clock Out: </span>{row.clockOutLabel}</p>
                      <p className="text-sm font-semibold text-slate-700"><span className="lg:hidden">Gross: </span>{formatTimesheetHours(row.grossMinutes)}</p>
                      <p className="text-sm font-semibold text-slate-700"><span className="lg:hidden">Lunch: </span>{formatTimesheetHours(row.lunchDeductionMinutes)}</p>
                      <p className="text-sm font-bold text-slate-950"><span className="lg:hidden">Net: </span>{formatTimesheetHours(row.netMinutes)}</p>
                      <p className="text-sm text-slate-600">{row.notes || "—"}</p>
                    </div>

                    {row.entries.length > 0 ? (
                      <div className="space-y-3 bg-slate-50 px-4 py-4">
                        {row.entries.map((entry) => (
                          <details className="rounded-2xl border border-slate-200 bg-white p-4" key={entry.id}>
                            <summary className="cursor-pointer text-sm font-bold text-slate-800">
                              Correct entry • {entry.clockInLabel} - {entry.clockOutLabel} • {formatTimesheetHours(entry.netMinutes)} net hrs
                            </summary>
                            <form action={correctTimeEntryAction} className="mt-4 grid gap-3 lg:grid-cols-2">
                              <input name="timeEntryId" type="hidden" value={entry.id} />
                              <label>
                                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Clock in</span>
                                <input className="min-h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm font-semibold" defaultValue={toDateTimeLocal(entry.clockInAt)} name="clockInAt" type="datetime-local" />
                              </label>
                              <label>
                                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Clock out</span>
                                <input className="min-h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm font-semibold" defaultValue={toDateTimeLocal(entry.clockOutAt)} name="clockOutAt" required type="datetime-local" />
                              </label>
                              <label className="lg:col-span-2">
                                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Notes</span>
                                <input className="min-h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm font-semibold" defaultValue={entry.notes ?? ""} name="notes" type="text" />
                              </label>
                              <label className="lg:col-span-2">
                                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Correction reason</span>
                                <input className="min-h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm font-semibold" name="correctionReason" required type="text" />
                              </label>
                              <button className="min-h-11 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white lg:col-span-2" type="submit">
                                Save correction
                              </button>
                            </form>
                          </details>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        ))}
      </div>
    </AppPageShell>
  );
}
