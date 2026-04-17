import type { AcceptanceTestViewModel } from "../types/acceptanceTest";

function toneClasses(result: AcceptanceTestViewModel["report"]["result"]) {
  if (result === "Pass") {
    return "border-emerald-200 bg-emerald-50/70 text-emerald-900";
  }
  if (result === "Fail") {
    return "border-rose-200 bg-rose-50/70 text-rose-900";
  }
  return "border-amber-200 bg-amber-50/70 text-amber-900";
}

export function AcceptanceOutcomeHero({ model }: { model: AcceptanceTestViewModel }) {
  return (
    <section className={`rounded-[30px] border p-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)] ${toneClasses(model.report.result)}`}>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-70">Acceptance Outcome</p>
          <p className="mt-3 text-5xl font-semibold tracking-[-0.07em]">{model.report.result}</p>
          <p className="mt-4 max-w-2xl text-sm leading-7">{model.report.narrative}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <div className="rounded-3xl border border-white/40 bg-white/70 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">Total Tests</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{model.summary.total}</p>
          </div>
          <div className="rounded-3xl border border-white/40 bg-white/70 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">Passed</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{model.summary.passed}</p>
          </div>
          <div className="rounded-3xl border border-white/40 bg-white/70 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">Failed</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{model.summary.failed}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
