import { PDF_V2_TOKENS, PDF_V2_TYPOGRAPHY } from "./tokens";
import { contentWidth, drawParagraph, drawRect, ensureSpace, measureParagraphHeight, type PageCursor, type PdfV2Runtime } from "./page-shell";
import type { RenderKeyValueRow } from "./types";

function renderIdentityBand(runtime: PdfV2Runtime, cursor: PageCursor) {
  const facts = [
    runtime.model.identity.customer ? `Customer: ${runtime.model.identity.customer}` : "",
    runtime.model.identity.site ? `Site: ${runtime.model.identity.site}` : "",
    runtime.model.identity.serviceAddress ? `Service Address: ${runtime.model.identity.serviceAddress}` : "",
    runtime.model.identity.customerContact ? `Customer Contact: ${runtime.model.identity.customerContact}` : "",
    runtime.model.identity.technician ? `Technician: ${runtime.model.identity.technician}` : "",
    runtime.model.identity.serviceDate ? `Service Date: ${runtime.model.identity.serviceDate}` : ""
  ].filter(Boolean);
  const factText = facts.join("   ");
  const factHeight = measureParagraphHeight(runtime.regularFont, factText, contentWidth() - 28, PDF_V2_TYPOGRAPHY.metadataValue, 3, 3);
  const height = Math.max(72, 42 + factHeight + 12);
  drawRect(cursor.page, PDF_V2_TOKENS.margin, cursor.y, contentWidth(), height, runtime.theme.surface, runtime.theme.line, 1);
  cursor.page.drawText(runtime.model.identity.title, {
    x: PDF_V2_TOKENS.margin + 14,
    y: cursor.y - 18,
    size: PDF_V2_TYPOGRAPHY.reportTitle,
    font: runtime.boldFont,
    color: runtime.theme.ink
  });

  drawParagraph(cursor.page, runtime.regularFont, factText, PDF_V2_TOKENS.margin + 14, cursor.y - 38, contentWidth() - 28, PDF_V2_TYPOGRAPHY.metadataValue, runtime.theme.muted, 3, 3);
  cursor.y -= height + PDF_V2_TOKENS.sectionGap;
}

function measureIdentityBandHeight(runtime: PdfV2Runtime) {
  const facts = [
    runtime.model.identity.customer ? `Customer: ${runtime.model.identity.customer}` : "",
    runtime.model.identity.site ? `Site: ${runtime.model.identity.site}` : "",
    runtime.model.identity.serviceAddress ? `Service Address: ${runtime.model.identity.serviceAddress}` : "",
    runtime.model.identity.customerContact ? `Customer Contact: ${runtime.model.identity.customerContact}` : "",
    runtime.model.identity.technician ? `Technician: ${runtime.model.identity.technician}` : "",
    runtime.model.identity.serviceDate ? `Service Date: ${runtime.model.identity.serviceDate}` : ""
  ].filter(Boolean);
  const factText = facts.join("   ");
  const factHeight = measureParagraphHeight(runtime.regularFont, factText, contentWidth() - 28, PDF_V2_TYPOGRAPHY.metadataValue, 3, 3);
  return Math.max(72, 42 + factHeight + 12) + PDF_V2_TOKENS.sectionGap;
}

function buildComplianceDetailText(reference: PdfV2Runtime["model"]["compliance"]["references"][number]) {
  return [
    reference.chapterReferences.length ? `Chapters/sections: ${[...reference.chapterReferences, ...reference.nfpaSections.map((section) => `Section ${section}`)].join("; ")}` : "",
    reference.tableReferences.length ? `Tables: ${reference.tableReferences.join("; ")}` : "",
    reference.applicableInspectionSections.length ? `Applies to: ${reference.applicableInspectionSections.join(", ")}` : "",
    reference.applicabilityReason ? `Reason used: ${reference.applicabilityReason}` : "",
    reference.jointCommissionEPReferences.length ? `Joint Commission: ${reference.jointCommissionEPReferences.join(", ")}` : ""
  ].filter(Boolean).join("\n");
}

function measureComplianceReferenceHeight(runtime: PdfV2Runtime, width: number, reference: PdfV2Runtime["model"]["compliance"]["references"][number]) {
  const detailText = buildComplianceDetailText(reference);
  return 14
    + measureParagraphHeight(runtime.boldFont, reference.formattedReference, width, 10.2, 3, 2)
    + measureParagraphHeight(runtime.regularFont, detailText, width, 8.7, 2, 2)
    + 8;
}

function renderComplianceBlock(runtime: PdfV2Runtime, cursor: PageCursor) {
  const width = contentWidth() - 28;
  const descriptionHeight = measureParagraphHeight(runtime.regularFont, runtime.model.compliance.description, width, PDF_V2_TYPOGRAPHY.sectionDescriptor, 3, 2);
  const referencesHeight = runtime.model.compliance.references.reduce((sum, reference) => sum + measureComplianceReferenceHeight(runtime, width, reference), 0);
  const fallbackCodeText = runtime.model.compliance.codes.join(" | ");
  const fallbackCodeHeight = runtime.model.compliance.references.length === 0
    ? measureParagraphHeight(runtime.boldFont, fallbackCodeText, width, 12, 3, 2)
    : 0;
  const height = 26 + descriptionHeight + referencesHeight + fallbackCodeHeight + 18;
  drawRect(cursor.page, PDF_V2_TOKENS.margin, cursor.y, contentWidth(), height, runtime.theme.softSurface, runtime.theme.line, 1);
  cursor.page.drawText(runtime.model.compliance.title, {
    x: PDF_V2_TOKENS.margin + 14,
    y: cursor.y - 16,
    size: PDF_V2_TYPOGRAPHY.sectionTitle,
    font: runtime.boldFont,
    color: runtime.theme.ink
  });
  drawParagraph(cursor.page, runtime.regularFont, runtime.model.compliance.description, PDF_V2_TOKENS.margin + 14, cursor.y - 32, width, PDF_V2_TYPOGRAPHY.sectionDescriptor, runtime.theme.softText, 3, 2);
  let nextY = cursor.y - 50 - descriptionHeight;
  if (runtime.model.compliance.references.length > 0) {
    for (const reference of runtime.model.compliance.references) {
      drawParagraph(cursor.page, runtime.boldFont, reference.formattedReference, PDF_V2_TOKENS.margin + 14, nextY, width, 10.2, runtime.theme.primary, 3, 2);
      nextY -= measureParagraphHeight(runtime.boldFont, reference.formattedReference, width, 10.2, 3, 2) + 3;
      const detailText = buildComplianceDetailText(reference);
      drawParagraph(cursor.page, runtime.regularFont, detailText, PDF_V2_TOKENS.margin + 14, nextY, width, 8.7, runtime.theme.softText, 2, 2);
      nextY -= measureParagraphHeight(runtime.regularFont, detailText, width, 8.7, 2, 2) + 8;
    }
  } else {
    drawParagraph(cursor.page, runtime.boldFont, fallbackCodeText, PDF_V2_TOKENS.margin + 14, nextY, width, 12, runtime.theme.primary, 3, 2);
  }
  cursor.y -= height + PDF_V2_TOKENS.sectionGap;
}

function measureComplianceBlockHeight(runtime: PdfV2Runtime) {
  const width = contentWidth() - 28;
  const descriptionHeight = measureParagraphHeight(runtime.regularFont, runtime.model.compliance.description, width, PDF_V2_TYPOGRAPHY.sectionDescriptor, 3, 2);
  const referencesHeight = runtime.model.compliance.references.reduce((sum, reference) => sum + measureComplianceReferenceHeight(runtime, width, reference), 0);
  const fallbackCodeText = runtime.model.compliance.codes.join(" | ");
  const fallbackCodeHeight = runtime.model.compliance.references.length === 0
    ? measureParagraphHeight(runtime.boldFont, fallbackCodeText, width, 12, 3, 2)
    : 0;
  return 26 + descriptionHeight + referencesHeight + fallbackCodeHeight + 18 + PDF_V2_TOKENS.sectionGap;
}

function renderOutcomeCards(runtime: PdfV2Runtime, cursor: PageCursor) {
  const cardCount = runtime.model.outcomeCards.length;
  const gap = PDF_V2_TOKENS.cardGap;
  const width = (contentWidth() - gap * (cardCount - 1)) / Math.max(cardCount, 1);
  const height = 68;
  runtime.model.outcomeCards.forEach((card, index) => {
    const x = PDF_V2_TOKENS.margin + index * (width + gap);
    const bg = card.tone === "pass" ? runtime.theme.passBg : card.tone === "fail" ? runtime.theme.failBg : card.tone === "warn" ? runtime.theme.warnBg : runtime.theme.surface;
    const valueColor = card.tone === "pass" ? runtime.theme.passText : card.tone === "fail" ? runtime.theme.failText : card.tone === "warn" ? runtime.theme.warnText : runtime.theme.ink;
    drawRect(cursor.page, x, cursor.y, width, height, bg, runtime.theme.line, 1);
    cursor.page.drawText(card.label.toUpperCase(), {
      x: x + 12,
      y: cursor.y - 16,
      size: PDF_V2_TYPOGRAPHY.metricLabel,
      font: runtime.boldFont,
      color: runtime.theme.softText
    });
    drawParagraph(cursor.page, runtime.boldFont, card.value, x + 12, cursor.y - 36, width - 24, PDF_V2_TYPOGRAPHY.metricValue, valueColor, 3, 2);
  });
  cursor.y -= height + PDF_V2_TOKENS.sectionGap;
}

function measureOutcomeCardsHeight() {
  return 68 + PDF_V2_TOKENS.sectionGap;
}

function measureMetadataGridHeight(runtime: PdfV2Runtime, title: string, description: string, items: RenderKeyValueRow[]) {
  const titleHeight = title
    ? 14 + measureParagraphHeight(runtime.regularFont, description, contentWidth(), PDF_V2_TYPOGRAPHY.sectionDescriptor, 3, 3) + 8
    : 0;
  const rows = Math.ceil(items.length / 2);
  const gridHeight = Math.max(rows, 1) * 38;
  return titleHeight + gridHeight + PDF_V2_TOKENS.sectionGap;
}

function renderMetadataGrid(runtime: PdfV2Runtime, cursor: PageCursor, title: string, description: string, items: RenderKeyValueRow[]) {
  if (title) {
    cursor.page.drawText(title, {
      x: PDF_V2_TOKENS.margin,
      y: cursor.y,
      size: PDF_V2_TYPOGRAPHY.sectionTitle,
      font: runtime.boldFont,
      color: runtime.theme.ink
    });
    cursor.y -= 14;
    drawParagraph(cursor.page, runtime.regularFont, description, PDF_V2_TOKENS.margin, cursor.y, contentWidth(), PDF_V2_TYPOGRAPHY.sectionDescriptor, runtime.theme.softText, 3, 3);
    cursor.y -= measureParagraphHeight(runtime.regularFont, description, contentWidth(), PDF_V2_TYPOGRAPHY.sectionDescriptor, 3, 3) + 8;
  }

  const cols = 2;
  const gap = 14;
  const width = (contentWidth() - gap) / cols;
  const rows = Math.ceil(items.length / cols);
  const rowHeight = 38;
  const height = rows * rowHeight;
  drawRect(cursor.page, PDF_V2_TOKENS.margin, cursor.y, contentWidth(), height, runtime.theme.surface, runtime.theme.line, 1);
  items.forEach((item, index) => {
    const column = index % cols;
    const row = Math.floor(index / cols);
    const x = PDF_V2_TOKENS.margin + 12 + column * (width + gap);
    const y = cursor.y - 12 - row * rowHeight;
    cursor.page.drawText(item.label.toUpperCase(), {
      x,
      y,
      size: PDF_V2_TYPOGRAPHY.metadataLabel,
      font: runtime.boldFont,
      color: runtime.theme.softText
    });
    drawParagraph(cursor.page, runtime.regularFont, item.value, x, y - 13, width - 10, PDF_V2_TYPOGRAPHY.metadataValue, runtime.theme.ink, 3, 2);
  });
  cursor.y -= height + PDF_V2_TOKENS.sectionGap;
}

function renderSystemSummary(runtime: PdfV2Runtime, cursor: PageCursor) {
  const section = runtime.model.systemSummary;
  if (!section || section.renderer !== "keyValue") {
    return;
  }
  renderMetadataGrid(runtime, cursor, section.title, section.description ?? "", section.items.slice(0, 6));
}

export function renderPageOneV2(runtime: PdfV2Runtime, cursor: PageCursor) {
  cursor = ensureSpace(runtime, cursor, measureIdentityBandHeight(runtime));
  renderIdentityBand(runtime, cursor);

  cursor = ensureSpace(runtime, cursor, measureComplianceBlockHeight(runtime));
  renderComplianceBlock(runtime, cursor);

  cursor = ensureSpace(runtime, cursor, measureOutcomeCardsHeight());
  renderOutcomeCards(runtime, cursor);

  const customerContextTitle = "Customer and Service Context";
  const customerContextDescription = "Customer, site, technician, and completion context for this report.";
  cursor = ensureSpace(runtime, cursor, measureMetadataGridHeight(runtime, customerContextTitle, customerContextDescription, runtime.model.primaryFacts));
  renderMetadataGrid(runtime, cursor, customerContextTitle, customerContextDescription, runtime.model.primaryFacts);

  const inspectionOverviewTitle = "Inspection Overview";
  const inspectionOverviewDescription = "Operational context and service details captured for this visit.";
  cursor = ensureSpace(runtime, cursor, measureMetadataGridHeight(runtime, inspectionOverviewTitle, inspectionOverviewDescription, runtime.model.overviewFacts));
  renderMetadataGrid(runtime, cursor, inspectionOverviewTitle, inspectionOverviewDescription, runtime.model.overviewFacts);

  if (runtime.model.systemSummary?.renderer === "keyValue") {
    cursor = ensureSpace(runtime, cursor, measureMetadataGridHeight(runtime, runtime.model.systemSummary.title, runtime.model.systemSummary.description ?? "", runtime.model.systemSummary.items.slice(0, 6)));
  }
  renderSystemSummary(runtime, cursor);
  return cursor;
}
