import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

import { resolveTenantBranding } from "./branding";
import { getQuoteTermsContent } from "./quote-terms";
import { decodeStoredFile } from "./storage";

type QuotePdfInput = {
  tenant: {
    name: string;
    branding: unknown;
    billingEmail: string | null;
  };
  quote: {
    quoteNumber: string;
    recipientEmail: string | null;
    issuedAt: Date;
    expiresAt: Date | null;
    status: string;
    customerNotes: string | null;
    subtotal: number;
    taxAmount: number;
    total: number;
    hostedQuoteUrl?: string | null;
  };
  customerCompany: {
    name: string;
    contactName: string | null;
    billingEmail: string | null;
    phone: string | null;
  };
  site: {
    name: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
  } | null;
  lineItems: Array<{
    title: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    total: number;
  }>;
};

type Theme = {
  primary: ReturnType<typeof rgb>;
  accent: ReturnType<typeof rgb>;
  ink: ReturnType<typeof rgb>;
  muted: ReturnType<typeof rgb>;
  soft: ReturnType<typeof rgb>;
  line: ReturnType<typeof rgb>;
  surface: ReturnType<typeof rgb>;
  softSurface: ReturnType<typeof rgb>;
  successSurface: ReturnType<typeof rgb>;
  successInk: ReturnType<typeof rgb>;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 34;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const HEADER_HEIGHT = 104;

function hexToRgb(hex: string, fallback: { r: number; g: number; b: number }) {
  const normalized = hex.replace("#", "").trim();
  if (![3, 6].includes(normalized.length)) {
    return rgb(fallback.r, fallback.g, fallback.b);
  }
  const expanded = normalized.length === 3 ? normalized.split("").map((part) => `${part}${part}`).join("") : normalized;
  const parsed = Number.parseInt(expanded, 16);
  if (Number.isNaN(parsed)) {
    return rgb(fallback.r, fallback.g, fallback.b);
  }
  return rgb(((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255);
}

function buildTheme(primaryHex?: string | null, accentHex?: string | null): Theme {
  return {
    primary: hexToRgb(primaryHex ?? "#1E3A5F", { r: 0.12, g: 0.23, b: 0.37 }),
    accent: hexToRgb(accentHex ?? "#C2410C", { r: 0.76, g: 0.25, b: 0.05 }),
    ink: rgb(0.09, 0.13, 0.19),
    muted: rgb(0.35, 0.4, 0.47),
    soft: rgb(0.5, 0.56, 0.63),
    line: rgb(0.88, 0.91, 0.95),
    surface: rgb(1, 1, 1),
    softSurface: rgb(0.972, 0.979, 0.987),
    successSurface: rgb(0.93, 0.975, 0.947),
    successInk: rgb(0.11, 0.41, 0.24)
  };
}

function formatDate(value: Date | null | undefined) {
  return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value) : "—";
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function wrap(font: PDFFont, text: string, maxWidth: number, size: number) {
  const safeText = text.trim() || "—";
  const words = safeText.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : ["—"];
}

function paragraphHeight(font: PDFFont, text: string, maxWidth: number, size: number, gap = 3) {
  return wrap(font, text, maxWidth, size).length * (size + gap);
}

function drawParagraph(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  color: ReturnType<typeof rgb>,
  gap = 3
) {
  const lines = wrap(font, text, maxWidth, size);
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * (size + gap),
      size,
      font,
      color
    });
  });
  return y - lines.length * (size + gap);
}

function drawRect(
  page: PDFPage,
  x: number,
  yTop: number,
  width: number,
  height: number,
  color: ReturnType<typeof rgb>,
  borderColor?: ReturnType<typeof rgb>
) {
  page.drawRectangle({
    x,
    y: yTop - height,
    width,
    height,
    color,
    borderColor: borderColor ?? color,
    borderWidth: 1
  });
}

async function embedImage(pdfDoc: PDFDocument, dataUrl: string | null | undefined) {
  if (!dataUrl) {
    return null;
  }

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

function buildSummaryFields(input: QuotePdfInput) {
  return [
    { label: "Customer", value: input.customerCompany.name },
    input.customerCompany.contactName || input.quote.recipientEmail
      ? { label: "Contact", value: input.customerCompany.contactName ?? input.quote.recipientEmail ?? "" }
      : null,
    input.customerCompany.phone ? { label: "Phone", value: input.customerCompany.phone } : null,
    input.site?.name ? { label: "Site", value: input.site.name } : null,
    { label: "Issued", value: formatDate(input.quote.issuedAt) },
    input.quote.expiresAt ? { label: "Expiration", value: formatDate(input.quote.expiresAt) } : null
  ].filter((field): field is { label: string; value: string } => Boolean(field));
}

function drawHeader(
  input: QuotePdfInput,
  page: PDFPage,
  theme: Theme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  logo: PDFImage | null,
  pageNumber: number
) {
  const branding = resolveTenantBranding({
    tenantName: input.tenant.name,
    branding: input.tenant.branding,
    billingEmail: input.tenant.billingEmail
  });
  const top = PAGE_HEIGHT - PAGE_MARGIN;
  const metaX = PAGE_WIDTH - PAGE_MARGIN - 190;

  if (logo) {
    const scaled = logo.scale(1);
    const ratio = Math.min(54 / scaled.height, 150 / scaled.width, 1);
    page.drawImage(logo, {
      x: PAGE_MARGIN,
      y: top - 56,
      width: scaled.width * ratio,
      height: scaled.height * ratio
    });
  } else {
    page.drawText(branding.legalBusinessName || input.tenant.name, {
      x: PAGE_MARGIN,
      y: top - 24,
      size: 18,
      font: boldFont,
      color: theme.ink
    });
  }

  const companyTextX = logo ? PAGE_MARGIN + 164 : PAGE_MARGIN;
  page.drawText(branding.legalBusinessName || input.tenant.name, {
    x: companyTextX,
    y: top - 22,
    size: logo ? 16 : 0,
    font: boldFont,
    color: theme.ink
  });

  const contactLines = [
    [branding.phone, branding.email].filter(Boolean).join(" | "),
    branding.website || ""
  ].filter(Boolean);
  let contactY = top - 38;
  for (const line of contactLines) {
    page.drawText(line, {
      x: companyTextX,
      y: contactY,
      size: 8.5,
      font: regularFont,
      color: theme.muted
    });
    contactY -= 12;
  }

  page.drawText("Customer Quote", {
    x: metaX,
    y: top - 20,
    size: 19,
    font: boldFont,
    color: theme.ink
  });

  const headerMeta: Array<[string, string]> = [
    ["Quote Number", input.quote.quoteNumber],
    ["Issue Date", formatDate(input.quote.issuedAt)],
    ["Expiration", formatDate(input.quote.expiresAt)],
    ["Page", String(pageNumber)]
  ];

  let metaY = top - 42;
  headerMeta.forEach(([label, value]) => {
    page.drawText(label.toUpperCase(), {
      x: metaX,
      y: metaY,
      size: 7.5,
      font: boldFont,
      color: theme.soft
    });
    page.drawText(value, {
      x: metaX + 88,
      y: metaY,
      size: 8.5,
      font: regularFont,
      color: theme.ink
    });
    metaY -= 14;
  });

  page.drawLine({
    start: { x: PAGE_MARGIN, y: PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT },
    end: { x: PAGE_WIDTH - PAGE_MARGIN, y: PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT },
    thickness: 1,
    color: theme.line
  });

  page.drawText(branding.legalBusinessName || input.tenant.name, {
    x: PAGE_MARGIN,
    y: PAGE_MARGIN - 2,
    size: 8,
    font: regularFont,
    color: theme.soft
  });
  const pageLabel = `Page ${pageNumber}`;
  page.drawText(pageLabel, {
    x: PAGE_WIDTH - PAGE_MARGIN - regularFont.widthOfTextAtSize(pageLabel, 8),
    y: PAGE_MARGIN - 2,
    size: 8,
    font: regularFont,
    color: theme.soft
  });
}

function drawKpis(input: QuotePdfInput, page: PDFPage, theme: Theme, boldFont: PDFFont, regularFont: PDFFont, top: number) {
  const gap = 12;
  const width = (CONTENT_WIDTH - gap * 2) / 3;
  const cards = [
    { label: "Status", value: input.quote.status.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase()), bg: theme.softSurface, color: theme.primary, size: 13 },
    { label: "Total", value: money(input.quote.total), bg: theme.surface, color: theme.ink, size: 18 },
    { label: "Expiration", value: formatDate(input.quote.expiresAt), bg: theme.softSurface, color: theme.ink, size: 13 }
  ];

  cards.forEach((card, index) => {
    const x = PAGE_MARGIN + index * (width + gap);
    drawRect(page, x, top, width, 64, card.bg, theme.line);
    const labelWidth = boldFont.widthOfTextAtSize(card.label.toUpperCase(), 7);
    page.drawText(card.label.toUpperCase(), {
      x: x + width / 2 - labelWidth / 2,
      y: top - 16,
      size: 7,
      font: boldFont,
      color: theme.soft
    });
    const valueWidth = boldFont.widthOfTextAtSize(card.value, card.size);
    page.drawText(card.value, {
      x: x + width / 2 - valueWidth / 2,
      y: top - 39,
      size: card.size,
      font: boldFont,
      color: card.color
    });
  });

  const statusChipWidth = Math.max(72, regularFont.widthOfTextAtSize(cards[0]!.value, 8.5) + 18);
  drawRect(page, PAGE_MARGIN + 18, top - 34, statusChipWidth, 20, theme.successSurface, theme.successSurface);
  page.drawText(cards[0]!.value, {
    x: PAGE_MARGIN + 18 + statusChipWidth / 2 - regularFont.widthOfTextAtSize(cards[0]!.value, 8.5) / 2,
    y: top - 47,
    size: 8.5,
    font: regularFont,
    color: theme.successInk
  });
}

function drawSectionTitle(page: PDFPage, title: string, y: number, boldFont: PDFFont, theme: Theme) {
  page.drawText(title, {
    x: PAGE_MARGIN,
    y,
    size: 13,
    font: boldFont,
    color: theme.ink
  });
}

function renderSummary(page: PDFPage, input: QuotePdfInput, theme: Theme, boldFont: PDFFont, regularFont: PDFFont, startY: number) {
  let y = startY;
  drawSectionTitle(page, "Quote Summary", y, boldFont, theme);
  y -= 16;

  const fields = buildSummaryFields(input);
  const gap = 12;
  const width = (CONTENT_WIDTH - gap) / 2;

  for (let index = 0; index < fields.length; index += 2) {
    const rowFields = fields.slice(index, index + 2);
    const rowHeight = rowFields.reduce((maxHeight, field) => {
      const contentHeight = 24 + paragraphHeight(regularFont, field.value, width - 20, 10, 3);
      return Math.max(maxHeight, Math.max(46, contentHeight));
    }, 46);

    rowFields.forEach((field, columnIndex) => {
      const x = PAGE_MARGIN + columnIndex * (width + gap);
      drawRect(page, x, y, width, rowHeight, theme.surface, theme.line);
      page.drawText(field.label.toUpperCase(), {
        x: x + 10,
        y: y - 14,
        size: 7,
        font: boldFont,
        color: theme.soft
      });
      drawParagraph(page, regularFont, field.value, x + 10, y - 28, width - 20, 10, theme.ink);
    });

    y -= rowHeight + 10;
  }

  return y - 4;
}

function renderLineItems(page: PDFPage, input: QuotePdfInput, theme: Theme, boldFont: PDFFont, regularFont: PDFFont, startY: number) {
  let y = startY;
  drawSectionTitle(page, "Quoted Work", y, boldFont, theme);
  y -= 16;

  const columns = [
    { label: "Service", width: 0.27, align: "left" as const },
    { label: "Description", width: 0.35, align: "left" as const },
    { label: "Qty", width: 0.1, align: "right" as const },
    { label: "Unit Price", width: 0.13, align: "right" as const },
    { label: "Total", width: 0.15, align: "right" as const }
  ];

  drawRect(page, PAGE_MARGIN, y, CONTENT_WIDTH, 24, theme.softSurface, theme.line);
  let x = PAGE_MARGIN;
  for (const column of columns) {
    const width = CONTENT_WIDTH * column.width;
    const textWidth = boldFont.widthOfTextAtSize(column.label, 7.5);
    page.drawText(column.label, {
      x: column.align === "right" ? x + width - 10 - textWidth : x + 10,
      y: y - 15,
      size: 7.5,
      font: boldFont,
      color: theme.muted
    });
    x += width;
  }
  y -= 24;

  input.lineItems.forEach((line, index) => {
    const values = [
      line.title,
      line.description?.trim() || "—",
      String(line.quantity),
      money(line.unitPrice),
      money(line.total)
    ];
    const rowHeight = Math.max(
      36,
      16 + Math.max(
        paragraphHeight(regularFont, values[0]!, CONTENT_WIDTH * columns[0]!.width - 20, 8.5),
        paragraphHeight(regularFont, values[1]!, CONTENT_WIDTH * columns[1]!.width - 20, 8.5)
      )
    );

    drawRect(page, PAGE_MARGIN, y, CONTENT_WIDTH, rowHeight, index % 2 === 0 ? theme.surface : theme.softSurface, theme.line);
    let columnX = PAGE_MARGIN;
    columns.forEach((column, columnIndex) => {
      const width = CONTENT_WIDTH * column.width;
      const value = values[columnIndex]!;
      if (column.align === "right") {
        const valueWidth = regularFont.widthOfTextAtSize(value, 8.5);
        page.drawText(value, {
          x: columnX + width - 10 - valueWidth,
          y: y - 14,
          size: 8.5,
          font: columnIndex === values.length - 1 ? boldFont : regularFont,
          color: columnIndex === values.length - 1 ? theme.ink : theme.muted
        });
      } else {
        drawParagraph(
          page,
          columnIndex === 0 ? boldFont : regularFont,
          value,
          columnX + 10,
          y - 14,
          width - 20,
          8.5,
          columnIndex === 0 ? theme.ink : theme.muted
        );
      }
      columnX += width;
    });
    y -= rowHeight;
  });

  return y - 18;
}

function renderTotals(page: PDFPage, input: QuotePdfInput, theme: Theme, boldFont: PDFFont, regularFont: PDFFont, startY: number) {
  const boxWidth = 230;
  const x = PAGE_WIDTH - PAGE_MARGIN - boxWidth;
  const y = startY;
  drawRect(page, x, y, boxWidth, 96, theme.surface, theme.line);
  const rows: Array<[string, string]> = [
    ["Subtotal", money(input.quote.subtotal)],
    ["Tax", money(input.quote.taxAmount)],
    ["Total", money(input.quote.total)]
  ];
  let rowY = y - 16;
  rows.forEach(([label, value], index) => {
    const isTotal = index === rows.length - 1;
    const font = isTotal ? boldFont : regularFont;
    const size = isTotal ? 12 : 9.5;
    page.drawText(label, {
      x: x + 14,
      y: rowY,
      size,
      font,
      color: isTotal ? theme.ink : theme.muted
    });
    page.drawText(value, {
      x: x + boxWidth - 14 - font.widthOfTextAtSize(value, size),
      y: rowY,
      size,
      font,
      color: theme.ink
    });
    if (isTotal) {
      page.drawLine({
        start: { x: x + 14, y: rowY + 9 },
        end: { x: x + boxWidth - 14, y: rowY + 9 },
        thickness: 1,
        color: theme.line
      });
    }
    rowY -= isTotal ? 24 : 20;
  });

  return y - 112;
}

function renderNotes(page: PDFPage, text: string, theme: Theme, boldFont: PDFFont, regularFont: PDFFont, startY: number) {
  let y = startY;
  drawSectionTitle(page, "Additional Quote Notes", y, boldFont, theme);
  y -= 16;
  const height = 26 + paragraphHeight(regularFont, text, CONTENT_WIDTH - 20, 9);
  drawRect(page, PAGE_MARGIN, y, CONTENT_WIDTH, height, theme.softSurface, theme.line);
  drawParagraph(page, regularFont, text, PAGE_MARGIN + 10, y - 14, CONTENT_WIDTH - 20, 9, theme.ink);
  return y - height - 16;
}

function renderProjectTerms(page: PDFPage, theme: Theme, boldFont: PDFFont, regularFont: PDFFont, startY: number) {
  const terms = getQuoteTermsContent();
  let y = startY;
  drawSectionTitle(page, terms.title, y, boldFont, theme);
  y -= 16;

  if (terms.intro) {
    const introHeight = 26 + paragraphHeight(regularFont, terms.intro, CONTENT_WIDTH - 20, 9);
    drawRect(page, PAGE_MARGIN, y, CONTENT_WIDTH, introHeight, theme.surface, theme.line);
    drawParagraph(page, regularFont, terms.intro, PAGE_MARGIN + 10, y - 14, CONTENT_WIDTH - 20, 9, theme.ink);
    y -= introHeight + 12;
  }

  const emphasisHeight = 36 + paragraphHeight(regularFont, terms.emphasisBody, CONTENT_WIDTH - 20, 9);
  drawRect(page, PAGE_MARGIN, y, CONTENT_WIDTH, emphasisHeight, theme.softSurface, theme.line);
  page.drawText(terms.emphasisTitle.toUpperCase(), {
    x: PAGE_MARGIN + 10,
    y: y - 14,
    size: 7.5,
    font: boldFont,
    color: theme.primary
  });
  drawParagraph(page, regularFont, terms.emphasisBody, PAGE_MARGIN + 10, y - 29, CONTENT_WIDTH - 20, 9, theme.ink);
  y -= emphasisHeight + 12;

  for (const section of terms.sections) {
    const bulletHeight = (section.bullets ?? []).length * 14;
    const bodyHeight = (section.body ?? []).reduce((sum, paragraph) => sum + paragraphHeight(regularFont, paragraph, CONTENT_WIDTH - 20, 9) + 8, 0);
    const sectionHeight = 24 + bodyHeight + bulletHeight + 10;
    drawRect(page, PAGE_MARGIN, y, CONTENT_WIDTH, sectionHeight, theme.surface, theme.line);
    page.drawText(section.title.toUpperCase(), {
      x: PAGE_MARGIN + 10,
      y: y - 14,
      size: 7.5,
      font: boldFont,
      color: theme.muted
    });

    let sectionY = y - 30;
    for (const paragraph of section.body ?? []) {
      sectionY = drawParagraph(page, regularFont, paragraph, PAGE_MARGIN + 10, sectionY, CONTENT_WIDTH - 20, 9, theme.ink) - 5;
    }

    for (const bullet of section.bullets ?? []) {
      page.drawCircle({
        x: PAGE_MARGIN + 13,
        y: sectionY + 4,
        size: 1.8,
        color: theme.soft
      });
      sectionY = drawParagraph(page, regularFont, bullet, PAGE_MARGIN + 22, sectionY + 8, CONTENT_WIDTH - 32, 9, theme.ink) - 1;
    }

    y -= sectionHeight + 10;
  }

  return y - 6;
}

function renderHostedLink(page: PDFPage, url: string, theme: Theme, boldFont: PDFFont, regularFont: PDFFont, startY: number) {
  let y = startY;
  drawSectionTitle(page, "Review and Approve Online", y, boldFont, theme);
  y -= 16;
  const copy = "Use the secure link below to review the quote online, download the latest PDF, and approve it digitally.";
  const height = 38 + paragraphHeight(regularFont, copy, CONTENT_WIDTH - 20, 9) + paragraphHeight(regularFont, url, CONTENT_WIDTH - 20, 8);
  drawRect(page, PAGE_MARGIN, y, CONTENT_WIDTH, height, theme.surface, theme.line);
  const afterCopy = drawParagraph(page, regularFont, copy, PAGE_MARGIN + 10, y - 14, CONTENT_WIDTH - 20, 9, theme.ink);
  drawParagraph(page, regularFont, url, PAGE_MARGIN + 10, afterCopy - 8, CONTENT_WIDTH - 20, 8, theme.primary);
  return y - height - 10;
}

export async function generateQuotePdf(input: QuotePdfInput) {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const branding = resolveTenantBranding({
    tenantName: input.tenant.name,
    branding: input.tenant.branding,
    billingEmail: input.tenant.billingEmail
  });
  const theme = buildTheme(branding.primaryColor, branding.accentColor);
  const logo = await embedImage(pdfDoc, branding.logoDataUrl);

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawHeader(input, page, theme, boldFont, regularFont, logo, 1);

  let y = PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT - 18;
  drawKpis(input, page, theme, boldFont, regularFont, y);
  y -= 82;
  y = renderSummary(page, input, theme, boldFont, regularFont, y);
  y = renderLineItems(page, input, theme, boldFont, regularFont, y);
  y = renderTotals(page, input, theme, boldFont, regularFont, y);
  y = renderProjectTerms(page, theme, boldFont, regularFont, y);

  if (input.quote.customerNotes?.trim()) {
    y = renderNotes(page, input.quote.customerNotes, theme, boldFont, regularFont, y);
  }

  if (input.quote.hostedQuoteUrl) {
    renderHostedLink(page, input.quote.hostedQuoteUrl, theme, boldFont, regularFont, y);
  }

  return pdfDoc.save();
}
