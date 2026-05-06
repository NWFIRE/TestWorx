import { PDF_V2_TOKENS } from "../tokens";
import { contentWidth, drawParagraph, drawRect, drawSectionTitle, ensureSpace, measureParagraphHeight, type PageCursor, type PdfV2Runtime } from "../page-shell";
import type { RenderSection } from "../types";

type KeyValueItem = Extract<RenderSection, { renderer: "keyValue" }>["items"][number];

function itemHeight(runtime: PdfV2Runtime, item: KeyValueItem, width: number) {
  const labelHeight = item.label ? 11 : 0;
  const valueHeight = measureParagraphHeight(runtime.regularFont, item.value, width - 20, 9.5, 3);
  return Math.max(32, labelHeight + valueHeight + 18);
}

export function renderKeyValueSection(runtime: PdfV2Runtime, cursor: PageCursor, section: Extract<RenderSection, { renderer: "keyValue" }>) {
  const items = section.items.filter((item) => item.value && item.value.trim());
  if (items.length === 0 && !section.emptyMessage) {
    return cursor;
  }

  cursor = ensureSpace(runtime, cursor, 70);
  drawSectionTitle(runtime, cursor, section.title, section.description);

  if (items.length === 0) {
    const height = 30;
    cursor = ensureSpace(runtime, cursor, height + 8);
    drawRect(cursor.page, PDF_V2_TOKENS.margin, cursor.y, contentWidth(), height, runtime.theme.surface, runtime.theme.line, 1);
    drawParagraph(cursor.page, runtime.regularFont, section.emptyMessage ?? "No details recorded", PDF_V2_TOKENS.margin + 10, cursor.y - 18, contentWidth() - 20, 8.5, runtime.theme.softText);
    cursor.y -= height + PDF_V2_TOKENS.sectionGap;
    return cursor;
  }

  const cols = 2;
  const gap = 12;
  const width = (contentWidth() - gap) / cols;

  for (let index = 0; index < items.length; index += cols) {
    const rowItems = items.slice(index, index + cols);
    const rowHeight = Math.max(...rowItems.map((item) => itemHeight(runtime, item, width)));
    cursor = ensureSpace(runtime, cursor, rowHeight + 8);

    rowItems.forEach((item, offset) => {
      const x = PDF_V2_TOKENS.margin + offset * (width + gap);
      drawRect(cursor.page, x, cursor.y, width, rowHeight, runtime.theme.surface, runtime.theme.line, 1);
      const labelY = cursor.y - 12;
      if (item.label) {
        cursor.page.drawText(item.label.toUpperCase(), {
          x: x + 10,
          y: labelY,
          size: 7,
          font: runtime.boldFont,
          color: runtime.theme.softText
        });
      }
      drawParagraph(cursor.page, runtime.regularFont, item.value, x + 10, item.label ? labelY - 13 : labelY, width - 20, 9.5, runtime.theme.ink);
    });

    cursor.y -= rowHeight + 8;
  }

  cursor.y += 8 - PDF_V2_TOKENS.sectionGap;
  return cursor;
}
