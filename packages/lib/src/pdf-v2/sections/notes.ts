import { PDF_V2_TOKENS } from "../tokens";
import { contentWidth, drawParagraph, drawRect, drawSectionTitle, ensureSpace, measureParagraphHeight, type PageCursor, type PdfV2Runtime } from "../page-shell";
import type { RenderSection } from "../types";

export function renderNotesSection(runtime: PdfV2Runtime, cursor: PageCursor, section: Extract<RenderSection, { renderer: "notes" }>) {
  cursor = ensureSpace(runtime, cursor, 100);
  drawSectionTitle(runtime, cursor, section.title, section.description);
  const height = 24 + measureParagraphHeight(runtime.regularFont, section.body, contentWidth() - 20, 9, 3, 14);
  drawRect(cursor.page, PDF_V2_TOKENS.margin, cursor.y, contentWidth(), height, runtime.theme.surface, runtime.theme.line, 1);
  drawParagraph(cursor.page, runtime.regularFont, section.body, PDF_V2_TOKENS.margin + 10, cursor.y - 18, contentWidth() - 20, 9, runtime.theme.ink, 3, 14);
  cursor.y -= height + PDF_V2_TOKENS.sectionGap;
  return cursor;
}
