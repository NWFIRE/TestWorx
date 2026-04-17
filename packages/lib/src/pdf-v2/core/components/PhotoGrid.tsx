import type { PhotoGridProps } from "../types/common";

import { EmptyState } from "./EmptyState";

export function PhotoGrid({ photos }: PhotoGridProps) {
  if (!photos.length) {
    return <EmptyState message="No photos provided." />;
  }

  const single = photos.length === 1;

  return (
    <div className={`pdf-photo-grid ${single ? "pdf-photo-grid--single" : ""}`}>
      {photos.map((photo) => (
        <figure key={`${photo.caption}:${photo.url}`} className="pdf-photo-frame">
          <img alt={photo.caption} className="pdf-photo-image" src={photo.url} />
          <figcaption className="pdf-text-sm" style={{ marginTop: "8px" }}>{photo.caption}</figcaption>
        </figure>
      ))}
    </div>
  );
}
