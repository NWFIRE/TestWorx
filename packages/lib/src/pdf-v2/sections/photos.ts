import { PDF_V2_TOKENS } from "../tokens";
import { contentWidth, drawParagraph, drawRect, drawSectionTitle, embedImage, ensureSpace, type PageCursor, type PdfV2Runtime } from "../page-shell";
import type { RenderSection } from "../types";

function photoLayout(count: number) {
  if (count === 1) {
    return { columns: 1, cardHeight: 220, imageHeight: 168 };
  }
  if (count === 2) {
    return { columns: 2, cardHeight: 184, imageHeight: 132 };
  }
  return { columns: 2, cardHeight: 150, imageHeight: 100 };
}

export async function renderPhotosSection(runtime: PdfV2Runtime, cursor: PageCursor, section: Extract<RenderSection, { renderer: "photos" }>) {
  if (section.photos.length === 0) {
    return cursor;
  }

  cursor = ensureSpace(runtime, cursor, 96);
  drawSectionTitle(runtime, cursor, section.title, section.description);

  const gap = 12;
  const layout = photoLayout(section.photos.length);
  const cardWidth = (contentWidth() - gap * (layout.columns - 1)) / layout.columns;

  for (let index = 0; index < section.photos.length; index += layout.columns) {
    cursor = ensureSpace(runtime, cursor, layout.cardHeight + 10);
    const batch = section.photos.slice(index, index + layout.columns);
    for (const [offset, photo] of batch.entries()) {
      const x = PDF_V2_TOKENS.margin + offset * (cardWidth + gap);
      drawRect(cursor.page, x, cursor.y, cardWidth, layout.cardHeight, runtime.theme.surface, runtime.theme.line, 1);
      drawParagraph(cursor.page, runtime.boldFont, photo.caption, x + 10, cursor.y - 14, cardWidth - 20, 8, runtime.theme.softText, 3, 2);
      const image = await embedImage(runtime.pdfDoc, photo.storageKey);
      if (image) {
        const scaled = image.scale(1);
        const maxWidth = cardWidth - 20;
        const ratio = Math.min(maxWidth / scaled.width, layout.imageHeight / scaled.height, 1);
        const width = scaled.width * ratio;
        const height = scaled.height * ratio;
        cursor.page.drawImage(image, {
          x: x + 10 + (maxWidth - width) / 2,
          y: cursor.y - 40 - height,
          width,
          height
        });
      }
    }
    cursor.y -= layout.cardHeight + 10;
  }

  cursor.y += 10 - PDF_V2_TOKENS.sectionGap;
  return cursor;
}
