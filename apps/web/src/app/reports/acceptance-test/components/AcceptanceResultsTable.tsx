import type { AcceptanceTestViewModel } from "../types/acceptanceTest";

function badgeClass(result: AcceptanceTestViewModel["tests"][number]["displayResult"]) {
  if (result === "Pass") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (result === "Fail") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function AcceptanceResultsTable({ model }: { model: AcceptanceTestViewModel }) {
  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Acceptance Test Results</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Structured test outcomes</h2>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Summary</p>
          <p className="mt-2 text-sm font-medium text-slate-900">{model.summary.passed} passed | {model.summary.failed} failed</p>
        </div>
      </div>
      <div className="mt-5 overflow-hidden rounded-[22px] border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50/90">
            <tr className="text-left">
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Test</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Code</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {model.tests.map((test) => (
              <tr key={test.key}>
                <td className="px-4 py-4 font-medium leading-6 text-slate-950">{test.label}</td>
                <td className="px-4 py-4 text-slate-600">{test.code ?? ""}</td>
                <td className="px-4 py-4">
                  <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${badgeClass(test.displayResult)}`}>
                    {test.displayResult}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
