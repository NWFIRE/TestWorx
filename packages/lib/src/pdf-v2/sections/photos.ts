import { PDF_V2_TOKENS } from "../tokens";
import { contentWidth, drawParagraph, drawRect, drawSectionTitle, embedImage, ensureSpace, type PageCursor, type PdfV2Runtime } from "../page-shell";
import type { RenderSection } from "../types";

export async function renderPhotosSection(runtime: PdfV2Runtime, cursor: PageCursor, section: Extract<RenderSection, { renderer: "photos" }>) {
  cursor = ensureSpace(runtime, cursor, 120);
  drawSectionTitle(runtime, cursor, section.title, section.description);

  if (section.photos.length === 0) {
    drawRect(cursor.page, PDF_V2_TOKENS.margin, cursor.y, contentWidth(), 42, runtime.theme.surface, runtime.theme.line, 1);
    drawParagraph(cursor.page, runtime.regularFont, section.emptyMessage, PDF_V2_TOKENS.margin + 12, cursor.y - 20, contentWidth() - 24, 9, runtime.theme.softText);
    cursor.y -= 42 + PDF_V2_TOKENS.sectionGap;
    return cursor;
  }

  const gap = 12;
  const cardWidth = (contentWidth() - gap) / 2;
  const cardHeight = 156;
  for (let index = 0; index < section.photos.length; index += 2) {
    cursor = ensureSpace(runtime, cursor, cardHeight + 12);
    const batch = section.photos.slice(index, index + 2);
    for (const [offset, photo] of batch.entries()) {
      const x = PDF_V2_TOKENS.margin + offset * (cardWidth + gap);
      drawRect(cursor.page, x, cursor.y, cardWidth, cardHeight, runtime.theme.surface, runtime.theme.line, 1);
      cursor.page.drawText(photo.caption, {
        x: x + 10,
        y: cursor.y - 14,
        size: 8,
        font: runtime.boldFont,
        color: runtime.theme.softText
      });
      const image = await embedImage(runtime.pdfDoc, photo.storageKey);
      if (image) {
        const scaled = image.scale(1);
        const ratio = Math.min((cardWidth - 20) / scaled.width, 110 / scaled.height, 1);
        cursor.page.drawImage(image, {
          x: x + 10,
          y: cursor.y - 132,
          width: scaled.width * ratio,
          height: scaled.height * ratio
        });
      }
    }
    cursor.y -= cardHeight + 12;
  }

  cursor.y -= PDF_V2_TOKENS.sectionGap - 12;
  return cursor;
}
