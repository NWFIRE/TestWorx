import { PDF_V2_TOKENS } from "../tokens";
import { contentWidth, drawRect, drawSectionTitle, drawTextLines, ensureSpace, remainingContentHeight, splitTextIntoLines, type PageCursor, type PdfV2Runtime } from "../page-shell";
import type { RenderSection } from "../types";

const BODY_SIZE = 9;
const LINE_GAP = 3;
const LINE_HEIGHT = BODY_SIZE + LINE_GAP;

export function renderFindingsSection(runtime: PdfV2Runtime, cursor: PageCursor, section: Extract<RenderSection, { renderer: "findings" }>) {
  const groups = section.groups.filter((group) => group.lines.some((line) => line.trim()));
  if (groups.length === 0) {
    return cursor;
  }

  cursor = ensureSpace(runtime, cursor, 82);
  drawSectionTitle(runtime, cursor, section.title, section.description);

  for (const group of groups) {
    let lines = splitTextIntoLines(runtime.regularFont, group.lines.join("\n"), contentWidth() - 20, BODY_SIZE);
    if (lines.length === 0) {
      continue;
    }

    let isContinuation = false;
    while (lines.length > 0) {
      if (remainingContentHeight(cursor) < 48) {
        cursor = ensureSpace(runtime, cursor, 90);
      }

      const titleHeight = isContinuation ? 18 : 26;
      const maxLines = Math.max(1, Math.floor((remainingContentHeight(cursor) - titleHeight - 10) / LINE_HEIGHT));
      const chunk = lines.slice(0, maxLines);
      const height = Math.max(42, titleHeight + chunk.length * LINE_HEIGHT + 10);
      const bg = group.tone === "fail" ? runtime.theme.failBg : group.tone === "warn" ? runtime.theme.warnBg : runtime.theme.surface;
      drawRect(cursor.page, PDF_V2_TOKENS.margin, cursor.y, contentWidth(), height, bg, runtime.theme.line, 1);
      cursor.page.drawText(`${group.title}${isContinuation ? " (continued)" : ""}`.toUpperCase(), {
        x: PDF_V2_TOKENS.margin + 10,
        y: cursor.y - 15,
        size: 7,
        font: runtime.boldFont,
        color: runtime.theme.softText
      });
      drawTextLines(cursor.page, runtime.regularFont, chunk, PDF_V2_TOKENS.margin + 10, cursor.y - titleHeight, BODY_SIZE, runtime.theme.ink, LINE_GAP);
      cursor.y -= height + 8;
      lines = lines.slice(chunk.length);
      isContinuation = true;
    }
  }

  cursor.y += 8 - PDF_V2_TOKENS.sectionGap;
  return cursor;
}
