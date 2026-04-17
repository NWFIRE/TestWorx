import { EmptyState } from "../../core/components/EmptyState";
import { SectionHeader } from "../../core/components/SectionHeader";

import type { AcceptanceTestRenderModel } from "../types/acceptanceTestRenderModel";

export function CommentsSection({ model }: { model: AcceptanceTestRenderModel }) {
  return (
    <section className="pdf-section">
      <SectionHeader title="Additional Comments" />
      {model.comments ? <p className="pdf-text-sm" style={{ color: "var(--pdf-text)", margin: 0 }}>{model.comments}</p> : <EmptyState message="No additional comments." />}
    </section>
  );
}
