import { Badge } from "../../core/components/Badge";

import type { AcceptanceTestRenderModel } from "../types/acceptanceTestRenderModel";

export function AcceptancePage1({ model }: { model: AcceptanceTestRenderModel }) {
  return (
    <section className="pdf-section" style={{ gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" }}>
        <div>
          <div className="pdf-kicker">Wet chemical acceptance</div>
          <h1 className="pdf-section-title" style={{ fontSize: "28px", margin: "6px 0 0" }}>
            {model.report.title}
          </h1>
          <div className="pdf-text-sm pdf-muted" style={{ marginTop: "6px" }}>{model.report.standard}</div>
        </div>
        {model.report.status ? <Badge tone="muted">{model.report.status}</Badge> : null}
      </div>

      <section className={`pdf-outcome-hero ${model.report.result === "Pass" ? "pdf-outcome-hero--success" : model.report.result === "Fail" ? "pdf-outcome-hero--danger" : "pdf-outcome-hero--warning"}`}>
        <div className="pdf-outcome-hero__result">
          <div className="pdf-kicker">Outcome</div>
          <p className={`pdf-hero-value ${model.report.result === "Pass" ? "pdf-hero-value--success" : model.report.result === "Fail" ? "pdf-hero-value--danger" : "pdf-hero-value--warning"}`}>
            {model.report.result}
          </p>
          <p className="pdf-text-sm" style={{ color: "var(--pdf-text)", margin: 0 }}>{model.report.narrative}</p>
        </div>
        <div className="pdf-outcome-hero__metrics" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <div className="pdf-metric-item">
            <span className="pdf-label">Total Tests</span>
            <span className="pdf-metric-value">{model.summary.total}</span>
          </div>
          <div className="pdf-metric-item">
            <span className="pdf-label">Passed</span>
            <span className="pdf-metric-value pdf-tone-success">{model.summary.passed}</span>
          </div>
          <div className="pdf-metric-item">
            <span className="pdf-label">Failed</span>
            <span className="pdf-metric-value pdf-tone-danger">{model.summary.failed}</span>
          </div>
        </div>
      </section>
    </section>
  );
}
