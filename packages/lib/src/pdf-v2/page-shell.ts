import { PDFDocument, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

import { decodeStoredFile } from "../storage";
import { PDF_V2_TOKENS, PDF_V2_TYPOGRAPHY } from "./tokens";
import { buildPdfV2Theme, type PdfV2Theme } from "./theme";
import type { ReportRenderModelV2 } from "./types";

export type PdfV2Runtime = {
  pdfDoc: PDFDocument;
  regularFont: PDFFont;
  boldFont: PDFFont;
  theme: PdfV2Theme;
  model: ReportRenderModelV2;
  logoEmbedded: PDFImage | null;
};

export type PageCursor = {
  page: PDFPage;
  y: number;
  pageNumber: number;
};

export function contentWidth() {
  return PDF_V2_TOKENS.pageWidth - PDF_V2_TOKENS.margin * 2;
}

export function contentTop() {
  return PDF_V2_TOKENS.pageHeight - PDF_V2_TOKENS.margin - PDF_V2_TOKENS.headerHeight - 12;
}

export function contentBottom() {
  return PDF_V2_TOKENS.margin + PDF_V2_TOKENS.footerHeight + PDF_V2_TOKENS.minContentBottomGap;
}

export async function buildRuntime(model: ReportRenderModelV2): Promise<PdfV2Runtime> {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const theme = buildPdfV2Theme(model.branding.primaryColor, model.branding.accentColor);
  const logoEmbedded = model.branding.logoDataUrl ? await embedImage(pdfDoc, model.branding.logoDataUrl) : null;

  return { pdfDoc, regularFont, boldFont, theme, model, logoEmbedded };
}

export async function embedImage(pdfDoc: PDFDocument, dataUrl: string) {
  try {
    const decoded = await decodeStoredFile(dataUrl);
    if (decoded.mimeType === "image/png") {
      return pdfDoc.embedPng(decoded.bytes);
    }
    if (decoded.mimeType === "image/jpeg" || decoded.mimeType === "image/jpg") {
      return pdfDoc.embedJpg(decoded.bytes);
    }
  } catch {
    return null;
  }
  return null;
}

export function splitTextIntoLines(font: PDFFont, text: string, maxWidth: number, size: number, maxLines?: number) {
  const raw = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!raw) {
    return [];
  }
  const lines: string[] = [];

  for (const paragraph of raw.split("\n")) {
    const normalized = paragraph.replace(/\s+/g, " ").trim();
    if (!normalized) {
      if (!maxLines || lines.length < maxLines) {
        lines.push("");
      }
      continue;
    }

    const words = normalized.split(/\s+/).filter(Boolean).flatMap(word => {
      if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
      const chunks: string[] = [];
      let chunk = "";
      for (const character of word) {
        if (chunk && font.widthOfTextAtSize(chunk + character, size) > maxWidth) {
          chunks.push(chunk);
          chunk = "";
        }
        chunk += character;
      }
      if (chunk) chunks.push(chunk);
      return chunks;
    });
    let currentLine = "";

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
        if (maxLines && lines.length >= maxLines) {
          return lines.slice(0, maxLines);
        }
      } else if (font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(word);
        currentLine = "";
        if (maxLines && lines.length >= maxLines) {
          return lines.slice(0, maxLines);
        }
      } else {
        currentLine = candidate;
      }
    }

    if (currentLine && (!maxLines || lines.length < maxLines)) {
      lines.push(currentLine);
    }
    if (maxLines && lines.length >= maxLines) {
      return lines.slice(0, maxLines);
    }
  }

  return maxLines ? lines.slice(0, maxLines) : lines;
}

export function measureParagraphHeight(font: PDFFont, text: string, maxWidth: number, size: number, lineGap = 3, maxLines?: number) {
  const lines = splitTextIntoLines(font, text, maxWidth, size, maxLines);
  return Math.max(lines.length, 1) * (size + lineGap);
}

export function drawParagraph(page: PDFPage, font: PDFFont, text: string, x: number, y: number, maxWidth: number, size: number, color: PdfV2Theme["ink"], lineGap = 3, maxLines?: number) {
  const lines = splitTextIntoLines(font, text, maxWidth, size, maxLines);
  lines.forEach((line, index) => {
    if (line) {
      page.drawText(line, { x, y: y - index * (size + lineGap), size, font, color });
    }
  });
}

export function drawTextLines(page: PDFPage, font: PDFFont, lines: string[], x: number, y: number, size: number, color: PdfV2Theme["ink"], lineGap = 3) {
  lines.forEach((line, index) => {
    if (line) {
      page.drawText(line, { x, y: y - index * (size + lineGap), size, font, color });
    }
  });
}

export function drawRect(page: PDFPage, x: number, yTop: number, width: number, height: number, color: PdfV2Theme["surface"], borderColor?: PdfV2Theme["line"], borderWidth = 0) {
  page.drawRectangle({
    x,
    y: yTop - height,
    width,
    height,
    color,
    borderColor: borderColor ?? color,
    borderWidth
  });
}

function drawHeader(runtime: PdfV2Runtime, page: PDFPage, pageNumber: number) {
  const { model, theme, boldFont, regularFont, logoEmbedded } = runtime;
  const leftX = PDF_V2_TOKENS.margin;
  const totalWidth = contentWidth();
  const rightWidth = 222;
  const gutter = 20;
  const leftWidth = totalWidth - rightWidth - gutter;
  const rightX = leftX + leftWidth + gutter;
  const top = PDF_V2_TOKENS.pageHeight - PDF_V2_TOKENS.margin;

  const firstPage = pageNumber === 1;
  const logoHeight = firstPage ? 60 : 26;
  const logoWidth = firstPage ? 180 : 90;
  let companyY = top - 12;
  if (logoEmbedded) {
    const scaled = logoEmbedded.scale(1);
    const ratio = Math.min(logoWidth / scaled.width, logoHeight / scaled.height);
    page.drawImage(logoEmbedded, {
      x: leftX,
      y: top - scaled.height * ratio,
      width: scaled.width * ratio,
      height: scaled.height * ratio
    });
    companyY = top - logoHeight - 16;
  }
  drawParagraph(page, boldFont, model.header.companyName, leftX, companyY, leftWidth, 12, theme.ink, 3);
  let brandY = companyY - measureParagraphHeight(boldFont, model.header.companyName, leftWidth, 12, 3) - 5;
  for (const line of [model.header.contactLine, model.header.addressLine]) {
    if (!line) continue;
    drawParagraph(page, regularFont, line, leftX, brandY, leftWidth, 8, theme.muted, 3);
    brandY -= measureParagraphHeight(regularFont, line, leftWidth, 8, 3) + 4;
  }

  const titleSize = firstPage ? PDF_V2_TYPOGRAPHY.reportTitle : 12;
  drawParagraph(page, boldFont, model.header.reportTitle, rightX, top - 12, rightWidth, titleSize, theme.ink, 3);
  const metaRows: Array<[string, string]> = [
    ["Report ID", model.header.reportId],
    ["Service Date", model.header.serviceDate],
    ["Page", String(pageNumber)]
  ];
  let metaY = top - 20 - measureParagraphHeight(boldFont, model.header.reportTitle, rightWidth, titleSize, 3);
  for (const [label, value] of metaRows) {
    page.drawText(label.toUpperCase(), {
      x: rightX,
      y: metaY,
      size: 7,
      font: boldFont,
      color: theme.softText
    });
    page.drawText(value, {
      x: rightX + 76,
      y: metaY - 1,
      size: 8.5,
      font: regularFont,
      color: theme.ink
    });
    metaY -= 12;
  }

  const bottom = Math.min(brandY, metaY) - 8;
  page.drawLine({
    start: { x: PDF_V2_TOKENS.margin, y: bottom },
    end: { x: PDF_V2_TOKENS.pageWidth - PDF_V2_TOKENS.margin, y: bottom },
    thickness: 1,
    color: theme.line
  });
  return bottom - 18;
}

function drawFooter(runtime: PdfV2Runtime, page: PDFPage, pageNumber: number) {
  const { theme, regularFont, model } = runtime;
  const y = PDF_V2_TOKENS.margin - 6;
  const leftText = `${model.footer.brandLabel}  •  ${model.footer.versionLabel}`;
  const rightText = `${model.footer.documentState}  •  ${model.footer.reportId}  •  ${pageNumber}`;
  page.drawLine({
    start: { x: PDF_V2_TOKENS.margin, y: y + 14 },
    end: { x: PDF_V2_TOKENS.pageWidth - PDF_V2_TOKENS.margin, y: y + 14 },
    thickness: 1,
    color: theme.line
  });
  page.drawText(leftText, {
    x: PDF_V2_TOKENS.margin,
    y,
    size: PDF_V2_TYPOGRAPHY.footer,
    font: regularFont,
    color: theme.softText
  });
  const rightWidth = regularFont.widthOfTextAtSize(rightText, PDF_V2_TYPOGRAPHY.footer);
  page.drawText(rightText, {
    x: PDF_V2_TOKENS.pageWidth - PDF_V2_TOKENS.margin - rightWidth,
    y,
    size: PDF_V2_TYPOGRAPHY.footer,
    font: regularFont,
    color: theme.softText
  });
}

export function addPage(runtime: PdfV2Runtime, pageNumber: number): PageCursor {
  const page = runtime.pdfDoc.addPage([PDF_V2_TOKENS.pageWidth, PDF_V2_TOKENS.pageHeight]);
  const bodyTop = drawHeader(runtime, page, pageNumber);
  drawFooter(runtime, page, pageNumber);
  return {
    page,
    pageNumber,
    y: bodyTop
  };
}

export function ensureSpace(runtime: PdfV2Runtime, cursor: PageCursor, requiredHeight: number) {
  if (cursor.y - requiredHeight >= contentBottom()) {
    return cursor;
  }
  return addPage(runtime, cursor.pageNumber + 1);
}

export function remainingContentHeight(cursor: PageCursor) {
  return Math.max(0, cursor.y - contentBottom());
}

export function drawSectionTitle(runtime: PdfV2Runtime, cursor: PageCursor, title: string, description?: string) {
  if (title) {
    cursor.page.drawText(title, {
      x: PDF_V2_TOKENS.margin,
      y: cursor.y,
      size: PDF_V2_TYPOGRAPHY.sectionTitle,
      font: runtime.boldFont,
      color: runtime.theme.ink
    });
    cursor.y -= 14;
  }

  if (description) {
    drawParagraph(cursor.page, runtime.regularFont, description, PDF_V2_TOKENS.margin, cursor.y, contentWidth(), PDF_V2_TYPOGRAPHY.sectionDescriptor, runtime.theme.softText, 3, 3);
    cursor.y -= measureParagraphHeight(runtime.regularFont, description, contentWidth(), PDF_V2_TYPOGRAPHY.sectionDescriptor, 3, 3) + 8;
  } else if (title) {
    cursor.y -= 6;
  }
}
