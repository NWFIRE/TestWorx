import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

import { resolveTenantBranding } from "./branding";
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
  positiveBg: ReturnType<typeof rgb>;
  positiveText: ReturnType<typeof rgb>;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const BODY_TOP = PAGE_HEIGHT - PAGE_MARGIN - 120;
const BODY_BOTTOM = PAGE_MARGIN + 36;

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
    muted: rgb(0.34, 0.39, 0.47),
    soft: rgb(0.5, 0.56, 0.63),
    line: rgb(0.86, 0.9, 0.94),
    surface: rgb(1, 1, 1),
    softSurface: rgb(0.972, 0.979, 0.987),
    positiveBg: rgb(0.93, 0.975, 0.947),
    positiveText: rgb(0.11, 0.41, 0.24)
  };
}

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function wrap(font: PDFFont, text: string, maxWidth: number, size: number) {
  const words = (text.trim() || "—").split(/\s+/).filter(Boolean);
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

function drawParagraph(page: PDFPage, font: PDFFont, text: string, x: number, y: number, maxWidth: number, size: number, color: ReturnType<typeof rgb>, gap = 3) {
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

function drawRect(page: PDFPage, x: number, yTop: number, width: number, height: number, color: ReturnType<typeof rgb>, borderColor?: ReturnType<typeof rgb>) {
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

function drawPageChrome(input: QuotePdfInput, page: PDFPage, theme: Theme, boldFont: PDFFont, regularFont: PDFFont, logo: PDFImage | null, pageNumber: number) {
  const branding = resolveTenantBranding({
    tenantName: input.tenant.name,
    branding: input.tenant.branding,
    billingEmail: input.tenant.billingEmail
  });

  const headerTop = PAGE_HEIGHT - PAGE_MARGIN;
  const rightX = PAGE_WIDTH - PAGE_MARGIN;

  if (logo) {
    const scaled = logo.scale(1);
    const ratio = Math.min(52 / scaled.width, 52 / scaled.height, 1);
    page.drawImage(logo, {
      x: PAGE_MARGIN,
      y: headerTop - 54,
      width: scaled.width * ratio,
      height: scaled.height * ratio
    });
  } else {
    drawRect(page, PAGE_MARGIN, headerTop - 2, 52, 52, theme.softSurface, theme.line);
    page.drawText((branding.legalBusinessName || input.tenant.name).slice(0, 2).toUpperCase(), {
      x: PAGE_MARGIN + 13,
      y: headerTop - 33,
      size: 18,
      font: boldFont,
      color: theme.primary
    });
  }

  page.drawText(branding.legalBusinessName || input.tenant.name, {
    x: PAGE_MARGIN + 64,
    y: headerTop - 18,
    size: 16,
    font: boldFont,
    color: theme.ink
  });

  const contactLines = [
    [branding.phone, branding.email].filter(Boolean).join(" • "),
    branding.website || ""
  ].filter(Boolean);
  let contactY = headerTop - 34;
  for (const line of contactLines) {
    page.drawText(line, {
      x: PAGE_MARGIN + 64,
      y: contactY,
      size: 8.5,
      font: regularFont,
      color: theme.soft
    });
    contactY -= 12;
  }

  const title = "Customer Quote";
  page.drawText(title, {
    x: rightX - boldFont.widthOfTextAtSize(title, 18),
    y: headerTop - 18,
    size: 18,
    font: boldFont,
    color: theme.ink
  });

  const meta: Array<[string, string]> = [
    ["Quote", input.quote.quoteNumber],
    ["Issued", formatDate(input.quote.issuedAt)],
    ["Page", `${pageNumber}`]
  ];
  let metaY = headerTop - 36;
  for (const [label, value] of meta) {
    const labelWidth = regularFont.widthOfTextAtSize(label, 8);
    const valueWidth = boldFont.widthOfTextAtSize(value, 8.5);
    const x = rightX - Math.max(labelWidth, valueWidth);
    page.drawText(label, { x, y: metaY, size: 8, font: regularFont, color: theme.soft });
    page.drawText(value, { x: rightX - valueWidth, y: metaY - 11, size: 8.5, font: boldFont, color: theme.ink });
    metaY -= 24;
  }

  page.drawLine({
    start: { x: PAGE_MARGIN, y: PAGE_HEIGHT - PAGE_MARGIN - 84 },
    end: { x: PAGE_WIDTH - PAGE_MARGIN, y: PAGE_HEIGHT - PAGE_MARGIN - 84 },
    thickness: 1,
    color: theme.line
  });

  const footerLabel = branding.legalBusinessName || input.tenant.name;
  page.drawText(footerLabel, {
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

function drawKpis(input: QuotePdfInput, page: PDFPage, theme: Theme, boldFont: PDFFont, regularFont: PDFFont) {
  const top = BODY_TOP;
  const gap = 10;
  const width = (CONTENT_WIDTH - gap * 2) / 3;
  const cards = [
    { label: "Status", value: input.quote.status.replaceAll("_", " "), bg: theme.softSurface, text: theme.primary },
    { label: "Expiry", value: formatDate(input.quote.expiresAt), bg: theme.softSurface, text: theme.ink },
    { label: "Total", value: money(input.quote.total), bg: theme.positiveBg, text: theme.positiveText }
  ];

  cards.forEach((card, index) => {
    const x = PAGE_MARGIN + index * (width + gap);
    drawRect(page, x, top, width, 64, card.bg, theme.line);
    page.drawText(card.label.toUpperCase(), {
      x: x + width / 2 - boldFont.widthOfTextAtSize(card.label.toUpperCase(), 7) / 2,
      y: top - 16,
      size: 7,
      font: boldFont,
      color: theme.soft
    });
    page.drawText(card.value, {
      x: x + width / 2 - boldFont.widthOfTextAtSize(card.value, 16) / 2,
      y: top - 40,
      size: 16,
      font: boldFont,
      color: card.text
    });
  });
}

function renderSummary(page: PDFPage, input: QuotePdfInput, theme: Theme, boldFont: PDFFont, regularFont: PDFFont) {
  const top = BODY_TOP - 88;
  page.drawText("Quote summary", {
    x: PAGE_MARGIN,
    y: top,
    size: 13,
    font: boldFont,
    color: theme.ink
  });

  const fields: Array<[string, string]> = [
    ["Customer", input.customerCompany.name],
    ["Contact", input.quote.recipientEmail || input.customerCompany.contactName || input.customerCompany.billingEmail || "—"],
    ["Site", input.site?.name || "—"],
    ["Phone", input.customerCompany.phone || "—"],
    ["Issued", formatDate(input.quote.issuedAt)],
    ["Expires", formatDate(input.quote.expiresAt)]
  ];

  const gap = 12;
  const width = (CONTENT_WIDTH - gap) / 2;
  let y = top - 18;
  for (let index = 0; index < fields.length; index += 2) {
    for (let col = 0; col < 2; col += 1) {
      const field = fields[index + col];
      if (!field) {
        continue;
      }
      const x = PAGE_MARGIN + col * (width + gap);
      drawRect(page, x, y, width, 46, theme.surface, theme.line);
      page.drawText(field[0].toUpperCase(), {
        x: x + 10,
        y: y - 14,
        size: 7,
        font: boldFont,
        color: theme.soft
      });
      drawParagraph(page, regularFont, field[1], x + 10, y - 28, width - 20, 10, theme.ink);
    }
    y -= 58;
  }

  return y - 8;
}

function renderLineItems(page: PDFPage, input: QuotePdfInput, theme: Theme, boldFont: PDFFont, regularFont: PDFFont, startY: number) {
  let y = startY;
  page.drawText("Quoted work", {
    x: PAGE_MARGIN,
    y,
    size: 13,
    font: boldFont,
    color: theme.ink
  });
  y -= 16;

  const columns = [
    { label: "Service", width: 0.38 },
    { label: "Description", width: 0.28 },
    { label: "Qty", width: 0.08 },
    { label: "Unit", width: 0.12 },
    { label: "Line total", width: 0.14 }
  ];

  drawRect(page, PAGE_MARGIN, y, CONTENT_WIDTH, 22, theme.softSurface, theme.line);
  let x = PAGE_MARGIN;
  for (const column of columns) {
    const width = CONTENT_WIDTH * column.width;
    page.drawText(column.label.toUpperCase(), {
      x: x + 8,
      y: y - 14,
      size: 7,
      font: boldFont,
      color: theme.soft
    });
    x += width;
  }
  y -= 22;

  input.lineItems.forEach((line, index) => {
    const cells: [string, string, string, string, string] = [
      line.title,
      line.description || "—",
      `${line.quantity}`,
      money(line.unitPrice),
      money(line.total)
    ];
    const rowHeight = Math.max(
      34,
      16 + Math.max(
        paragraphHeight(regularFont, cells[0], CONTENT_WIDTH * columns[0]!.width - 16, 8.5),
        paragraphHeight(regularFont, cells[1], CONTENT_WIDTH * columns[1]!.width - 16, 8.5)
      )
    );
    drawRect(page, PAGE_MARGIN, y, CONTENT_WIDTH, rowHeight, index % 2 === 0 ? theme.surface : theme.softSurface, theme.line);
    let currentX = PAGE_MARGIN;
    columns.forEach((column, cellIndex) => {
      const width = CONTENT_WIDTH * column.width;
      drawParagraph(page, regularFont, cells[cellIndex]!, currentX + 8, y - 12, width - 16, 8.5, theme.ink);
      currentX += width;
    });
    y -= rowHeight;
  });

  return y - 16;
}

function renderTotals(page: PDFPage, input: QuotePdfInput, theme: Theme, boldFont: PDFFont, regularFont: PDFFont, startY: number) {
  const boxWidth = 220;
  const x = PAGE_WIDTH - PAGE_MARGIN - boxWidth;
  drawRect(page, x, startY, boxWidth, 88, theme.surface, theme.line);
  const rows: Array<[string, string]> = [
    ["Subtotal", money(input.quote.subtotal)],
    ["Tax", money(input.quote.taxAmount)],
    ["Total", money(input.quote.total)]
  ];
  let y = startY - 16;
  rows.forEach(([label, value], index) => {
    const font = index === rows.length - 1 ? boldFont : regularFont;
    const size = index === rows.length - 1 ? 11 : 9.5;
    page.drawText(label, { x: x + 12, y, size, font, color: theme.ink });
    page.drawText(value, {
      x: x + boxWidth - 12 - font.widthOfTextAtSize(value, size),
      y,
      size,
      font,
      color: theme.ink
    });
    y -= 22;
  });

  return startY - 104;
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
  drawPageChrome(input, page, theme, boldFont, regularFont, logo, 1);
  drawKpis(input, page, theme, boldFont, regularFont);
  const afterSummary = renderSummary(page, input, theme, boldFont, regularFont);
  const afterTable = renderLineItems(page, input, theme, boldFont, regularFont, afterSummary);
  let y = renderTotals(page, input, theme, boldFont, regularFont, afterTable);

  if (input.quote.customerNotes?.trim()) {
    page.drawText("Customer notes", {
      x: PAGE_MARGIN,
      y,
      size: 13,
      font: boldFont,
      color: theme.ink
    });
    y -= 16;
    const height = 28 + paragraphHeight(regularFont, input.quote.customerNotes, CONTENT_WIDTH - 20, 9);
    drawRect(page, PAGE_MARGIN, y, CONTENT_WIDTH, height, theme.softSurface, theme.line);
    drawParagraph(page, regularFont, input.quote.customerNotes, PAGE_MARGIN + 10, y - 14, CONTENT_WIDTH - 20, 9, theme.ink);
    y -= height + 16;
  }

  if (input.quote.hostedQuoteUrl) {
    page.drawText("Review and approve online", {
      x: PAGE_MARGIN,
      y,
      size: 13,
      font: boldFont,
      color: theme.ink
    });
    y -= 16;
    const hostedCopy = "Use the secure quote link below to review the quote online, download the latest PDF, and respond digitally.";
    const urlText = input.quote.hostedQuoteUrl;
    const height = 40 + paragraphHeight(regularFont, hostedCopy, CONTENT_WIDTH - 20, 9) + paragraphHeight(regularFont, urlText, CONTENT_WIDTH - 20, 8);
    drawRect(page, PAGE_MARGIN, y, CONTENT_WIDTH, height, theme.surface, theme.line);
    const afterCopy = drawParagraph(page, regularFont, hostedCopy, PAGE_MARGIN + 10, y - 14, CONTENT_WIDTH - 20, 9, theme.ink);
    drawParagraph(page, regularFont, urlText, PAGE_MARGIN + 10, afterCopy - 8, CONTENT_WIDTH - 20, 8, theme.primary);
  }

  return pdfDoc.save();
}
