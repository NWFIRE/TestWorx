import type { OutcomeHeroProps } from "../types/common";

function toneClass(result: OutcomeHeroProps["result"]) {
  if (result === "Pass") return "pdf-outcome-hero--success";
  if (result === "Fail") return "pdf-outcome-hero--danger";
  return "pdf-outcome-hero--warning";
}

function valueToneClass(result: OutcomeHeroProps["result"]) {
  if (result === "Pass") return "pdf-hero-value--success";
  if (result === "Fail") return "pdf-hero-value--danger";
  return "pdf-hero-value--warning";
}

export function OutcomeHero({ result, deficiencyCount, completionPercent, narrative }: OutcomeHeroProps) {
  return (
    <section className={`pdf-outcome-hero ${toneClass(result)}`}>
      <div className="pdf-outcome-hero__result">
        <div className="pdf-kicker">Inspection outcome</div>
        <p className={`pdf-hero-value ${valueToneClass(result)}`}>{result}</p>
        <p>{narrative}</p>
      </div>
      <div className="pdf-outcome-hero__metrics">
        <div className="pdf-metric-item">
          <span className="pdf-label">Deficiencies</span>
          <span className="pdf-metric-value">{deficiencyCount ?? 0}</span>
        </div>
        <div className="pdf-metric-item">
          <span className="pdf-label">Completion</span>
          <span className="pdf-metric-value">{completionPercent ?? 100}%</span>
        </div>
      </div>
    </section>
  );
}
