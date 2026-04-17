import { EmptyState } from "../../core/components/EmptyState";
import { MetricGrid } from "../../core/components/MetricGrid";
import { SectionHeader } from "../../core/components/SectionHeader";

import type { FireAlarmReportRenderModel } from "../types/fireAlarmRenderModel";

export function FindingsSection({ model }: { model: FireAlarmReportRenderModel }) {
  return (
    <section className="pdf-section">
      <SectionHeader subtitle="General system summary, service findings, recorded deficiencies, and final notes." title="Findings, Deficiencies, and Notes" />
      <MetricGrid columns={4} items={model.systemSummary} />

      <div>
        <div className="pdf-kicker">Service findings</div>
        {model.findings.length ? (
          <div className="pdf-cell-lines">{model.findings.map((item) => <p key={item} style={{ margin: 0 }}>{item}</p>)}</div>
        ) : (
          <EmptyState message="No service findings recorded." />
        )}
      </div>

      <div>
        <div className="pdf-kicker">Deficiencies</div>
        {model.deficiencies.length ? (
          <div className="pdf-cell-lines">
            {model.deficiencies.map((item, index) => (
              <div key={`${item.description}:${index}`}>
                <p style={{ margin: 0, fontWeight: 700 }}>{item.title ?? `Deficiency ${index + 1}`}</p>
                <p style={{ margin: 0 }}>{item.description}</p>
                {item.severity || item.action ? <p className="pdf-text-sm" style={{ margin: 0 }}>{[item.severity, item.action].filter(Boolean).join(" • ")}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No deficiencies recorded." />
        )}
      </div>

      <div>
        <div className="pdf-kicker">Notes</div>
        {model.notes ? <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{model.notes}</p> : <EmptyState message="No notes provided." />}
      </div>
    </section>
  );
}
