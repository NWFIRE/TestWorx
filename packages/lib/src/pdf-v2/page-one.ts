import { PDF_V2_TOKENS, PDF_V2_TYPOGRAPHY } from "./tokens";
import { contentWidth, drawParagraph, drawRect, ensureSpace, measureParagraphHeight, type PageCursor, type PdfV2Runtime } from "./page-shell";
import type { RenderKeyValueRow } from "./types";

function renderIdentityBand(runtime: PdfV2Runtime, cursor: PageCursor) {
  const height = 64;
  drawRect(cursor.page, PDF_V2_TOKENS.margin, cursor.y, contentWidth(), height, runtime.theme.surface, runtime.theme.line, 1);
  cursor.page.drawText(runtime.model.identity.title, {
    x: PDF_V2_TOKENS.margin + 14,
    y: cursor.y - 18,
    size: PDF_V2_TYPOGRAPHY.reportTitle,
    font: runtime.boldFont,
    color: runtime.theme.ink
  });

  const facts = [
    runtime.model.identity.customer,
    runtime.model.identity.site,
    runtime.model.identity.technician ? `Technician: ${runtime.model.identity.technician}` : "",
    runtime.model.identity.serviceDate ? `Service Date: ${runtime.model.identity.serviceDate}` : ""
  ].filter(Boolean);
  drawParagraph(cursor.page, runtime.regularFont, facts.join("   "), PDF_V2_TOKENS.margin + 14, cursor.y - 38, contentWidth() - 28, PDF_V2_TYPOGRAPHY.metadataValue, runtime.theme.muted, 3, 3);
  cursor.y -= height + PDF_V2_TOKENS.sectionGap;
}

function renderComplianceBlock(runtime: PdfV2Runtime, cursor: PageCursor) {
  const descriptionHeight = measureParagraphHeight(runtime.regularFont, runtime.model.compliance.description, contentWidth() - 28, PDF_V2_TYPOGRAPHY.sectionDescriptor, 3, 2);
  const codeText = runtime.model.compliance.codes.join(" • ");
  const codeHeight = measureParagraphHeight(runtime.boldFont, codeText, contentWidth() - 28, 12, 3, 2);
  const height = 20 + descriptionHeight + codeHeight + 18;
  drawRect(cursor.page, PDF_V2_TOKENS.margin, cursor.y, contentWidth(), height, runtime.theme.softSurface, runtime.theme.line, 1);
  cursor.page.drawText(runtime.model.compliance.title, {
    x: PDF_V2_TOKENS.margin + 14,
    y: cursor.y - 16,
    size: PDF_V2_TYPOGRAPHY.sectionTitle,
    font: runtime.boldFont,
    color: runtime.theme.ink
  });
  drawParagraph(cursor.page, runtime.regularFont, runtime.model.compliance.description, PDF_V2_TOKENS.margin + 14, cursor.y - 32, contentWidth() - 28, PDF_V2_TYPOGRAPHY.sectionDescriptor, runtime.theme.softText, 3, 2);
  drawParagraph(cursor.page, runtime.boldFont, codeText, PDF_V2_TOKENS.margin + 14, cursor.y - 50 - descriptionHeight, contentWidth() - 28, 12, runtime.theme.primary, 3, 2);
  cursor.y -= height + PDF_V2_TOKENS.sectionGap;
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
  cursor = ensureSpace(runtime, cursor, 470);
  renderIdentityBand(runtime, cursor);
  renderComplianceBlock(runtime, cursor);
  renderOutcomeCards(runtime, cursor);
  renderMetadataGrid(runtime, cursor, "Customer and Service Context", "Customer, site, technician, and completion context for this report.", runtime.model.primaryFacts);
  renderMetadataGrid(runtime, cursor, "Inspection Overview", "Operational context and service details captured for this visit.", runtime.model.overviewFacts);
  renderSystemSummary(runtime, cursor);
  return cursor;
}
