import { EmptyState } from "../../core/components/EmptyState";
import { MetadataGrid } from "../../core/components/MetadataGrid";
import { SectionHeader } from "../../core/components/SectionHeader";

import type { AcceptanceTestRenderModel } from "../types/acceptanceTestRenderModel";

export function WitnessSection({ model }: { model: AcceptanceTestRenderModel }) {
  return (
    <section className="pdf-section">
      <SectionHeader title="Witness Information" />
      {model.witness.witnessedBy ? (
        <MetadataGrid
          columns={2}
          items={[{ label: "Test Witnessed By", value: model.witness.witnessedBy }]}
        />
      ) : (
        <EmptyState message="No witness recorded." />
      )}
    </section>
  );
}
