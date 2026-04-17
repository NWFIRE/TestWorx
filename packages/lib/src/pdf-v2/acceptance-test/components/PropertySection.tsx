import { MetadataGrid } from "../../core/components/MetadataGrid";
import { SectionHeader } from "../../core/components/SectionHeader";

import type { AcceptanceTestRenderModel } from "../types/acceptanceTestRenderModel";

export function PropertySection({ model }: { model: AcceptanceTestRenderModel }) {
  return (
    <section className="pdf-section">
      <SectionHeader title="Property Information" />
      <MetadataGrid
        columns={2}
        items={[
          model.property.buildingName ? { label: "Building Name", value: model.property.buildingName } : null,
          model.property.address ? { label: "Address", value: model.property.address } : null,
          model.property.buildingOwner ? { label: "Building Owner", value: model.property.buildingOwner } : null,
          model.property.ownerContact ? { label: "Owner Contact", value: model.property.ownerContact } : null
        ].filter((item): item is { label: string; value: string } => Boolean(item))}
      />
    </section>
  );
}
