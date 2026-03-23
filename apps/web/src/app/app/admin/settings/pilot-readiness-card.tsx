type PilotReadinessCardProps = {
  readyForPilot: boolean;
  summary: string;
  criticalCount: number;
  recommendedCount: number;
  optionalCount: number;
  checks: Array<{
    id: string;
    label: string;
    level: "ready" | "action_required" | "optional";
    severity: "critical" | "recommended" | "optional";
    detail: string;
  }>;
};

const levelClasses: Record<PilotReadinessCardProps["checks"][number]["level"], string> = {
  ready: "bg-emerald-50 text-emerald-700",
  action_required: "bg-amber-50 text-amber-700",
  optional: "bg-slate-100 text-slate-700"
};

const severityOrder: Record<PilotReadinessCardProps["checks"][number]["severity"], number> = {
  critical: 0,
  recommended: 1,
  optional: 2
};

export function PilotReadinessCard({
  readyForPilot,
  summary,
  criticalCount,
  recommendedCount,
  optionalCount,
  checks
}: PilotReadinessCardProps) {
  const orderedChecks = [...checks].sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity]);

  return (
    <div className="rounded-[2rem] bg-white p-6 shadow-panel">
      <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Pilot readiness</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h3 className="text-2xl font-semibold text-ink">Field launch status</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${readyForPilot ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {readyForPilot ? "Core pilot ready" : "Action required"}
        </span>
      </div>
      <p className="mt-3 text-sm text-slate-500">{summary}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
          <p>Critical blockers</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{criticalCount}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
          <p>Recommended follow-ups</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{recommendedCount}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
          <p>Optional setup</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{optionalCount}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {orderedChecks.map((check) => (
          <div key={check.id} className="rounded-[1.25rem] border border-slate-200 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-ink">{check.label}</p>
                <p className="mt-2 text-sm text-slate-500">{check.detail}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${levelClasses[check.level]}`}>
                {check.level === "action_required" ? "Action required" : check.level}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
