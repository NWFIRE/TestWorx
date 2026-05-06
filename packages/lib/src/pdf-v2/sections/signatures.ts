import { PDF_V2_TOKENS } from "../tokens";
import { contentWidth, drawParagraph, drawRect, drawSectionTitle, embedImage, ensureSpace, type PageCursor, type PdfV2Runtime } from "../page-shell";
import type { RenderSection } from "../types";

export async function renderSignaturesSection(runtime: PdfV2Runtime, cursor: PageCursor, section: Extract<RenderSection, { renderer: "signatures" }>) {
  if (section.signatures.length === 0) {
    return cursor;
  }

  const gap = 12;
  const cardWidth = (contentWidth() - gap) / 2;
  const cardHeight = 108;
  cursor = ensureSpace(runtime, cursor, cardHeight + 48);
  drawSectionTitle(runtime, cursor, section.title, section.description);

  for (let index = 0; index < section.signatures.length; index += 2) {
    cursor = ensureSpace(runtime, cursor, cardHeight + 10);
    const batch = section.signatures.slice(index, index + 2);
    for (const [offset, signature] of batch.entries()) {
      const x = PDF_V2_TOKENS.margin + offset * (cardWidth + gap);
      drawRect(cursor.page, x, cursor.y, cardWidth, cardHeight, runtime.theme.surface, runtime.theme.line, 1);
      cursor.page.drawText(signature.role, {
        x: x + 10,
        y: cursor.y - 15,
        size: 8,
        font: runtime.boldFont,
        color: runtime.theme.softText
      });
      drawParagraph(cursor.page, runtime.regularFont, signature.signerName || "Not captured", x + 10, cursor.y - 31, cardWidth - 20, 9, runtime.theme.ink, 3, 2);
      drawParagraph(cursor.page, runtime.regularFont, signature.signedAt || "Not captured", x + 10, cursor.y - 47, cardWidth - 20, 8, runtime.theme.softText, 3, 2);
      if (signature.imageDataUrl) {
        const image = await embedImage(runtime.pdfDoc, signature.imageDataUrl);
        if (image) {
          const scaled = image.scale(1);
          const ratio = Math.min((cardWidth - 20) / scaled.width, 38 / scaled.height, 1);
          cursor.page.drawImage(image, {
            x: x + 10,
            y: cursor.y - 92,
            width: scaled.width * ratio,
            height: scaled.height * ratio
          });
        }
      }
    }
    cursor.y -= cardHeight + 10;
  }

  cursor.y += 10 - PDF_V2_TOKENS.sectionGap;
  return cursor;
}
