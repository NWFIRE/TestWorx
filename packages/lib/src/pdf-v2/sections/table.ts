import { PDF_V2_TOKENS, PDF_V2_TYPOGRAPHY } from "../tokens";
import { addPage, contentWidth, drawParagraph, drawRect, drawSectionTitle, drawTextLines, ensureSpace, remainingContentHeight, splitTextIntoLines, type PageCursor, type PdfV2Runtime } from "../page-shell";
import type { RenderSection } from "../types";

const HEADER_HEIGHT = 22;
const BODY_SIZE = PDF_V2_TYPOGRAPHY.tableBody;
const LINE_GAP = 3;
const LINE_HEIGHT = BODY_SIZE + LINE_GAP;

function resolveColumnWidth(width: string | undefined, totalWidth: number, columnCount: number) {
  if (width?.endsWith("%")) {
    const pct = Number.parseFloat(width);
    if (Number.isFinite(pct)) {
      return totalWidth * (pct / 100);
    }
  }
  return totalWidth / columnCount;
}

function cellText(cell: { text?: string; lines?: string[] } | undefined) {
  if (cell?.lines?.length) {
    return cell.lines.filter(Boolean).join("\n");
  }
  return cell?.text ?? "";
}

function drawEmptyState(runtime: PdfV2Runtime, cursor: PageCursor, message: string) {
  const height = 30;
  cursor = ensureSpace(runtime, cursor, height + 8);
  drawRect(cursor.page, PDF_V2_TOKENS.margin, cursor.y, contentWidth(), height, runtime.theme.surface, runtime.theme.line, 1);
  drawParagraph(cursor.page, runtime.regularFont, message, PDF_V2_TOKENS.margin + 10, cursor.y - 18, contentWidth() - 20, 8.5, runtime.theme.softText);
  cursor.y -= height + PDF_V2_TOKENS.sectionGap;
  return cursor;
}

export function renderTableSection(runtime: PdfV2Runtime, cursor: PageCursor, section: Extract<RenderSection, { renderer: "table" }>) {
  // Wide equipment records become item-scoped detail rows, never truncated columns.
  if (section.columns.length > 6) {
    return renderTableSection(runtime, cursor, {
      ...section,
      columns: [{ key: "item", label: "Item", width: "12%" }, { key: "details", label: "Recorded results", width: "88%" }],
      rows: section.rows.map((row, index) => ({
        item: { text: String(index + 1) },
        details: { text: section.columns.map(column => `${column.label}: ${cellText(row[column.key]) || "Not recorded"}`).join("\n") }
      }))
    });
  }
  const totalWidth = contentWidth();
  const visibleColumns = section.columns.length > 0 ? section.columns : [{ key: "value", label: "Details" }];
  const rawWidths = visibleColumns.map((column) => resolveColumnWidth(column.width, totalWidth, visibleColumns.length));
  const widthSum = rawWidths.reduce((sum, width) => sum + width, 0);
  const widths = rawWidths.map(width => width * totalWidth / widthSum);
  const headerLines = visibleColumns.map((column, index) => splitTextIntoLines(runtime.boldFont, column.label, widths[index]! - PDF_V2_TOKENS.tableCellPaddingX * 2, PDF_V2_TYPOGRAPHY.tableHeader));
  const headerHeight = Math.max(HEADER_HEIGHT, ...headerLines.map(lines => lines.length * 10.5 + 16));

  cursor = ensureSpace(runtime, cursor, headerHeight + 90);
  if (section.title) {
    drawSectionTitle(runtime, cursor, section.title, section.description);
  }

  if (section.rows.length === 0) {
    return drawEmptyState(runtime, cursor, section.emptyMessage ?? "No items recorded");
  }

  const drawHeader = () => {
    let x = PDF_V2_TOKENS.margin;
    drawRect(cursor.page, PDF_V2_TOKENS.margin, cursor.y, totalWidth, headerHeight, runtime.theme.softSurface, runtime.theme.line, 1);
    visibleColumns.forEach((column, index) => {
      drawTextLines(cursor.page, runtime.boldFont, headerLines[index]!, x + PDF_V2_TOKENS.tableCellPaddingX, cursor.y - 15, PDF_V2_TYPOGRAPHY.tableHeader, runtime.theme.muted, 3);
      x += widths[index] ?? 0;
    });
    cursor.y -= headerHeight;
  };

  cursor = ensureSpace(runtime, cursor, headerHeight + 32);
  drawHeader();

  for (const row of section.rows) {
    let pendingLines = visibleColumns.map((column, index) => {
      const width = Math.max(20, (widths[index] ?? 0) - PDF_V2_TOKENS.tableCellPaddingX * 2);
      const lines = splitTextIntoLines(runtime.regularFont, cellText(row[column.key]), width, BODY_SIZE);
      return lines.length > 0 ? lines : [""];
    });
    const identityLines = pendingLines[0]!.slice();
    let continued = false;

    while (pendingLines.some((lines) => lines.length > 0)) {
      const maxRemainingLines = Math.max(...pendingLines.map((lines) => lines.length));
      const fullRowHeight = Math.max(18, maxRemainingLines * LINE_HEIGHT + PDF_V2_TOKENS.tableCellPaddingY * 2);
      const availableLines = Math.max(
        1,
        Math.floor((remainingContentHeight(cursor) - PDF_V2_TOKENS.tableCellPaddingY * 2 - 2) / LINE_HEIGHT)
      );

      if (remainingContentHeight(cursor) < 32) {
        cursor = addPage(runtime, cursor.pageNumber + 1);
        if (section.repeatHeader) {
          drawHeader();
        }
        continue;
      }

      const chunkLineCount = fullRowHeight <= remainingContentHeight(cursor) ? maxRemainingLines : Math.max(1, availableLines);
      const rowHeight = Math.max(18, Math.min(maxRemainingLines, chunkLineCount) * LINE_HEIGHT + PDF_V2_TOKENS.tableCellPaddingY * 2);

      drawRect(cursor.page, PDF_V2_TOKENS.margin, cursor.y, totalWidth, rowHeight, runtime.theme.surface, runtime.theme.line, 1);
      let x = PDF_V2_TOKENS.margin;
      pendingLines.forEach((lines, index) => {
        const width = Math.max(20, (widths[index] ?? 0) - PDF_V2_TOKENS.tableCellPaddingX * 2);
        drawTextLines(
          cursor.page,
          runtime.regularFont,
          index === 0 && continued && lines.length === 0
            ? [...identityLines, "(continued)"].slice(0, chunkLineCount)
            : lines.slice(0, chunkLineCount),
          x + PDF_V2_TOKENS.tableCellPaddingX,
          cursor.y - PDF_V2_TOKENS.tableCellPaddingY - BODY_SIZE,
          BODY_SIZE,
          runtime.theme.ink,
          LINE_GAP
        );
        x += widths[index] ?? 0;
      });
      cursor.y -= rowHeight;

      pendingLines = pendingLines.map((lines) => lines.slice(chunkLineCount));
      if (pendingLines.some((lines) => lines.length > 0)) {
        continued = true;
        cursor = addPage(runtime, cursor.pageNumber + 1);
        if (section.repeatHeader) {
          drawHeader();
        }
      }
    }
  }

  cursor.y -= PDF_V2_TOKENS.sectionGap;
  return cursor;
}
