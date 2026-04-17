import type { AcceptanceTestViewModel } from "../types/acceptanceTest";

export function AcceptanceReportHeader({ model }: { model: AcceptanceTestViewModel }) {
  return (
    <section className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">TradeWorx acceptance report</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-[2.5rem]">{model.report.title}</h1>
          <p className="mt-2 text-sm font-medium uppercase tracking-[0.18em] text-slate-500">{model.report.standard}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50/80 px-5 py-4 text-sm text-slate-700 lg:min-w-[260px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
              {model.report.status ?? "Draft"}
            </span>
          </div>
          {model.report.reportId ? <p className="mt-3">Report ID: <span className="font-semibold text-slate-950">{model.report.reportId}</span></p> : null}
          {model.report.completionDate ? <p className="mt-2">Completed: <span className="font-semibold text-slate-950">{model.report.completionDate}</span></p> : null}
          {model.report.assignedTo ? <p className="mt-2">Assigned to: <span className="font-semibold text-slate-950">{model.report.assignedTo}</span></p> : null}
        </div>
      </div>
    </section>
  );
}
