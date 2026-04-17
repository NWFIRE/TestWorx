import { PDF_V2_TOKENS } from "../tokens";
import { contentWidth, drawRect, drawSectionTitle, ensureSpace, type PageCursor, type PdfV2Runtime } from "../page-shell";
import type { RenderSection } from "../types";

export function renderCompactMetricsSection(runtime: PdfV2Runtime, cursor: PageCursor, section: Extract<RenderSection, { renderer: "compactMetrics" }>) {
  cursor = ensureSpace(runtime, cursor, 110);
  drawSectionTitle(runtime, cursor, section.title, section.description);
  const items = section.items;
  const gap = PDF_V2_TOKENS.cardGap;
  const width = (contentWidth() - gap * (items.length - 1)) / Math.max(items.length, 1);
  const height = 62;
  items.forEach((item, index) => {
    const x = PDF_V2_TOKENS.margin + index * (width + gap);
    drawRect(cursor.page, x, cursor.y, width, height, runtime.theme.softSurface, runtime.theme.line, 1);
    cursor.page.drawText(item.label.toUpperCase(), {
      x: x + 10,
      y: cursor.y - 15,
      size: 7,
      font: runtime.boldFont,
      color: runtime.theme.softText
    });
    cursor.page.drawText(item.value, {
      x: x + 10,
      y: cursor.y - 39,
      size: 14,
      font: runtime.boldFont,
      color: runtime.theme.ink
    });
  });
  cursor.y -= height + PDF_V2_TOKENS.sectionGap;
  return cursor;
}
