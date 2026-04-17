import type { IdentityBandProps } from "../types/common";

import { MetadataGrid } from "./MetadataGrid";

export function IdentityBand({
  customerName,
  siteName,
  inspectionDate,
  completionTimestamp,
  technicianName,
  billingContact,
  cleanAddress
}: IdentityBandProps) {
  const rightItems = [
    technicianName ? { label: "Technician", value: technicianName } : null,
    { label: "Inspection date", value: inspectionDate },
    completionTimestamp ? { label: "Completed", value: completionTimestamp } : null,
    billingContact ? { label: "Billing contact", value: billingContact } : null,
    cleanAddress ? { label: "Service address", value: cleanAddress } : null
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  return (
    <section className="pdf-identity-band">
      <div>
        <div className="pdf-kicker">Customer and site</div>
        <div className="pdf-identity-band__anchor">{customerName}</div>
        {siteName ? <p className="pdf-text-sm">{siteName}</p> : null}
      </div>
      <MetadataGrid columns={2} items={rightItems} />
    </section>
  );
}
