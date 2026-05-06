import { PDF_V2_TOKENS } from "../tokens";
import { contentWidth, drawRect, drawSectionTitle, drawTextLines, ensureSpace, remainingContentHeight, splitTextIntoLines, type PageCursor, type PdfV2Runtime } from "../page-shell";
import type { RenderSection } from "../types";

const BODY_SIZE = 9;
const LINE_GAP = 3;
const LINE_HEIGHT = BODY_SIZE + LINE_GAP;

export function renderNotesSection(runtime: PdfV2Runtime, cursor: PageCursor, section: Extract<RenderSection, { renderer: "notes" }>) {
  const body = section.body.trim();
  if (!body) {
    return cursor;
  }

  cursor = ensureSpace(runtime, cursor, 70);
  drawSectionTitle(runtime, cursor, section.title, section.description);

  let lines = splitTextIntoLines(runtime.regularFont, body, contentWidth() - 20, BODY_SIZE);
  if (lines.length === 0) {
    lines = ["No notes provided"];
  }

  while (lines.length > 0) {
    if (remainingContentHeight(cursor) < 42) {
      cursor = ensureSpace(runtime, cursor, 90);
    }

    const maxLines = Math.max(1, Math.floor((remainingContentHeight(cursor) - 18) / LINE_HEIGHT));
    const chunk = lines.slice(0, maxLines);
    const height = Math.max(30, chunk.length * LINE_HEIGHT + 18);
    drawRect(cursor.page, PDF_V2_TOKENS.margin, cursor.y, contentWidth(), height, runtime.theme.surface, runtime.theme.line, 1);
    drawTextLines(cursor.page, runtime.regularFont, chunk, PDF_V2_TOKENS.margin + 10, cursor.y - 16, BODY_SIZE, runtime.theme.ink, LINE_GAP);
    cursor.y -= height + 8;
    lines = lines.slice(chunk.length);
  }

  cursor.y += 8 - PDF_V2_TOKENS.sectionGap;
  return cursor;
}
