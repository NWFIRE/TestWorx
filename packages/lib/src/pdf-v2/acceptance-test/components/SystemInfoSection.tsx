import { MetadataGrid } from "../../core/components/MetadataGrid";
import { SectionHeader } from "../../core/components/SectionHeader";

import type { AcceptanceTestRenderModel } from "../types/acceptanceTestRenderModel";

export function SystemInfoSection({ model }: { model: AcceptanceTestRenderModel }) {
  return (
    <section className="pdf-section">
      <SectionHeader title="System Information" />
      <MetadataGrid
        columns={2}
        items={[
          model.system.hazardDescription ? { label: "Hazard Protected", value: model.system.hazardDescription } : null,
          model.system.manufacturer ? { label: "Manufacturer", value: model.system.manufacturer } : null,
          model.system.model ? { label: "Model", value: model.system.model } : null,
          model.system.dateLeftInService ? { label: "Date Left In Service", value: model.system.dateLeftInService } : null
        ].filter((item): item is { label: string; value: string } => Boolean(item))}
      />
    </section>
  );
}
