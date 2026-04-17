import type { ComplianceBlockProps } from "../types/common";

export function ComplianceBlock({ codes }: ComplianceBlockProps) {
  if (!codes.length) {
    return null;
  }

  return (
    <section className="pdf-compliance-block">
      <div className="pdf-kicker">Compliance Standards</div>
      <p className="pdf-section-subtitle">This inspection was performed in accordance with the following standards.</p>
      <div className="pdf-compliance-codes">{codes.join(" • ")}</div>
    </section>
  );
}
