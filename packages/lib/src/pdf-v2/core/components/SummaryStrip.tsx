import type { SummaryStripProps } from "../types/common";

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

export function SummaryStrip({ items }: SummaryStripProps) {
  const cleanItems = items.filter((item) => item.value !== "");
  if (!cleanItems.length) {
    return null;
  }

  return (
    <div className="pdf-summary-strip">
      {cleanItems.map((item) => (
        <div key={`${item.label}:${item.value}`} className="pdf-summary-strip__item">
          <span className="pdf-label">{item.label}</span>
          <span className={toneClass(item.tone)}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}
