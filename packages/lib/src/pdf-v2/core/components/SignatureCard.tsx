import type { SignatureCardProps } from "../types/common";

export function SignatureCard({ role, name, signedAt, imageUrl }: SignatureCardProps) {
  return (
    <div className="pdf-signature-card">
      <div className="pdf-kicker">{role}</div>
      <div className="pdf-metadata-value">{name}</div>
      {signedAt ? <div className="pdf-text-sm pdf-muted">{signedAt}</div> : null}
      <img alt={`${role} signature`} className="pdf-signature-image" src={imageUrl} />
    </div>
  );
}
