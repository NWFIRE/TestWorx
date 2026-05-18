import React from "react";

import type { ComplianceBlockProps } from "../types/common";

export function ComplianceBlock({ codes, title = "Applicable Codes, Standards & Compliance References", description, references = [] }: ComplianceBlockProps) {
  if (!codes.length && references.length === 0) {
    return null;
  }

  return (
    <section className="pdf-compliance-block">
      <div className="pdf-kicker">{title}</div>
      <p className="pdf-section-subtitle">{description ?? "This finalized report package includes standards, edition years, cited chapters/sections, applicability explanations, and healthcare survey references when applicable."}</p>
      {references.length > 0 ? (
        <div className="pdf-compliance-reference-list">
          {references.map((reference) => (
            <div key={reference.id} className="pdf-compliance-reference">
              <div className="pdf-compliance-codes">{reference.formattedReference}</div>
              <p>Chapters/sections: {[...reference.chapterReferences, ...reference.nfpaSections.map((section) => `Section ${section}`)].join("; ") || "As adopted by the AHJ"}</p>
              {reference.tableReferences.length ? <p>Tables: {reference.tableReferences.join("; ")}</p> : null}
              <p>Applies to: {reference.applicableInspectionSections.join(", ")}</p>
              <p>Reason used: {reference.applicabilityReason}</p>
              {reference.jointCommissionEPReferences.length ? <p>Joint Commission: {reference.jointCommissionEPReferences.join(", ")}</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="pdf-compliance-codes">{codes.join(" | ")}</div>
      )}
    </section>
  );
}
