import type { MetricGridProps } from "../types/common";

function toneClass(tone?: "default" | "success" | "warning" | "danger") {
  switch (tone) {
    case "success":
      return "pdf-tone-success";
    case "warning":
      return "pdf-tone-warning";
    case "danger":
      return "pdf-tone-danger";
    default:
      return "";
  }
}

export function MetricGrid({ items, columns = 4 }: MetricGridProps) {
  const cleanItems = items.filter((item) => item.value !== "");
  if (!cleanItems.length) {
    return null;
  }

  return (
    <div className={`pdf-metric-grid pdf-metadata-grid--${columns}`}>
      {cleanItems.map((item) => (
        <div key={`${item.label}:${item.value}`} className="pdf-metric-item">
          <span className="pdf-label">{item.label}</span>
          <span className={`pdf-metric-value ${toneClass(item.tone)}`}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}
