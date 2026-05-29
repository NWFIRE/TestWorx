import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { formatTimesheetHours, getEmployeeTimesheet } from "@testworx/lib/server/index";

import { clockInAction, clockOutAction } from "../../timesheets/actions";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

function buildWeekHref(weekStartInput: string, offsetDays: number) {
  const date = new Date(`${weekStartInput}T00:00:00`);
  date.setDate(date.getDate() + offsetDays);
  const value = date.toISOString().slice(0, 10);
  return `/app/tech/timesheets?week=${value}`;
}

export default async function TechnicianTimesheetsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (session.user.role !== "technician") {
    redirect("/app");
  }

  const params = searchParams ? await searchParams : {};
  const timesheet = await getEmployeeTimesheet(
    {
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId,
      allowances: session.user.allowances ?? null
    },
    readParam(params, "week")
  );

  return (
    <main className="space-y-5 pb-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-panel">
        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--tenant-primary)]">Timesheets</p>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-[-0.04em] text-ink">{timesheet.currentStatus}</h1>
            <p className="mt-2 text-sm font-semibold text-slate-600">{timesheet.currentTimeLabel}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Today clock-in</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{timesheet.todayClockInLabel}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Worked today</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{formatTimesheetHours(timesheet.todayWorkedMinutes)} hrs</p>
            </div>
          </div>
        </div>

        {timesheet.activeEntryIsFromPriorDay ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            You have an open time entry from a previous day. Clock out when finished, or ask an admin to correct it.
          </div>
        ) : null}

        <div className="mt-5">
          {timesheet.activeEntry ? (
            <form action={clockOutAction}>
              <button className="min-h-14 w-full rounded-2xl bg-slate-950 px-6 py-4 text-base font-bold text-white shadow-lg transition hover:bg-slate-800" type="submit">
                Clock Out
              </button>
            </form>
          ) : (
            <form action={clockInAction}>
              <button className="min-h-14 w-full rounded-2xl bg-[var(--tenant-primary)] px-6 py-4 text-base font-bold text-white shadow-lg transition hover:brightness-95" type="submit">
                Clock In
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-panel">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">My week</p>
            <h2 className="mt-1 text-2xl font-bold tracking-[-0.035em] text-ink">
              {timesheet.rows[0]?.label.split(" • ")[1]} - {timesheet.rows[6]?.label.split(" • ")[1]}
            </h2>
          </div>
          <div className="flex gap-2">
            <Link className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50" href={buildWeekHref(timesheet.weekStartInput, -7)}>
              Previous
            </Link>
            <Link className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50" href={buildWeekHref(timesheet.weekStartInput, 7)}>
              Next
            </Link>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr] bg-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-600 md:grid">
            <span>Date</span>
            <span>Clock In</span>
            <span>Clock Out</span>
            <span>Gross</span>
            <span>Lunch</span>
            <span>Net</span>
          </div>
          <div className="divide-y divide-slate-200">
            {timesheet.rows.map((row) => (
              <div className="grid gap-3 px-4 py-4 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr] md:items-center" key={row.dateKey}>
                <div>
                  <p className="font-bold text-slate-950">{row.label}</p>
                  {row.notes ? <p className="mt-1 text-sm text-slate-600">{row.notes}</p> : null}
                </div>
                <p className="text-sm font-semibold text-slate-700"><span className="md:hidden">Clock In: </span>{row.clockInLabel}</p>
                <p className="text-sm font-semibold text-slate-700"><span className="md:hidden">Clock Out: </span>{row.clockOutLabel}</p>
                <p className="text-sm font-semibold text-slate-700"><span className="md:hidden">Gross: </span>{formatTimesheetHours(row.grossMinutes)}</p>
                <p className="text-sm font-semibold text-slate-700"><span className="md:hidden">Lunch: </span>{formatTimesheetHours(row.lunchDeductionMinutes)}</p>
                <p className="text-sm font-bold text-slate-950"><span className="md:hidden">Net: </span>{formatTimesheetHours(row.netMinutes)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Gross</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{formatTimesheetHours(timesheet.totals.grossMinutes)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Lunch</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{formatTimesheetHours(timesheet.totals.lunchDeductionMinutes)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Net</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{formatTimesheetHours(timesheet.totals.netMinutes)}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
