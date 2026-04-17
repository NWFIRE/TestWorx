import type { MetadataGridProps } from "../types/common";

export function MetadataGrid({ items, columns = 2 }: MetadataGridProps) {
  const cleanItems = items.filter((item) => item.value);
  if (!cleanItems.length) {
    return null;
  }

  return (
    <div className={`pdf-metadata-grid pdf-metadata-grid--${columns}`}>
      {cleanItems.map((item) => (
        <div key={`${item.label}:${item.value}`} className="pdf-metadata-item">
          <span className="pdf-label">{item.label}</span>
          <span className="pdf-metadata-value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
