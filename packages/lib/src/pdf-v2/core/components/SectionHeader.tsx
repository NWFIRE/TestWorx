import type { SectionHeaderProps } from "../types/common";

export function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  return (
    <div>
      <h2 className="pdf-section-title">{title}</h2>
      {subtitle ? <p className="pdf-section-subtitle">{subtitle}</p> : null}
    </div>
  );
}
