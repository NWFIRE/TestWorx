import { PDF_V2_TOKENS } from "../tokens";
import { contentWidth, drawParagraph, drawRect, drawSectionTitle, ensureSpace, measureParagraphHeight, type PageCursor, type PdfV2Runtime } from "../page-shell";
import type { RenderSection } from "../types";

function resolveColumnWidth(width: string | undefined, totalWidth: number, columnCount: number) {
  if (width?.endsWith("%")) {
    const pct = Number.parseFloat(width);
    if (Number.isFinite(pct)) {
      return totalWidth * (pct / 100);
    }
  }
  return totalWidth / columnCount;
}

export function renderTableSection(runtime: PdfV2Runtime, cursor: PageCursor, section: Extract<RenderSection, { renderer: "table" }>) {
  cursor = ensureSpace(runtime, cursor, 130);
  if (section.title) {
    drawSectionTitle(runtime, cursor, section.title, section.description);
  }

  if (section.rows.length === 0) {
    drawRect(cursor.page, PDF_V2_TOKENS.margin, cursor.y, contentWidth(), 42, runtime.theme.surface, runtime.theme.line, 1);
    drawParagraph(cursor.page, runtime.regularFont, section.emptyMessage ?? "No items recorded", PDF_V2_TOKENS.margin + 12, cursor.y - 20, contentWidth() - 24, 9, runtime.theme.softText);
    cursor.y -= 42 + PDF_V2_TOKENS.sectionGap;
    return cursor;
  }

  const totalWidth = contentWidth();
  const widths = section.columns.map((column) => resolveColumnWidth(column.width, totalWidth, section.columns.length));
  const headerHeight = 24;
  const drawHeader = () => {
    let x = PDF_V2_TOKENS.margin;
    drawRect(cursor.page, PDF_V2_TOKENS.margin, cursor.y, totalWidth, headerHeight, runtime.theme.softSurface, runtime.theme.line, 1);
    section.columns.forEach((column, index) => {
      cursor.page.drawText(column.label.toUpperCase(), {
        x: x + PDF_V2_TOKENS.tableCellPaddingX,
        y: cursor.y - 16,
        size: 7.5,
        font: runtime.boldFont,
        color: runtime.theme.softText
      });
      x += widths[index] ?? 0;
    });
    cursor.y -= headerHeight;
  };

  drawHeader();
  for (const row of section.rows) {
    const rowHeight = Math.max(
      ...section.columns.map((column, index) => {
        const cell = row[column.key];
        const text = cell?.lines?.length ? cell.lines.join(" ") : cell?.text ?? "";
        return measureParagraphHeight(runtime.regularFont, text, (widths[index] ?? 0) - PDF_V2_TOKENS.tableCellPaddingX * 2, 8.5, 3, 5);
      }),
      18
    ) + PDF_V2_TOKENS.tableCellPaddingY;

    cursor = ensureSpace(runtime, cursor, rowHeight + 8);
    if (section.repeatHeader && cursor.y - rowHeight < 100) {
      cursor = ensureSpace(runtime, cursor, rowHeight + 32);
      drawHeader();
    }

    drawRect(cursor.page, PDF_V2_TOKENS.margin, cursor.y, totalWidth, rowHeight, runtime.theme.surface, runtime.theme.line, 1);
    let x = PDF_V2_TOKENS.margin;
    section.columns.forEach((column, index) => {
      const cell = row[column.key];
      const lines = cell?.lines && cell.lines.length > 0 ? cell.lines : [cell?.text ?? ""];
      drawParagraph(cursor.page, runtime.regularFont, lines.filter(Boolean).join("\n"), x + PDF_V2_TOKENS.tableCellPaddingX, cursor.y - 14, (widths[index] ?? 0) - PDF_V2_TOKENS.tableCellPaddingX * 2, 8.5, runtime.theme.ink, 3, 5);
      x += widths[index] ?? 0;
    });
    cursor.y -= rowHeight;
  }

  cursor.y -= PDF_V2_TOKENS.sectionGap;
  return cursor;
}
