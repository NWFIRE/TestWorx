import { EmptyState } from "../../core/components/EmptyState";
import { SectionHeader } from "../../core/components/SectionHeader";
import { SignatureCard } from "../../core/components/SignatureCard";

import type { AcceptanceTestRenderModel } from "../types/acceptanceTestRenderModel";

export function SignaturesSection({ model }: { model: AcceptanceTestRenderModel }) {
  const signatures = [
    model.signatures.authorizedAgent
      ? {
          role: "Authorized Agent",
          name: model.signatures.authorizedAgent.name,
          signedAt: model.signatures.authorizedAgent.signedAt,
          imageUrl: model.signatures.authorizedAgent.imageUrl
        }
      : null,
    model.signatures.installingContractor
      ? {
          role: "Installing Contractor",
          name: model.signatures.installingContractor.name,
          signedAt: model.signatures.installingContractor.signedAt,
          imageUrl: model.signatures.installingContractor.imageUrl
        }
      : null
  ].filter((item): item is { role: string; name: string; signedAt?: string; imageUrl?: string } => Boolean(item && item.imageUrl));

  return (
    <section className="pdf-section">
      <SectionHeader title="Signatures" />
      {signatures.length === 0 ? (
        <EmptyState message="No signatures recorded." />
      ) : (
        <div className={`pdf-signature-grid ${signatures.length === 1 ? "pdf-signature-grid--single" : ""}`}>
          {signatures.map((signature) => (
            <SignatureCard
              key={signature.role}
              role={signature.role}
              name={signature.name}
              signedAt={signature.signedAt}
              imageUrl={signature.imageUrl!}
            />
          ))}
        </div>
      )}
    </section>
  );
}
