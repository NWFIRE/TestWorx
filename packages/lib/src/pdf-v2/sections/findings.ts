import { PDF_V2_TOKENS } from "../tokens";
import { contentWidth, drawParagraph, drawRect, drawSectionTitle, ensureSpace, measureParagraphHeight, type PageCursor, type PdfV2Runtime } from "../page-shell";
import type { RenderSection } from "../types";

export function renderFindingsSection(runtime: PdfV2Runtime, cursor: PageCursor, section: Extract<RenderSection, { renderer: "findings" }>) {
  cursor = ensureSpace(runtime, cursor, 140);
  drawSectionTitle(runtime, cursor, section.title, section.description);
  for (const group of section.groups) {
    const body = group.lines.join("\n");
    const bodyHeight = measureParagraphHeight(runtime.regularFont, body, contentWidth() - 24, 9, 3, 8);
    const height = 28 + bodyHeight;
    const bg = group.tone === "fail" ? runtime.theme.failBg : group.tone === "warn" ? runtime.theme.warnBg : runtime.theme.surface;
    drawRect(cursor.page, PDF_V2_TOKENS.margin, cursor.y, contentWidth(), height, bg, runtime.theme.line, 1);
    cursor.page.drawText(group.title.toUpperCase(), {
      x: PDF_V2_TOKENS.margin + 10,
      y: cursor.y - 15,
      size: 7,
      font: runtime.boldFont,
      color: runtime.theme.softText
    });
    drawParagraph(cursor.page, runtime.regularFont, body, PDF_V2_TOKENS.margin + 10, cursor.y - 30, contentWidth() - 20, 9, runtime.theme.ink, 3, 8);
    cursor.y -= height + 10;
  }
  cursor.y -= PDF_V2_TOKENS.sectionGap - 10;
  return cursor;
}
