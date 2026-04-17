import { MetadataGrid } from "../../core/components/MetadataGrid";
import { SectionHeader } from "../../core/components/SectionHeader";

import type { AcceptanceTestRenderModel } from "../types/acceptanceTestRenderModel";

export function InstallerSection({ model }: { model: AcceptanceTestRenderModel }) {
  return (
    <section className="pdf-section">
      <SectionHeader title="Installer Information" subtitle="Auto-loaded from the TradeWorx company profile." />
      <MetadataGrid
        columns={2}
        items={[
          { label: "Company", value: model.installer.companyName },
          model.installer.address ? { label: "Address", value: model.installer.address } : null,
          model.installer.contactPerson ? { label: "Contact Person", value: model.installer.contactPerson } : null,
          model.installer.contactInfo ? { label: "Contact Info", value: model.installer.contactInfo } : null,
          model.installer.licenseNumber ? { label: "License", value: model.installer.licenseNumber } : null
        ].filter((item): item is { label: string; value: string } => Boolean(item))}
      />
    </section>
  );
}
