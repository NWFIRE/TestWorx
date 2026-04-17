import { EmptyState } from "../../core/components/EmptyState";
import { PhotoGrid } from "../../core/components/PhotoGrid";
import { SectionHeader } from "../../core/components/SectionHeader";
import { SignatureCard } from "../../core/components/SignatureCard";

import type { FireAlarmReportRenderModel } from "../types/fireAlarmRenderModel";

export function PhotosAndSignaturesSection({ model }: { model: FireAlarmReportRenderModel }) {
  const signatures = [model.signatures.technician ? { role: "Technician", ...model.signatures.technician } : null, model.signatures.customer ? { role: "Customer", ...model.signatures.customer } : null]
    .filter((item): item is { role: string; name: string; signedAt?: string; imageUrl: string } => Boolean(item));

  return (
    <section className="pdf-section">
      <SectionHeader subtitle="Inspection photos and captured signatures." title="Photos and Signatures" />
      <div>
        <div className="pdf-kicker">Photos</div>
        <PhotoGrid photos={model.photos} />
      </div>
      <div>
        <div className="pdf-kicker">Signatures</div>
        {signatures.length ? (
          <div className={`pdf-signature-grid ${signatures.length === 1 ? "pdf-signature-grid--single" : ""}`}>
            {signatures.map((signature) => (
              <SignatureCard imageUrl={signature.imageUrl} key={`${signature.role}:${signature.name}`} name={signature.name} role={signature.role} signedAt={signature.signedAt} />
            ))}
          </div>
        ) : (
          <EmptyState message="No signatures provided." />
        )}
      </div>
    </section>
  );
}
