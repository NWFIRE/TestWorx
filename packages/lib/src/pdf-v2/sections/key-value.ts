import { PDF_V2_TOKENS } from "../tokens";
import { contentWidth, drawParagraph, drawRect, drawSectionTitle, ensureSpace, type PageCursor, type PdfV2Runtime } from "../page-shell";
import type { RenderSection } from "../types";

export function renderKeyValueSection(runtime: PdfV2Runtime, cursor: PageCursor, section: Extract<RenderSection, { renderer: "keyValue" }>) {
  cursor = ensureSpace(runtime, cursor, 120);
  drawSectionTitle(runtime, cursor, section.title, section.description);
  const items = section.items.filter((item) => item.value);
  const cols = 2;
  const gap = 14;
  const width = (contentWidth() - gap) / cols;
  const rows = Math.ceil(Math.max(items.length, 1) / cols);
  const rowHeight = 38;
  const height = Math.max(rows, 1) * rowHeight;
  drawRect(cursor.page, PDF_V2_TOKENS.margin, cursor.y, contentWidth(), height, runtime.theme.surface, runtime.theme.line, 1);
  (items.length > 0 ? items : [{ label: "", value: section.emptyMessage ?? "" }]).forEach((item, index) => {
    const column = index % cols;
    const row = Math.floor(index / cols);
    const x = PDF_V2_TOKENS.margin + 12 + column * (width + gap);
    const y = cursor.y - 12 - row * rowHeight;
    if (item.label) {
      cursor.page.drawText(item.label.toUpperCase(), {
        x,
        y,
        size: 7,
        font: runtime.boldFont,
        color: runtime.theme.softText
      });
    }
    drawParagraph(cursor.page, runtime.regularFont, item.value, x, item.label ? y - 13 : y, width - 10, 9.5, runtime.theme.ink, 3, 2);
  });
  cursor.y -= height + PDF_V2_TOKENS.sectionGap;
  return cursor;
}
