import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

import { resolveTenantBranding } from "./branding";
import { buildQuotePresentationLineItems, buildQuoteProjectSummary, groupQuotePresentationLineItems } from "./quote-presentation";
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
  softText: ReturnType<typeof rgb>;
  line: ReturnType<typeof rgb>;
  surface: ReturnType<typeof rgb>;
  softSurface: ReturnType<typeof rgb>;
  accentSurface: ReturnType<typeof rgb>;
  accentText: ReturnType<typeof rgb>;
  successSurface: ReturnType<typeof rgb>;
  successText: ReturnType<typeof rgb>;
  warningSurface: ReturnType<typeof rgb>;
  warningText: ReturnType<typeof rgb>;
};

type PageState = {
  page: PDFPage;
  y: number;
  pageNumber: number;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const HEADER_HEIGHT = 104;
const FOOTER_HEIGHT = 28;
const BODY_TOP = PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT - 18;
const MIN_CONTENT_Y = PAGE_MARGIN + FOOTER_HEIGHT + 12;

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
    muted: rgb(0.31, 0.36, 0.43),
    softText: rgb(0.5, 0.56, 0.63),
    line: rgb(0.86, 0.9, 0.94),
    surface: rgb(1, 1, 1),
    softSurface: rgb(0.972, 0.979, 0.987),
    accentSurface: rgb(0.994, 0.972, 0.91),
    accentText: rgb(0.56, 0.39, 0.04),
    successSurface: rgb(0.93, 0.975, 0.947),
    successText: rgb(0.11, 0.41, 0.24),
    warningSurface: rgb(0.993, 0.948, 0.944),
    warningText: rgb(0.6, 0.17, 0.16)
  };
}

function formatDate(value: Date | null | undefined) {
  return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value) : "-";
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function normalizeDisplay(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : "-";
}

function wrapText(font: PDFFont, text: string, maxWidth: number, size: number) {
  const safeText = text.trim() || "-";
  const paragraphs = safeText.split(/\n+/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("-");
      continue;
    }

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
  }

  return lines.length > 0 ? lines : ["-"];
}

function measureParagraphHeight(font: PDFFont, text: string, maxWidth: number, size: number, lineGap = 3) {
  return wrapText(font, text, maxWidth, size).length * (size + lineGap);
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
  lineGap = 3
) {
  const lines = wrapText(font, text, maxWidth, size);
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * (size + lineGap),
      size,
      font,
      color
    });
  });

  return y - lines.length * (size + lineGap);
}

function drawRect(
  page: PDFPage,
  x: number,
  yTop: number,
  width: number,
  height: number,
  color: ReturnType<typeof rgb>,
  borderColor?: ReturnType<typeof rgb>,
  borderWidth = 1
) {
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

function getStatusPresentation(theme: Theme, status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "approved") {
    return { label: "Approved", background: theme.successSurface, text: theme.successText };
  }
  if (normalized === "viewed" || normalized === "sent") {
    return { label: normalized === "viewed" ? "Viewed" : "Sent", background: theme.accentSurface, text: theme.accentText };
  }
  return {
    label: status.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase()),
    background: theme.softSurface,
    text: theme.primary
  };
}

function renderPageChrome(
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
  const rightX = PAGE_WIDTH - PAGE_MARGIN;

  drawRect(page, PAGE_MARGIN, top, CONTENT_WIDTH, 72, theme.surface, theme.line);
  drawRect(page, PAGE_MARGIN, top, CONTENT_WIDTH, 8, theme.primary, theme.primary, 0);

  if (logo) {
    const scaled = logo.scale(1);
    const ratio = Math.min(48 / scaled.width, 48 / scaled.height, 1);
    page.drawImage(logo, {
      x: PAGE_MARGIN + 14,
      y: top - 14 - scaled.height * ratio,
      width: scaled.width * ratio,
      height: scaled.height * ratio
    });
  }

  const companyX = logo ? PAGE_MARGIN + 76 : PAGE_MARGIN + 16;
  page.drawText(branding.legalBusinessName || input.tenant.name, {
    x: companyX,
    y: top - 22,
    size: 16,
    font: boldFont,
    color: theme.ink
  });

  const contactLine = [branding.phone, branding.email].filter(Boolean).join("  |  ");
  const websiteLine = branding.website || "";
  let contactY = top - 38;
  for (const line of [contactLine, websiteLine].filter(Boolean)) {
    page.drawText(line, {
      x: companyX,
      y: contactY,
      size: 8.5,
      font: regularFont,
      color: theme.softText
    });
    contactY -= 11;
  }

  page.drawText("Project Proposal", {
    x: rightX - boldFont.widthOfTextAtSize("Project Proposal", 17),
    y: top - 22,
    size: 17,
    font: boldFont,
    color: theme.ink
  });

  const metaRows: Array<[string, string]> = [
    ["Proposal", input.quote.quoteNumber],
    ["Issued", formatDate(input.quote.issuedAt)],
    ["Page", String(pageNumber)]
  ];
  let metaY = top - 39;
  for (const [label, value] of metaRows) {
    const labelWidth = regularFont.widthOfTextAtSize(label, 8);
    const valueWidth = boldFont.widthOfTextAtSize(value, 8.5);
    const x = rightX - Math.max(labelWidth, valueWidth);
    page.drawText(label, {
      x,
      y: metaY,
      size: 8,
      font: regularFont,
      color: theme.softText
    });
    page.drawText(value, {
      x: rightX - valueWidth,
      y: metaY - 11,
      size: 8.5,
      font: boldFont,
      color: theme.ink
    });
    metaY -= 23;
  }

  page.drawText(branding.legalBusinessName || input.tenant.name, {
    x: PAGE_MARGIN,
    y: PAGE_MARGIN - 2,
    size: 8,
    font: regularFont,
    color: theme.softText
  });
  const pageLabel = `Page ${pageNumber}`;
  page.drawText(pageLabel, {
    x: PAGE_WIDTH - PAGE_MARGIN - regularFont.widthOfTextAtSize(pageLabel, 8),
    y: PAGE_MARGIN - 2,
    size: 8,
    font: regularFont,
    color: theme.softText
  });
}

function addPage(
  pdfDoc: PDFDocument,
  input: QuotePdfInput,
  theme: Theme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  logo: PDFImage | null,
  pageNumber: number
) {
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  renderPageChrome(input, page, theme, boldFont, regularFont, logo, pageNumber);
  return { page, y: BODY_TOP, pageNumber };
}

function ensureSpace(
  state: PageState,
  pdfDoc: PDFDocument,
  input: QuotePdfInput,
  theme: Theme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  logo: PDFImage | null,
  neededHeight: number
) {
  if (state.y - neededHeight >= MIN_CONTENT_Y) {
    return state;
  }

  return addPage(pdfDoc, input, theme, boldFont, regularFont, logo, state.pageNumber + 1);
}

function drawSectionTitle(state: PageState, title: string, subtitle: string | undefined, theme: Theme, boldFont: PDFFont, regularFont: PDFFont) {
  state.page.drawText(title, {
    x: PAGE_MARGIN,
    y: state.y,
    size: 14,
    font: boldFont,
    color: theme.ink
  });

  let y = state.y - 16;
  if (subtitle) {
    y = drawParagraph(state.page, regularFont, subtitle, PAGE_MARGIN, y, CONTENT_WIDTH, 8.5, theme.softText, 3) - 6;
  } else {
    y -= 6;
  }

  state.page.drawLine({
    start: { x: PAGE_MARGIN, y },
    end: { x: PAGE_MARGIN + CONTENT_WIDTH, y },
    thickness: 1,
    color: theme.line
  });

  state.y = y - 14;
}

function renderHero(state: PageState, input: QuotePdfInput, theme: Theme, boldFont: PDFFont, regularFont: PDFFont) {
  const customerLine = input.site?.name && input.site.name !== "-"
    ? `${input.customerCompany.name} - ${input.site.name}`
    : input.customerCompany.name;
  const intro = buildQuoteProjectSummary(input.lineItems);
  const cardHeight = 120;

  drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, cardHeight, theme.softSurface, theme.line);
  state.page.drawText("Proposal Ready", {
    x: PAGE_MARGIN + 16,
    y: state.y - 18,
    size: 10,
    font: boldFont,
    color: theme.primary
  });
  state.page.drawText(customerLine, {
    x: PAGE_MARGIN + 16,
    y: state.y - 42,
    size: 24,
    font: boldFont,
    color: theme.ink
  });
  drawParagraph(state.page, regularFont, intro, PAGE_MARGIN + 16, state.y - 64, CONTENT_WIDTH - 210, 10, theme.muted, 3);

  const status = getStatusPresentation(theme, input.quote.status);
  const chipWidth = Math.max(76, boldFont.widthOfTextAtSize(status.label, 8) + 22);
  drawRect(state.page, PAGE_MARGIN + CONTENT_WIDTH - chipWidth - 16, state.y - 16, chipWidth, 20, status.background, status.background);
  state.page.drawText(status.label, {
    x: PAGE_MARGIN + CONTENT_WIDTH - chipWidth - 16 + (chipWidth - boldFont.widthOfTextAtSize(status.label, 8)) / 2,
    y: state.y - 28,
    size: 8,
    font: boldFont,
    color: status.text
  });

  state.page.drawText("Proposal total", {
    x: PAGE_MARGIN + CONTENT_WIDTH - 160,
    y: state.y - 52,
    size: 8,
    font: regularFont,
    color: theme.softText
  });
  state.page.drawText(money(input.quote.total), {
    x: PAGE_MARGIN + CONTENT_WIDTH - 160,
    y: state.y - 76,
    size: 22,
    font: boldFont,
    color: theme.ink
  });
  state.page.drawText(`Expires ${formatDate(input.quote.expiresAt)}`, {
    x: PAGE_MARGIN + CONTENT_WIDTH - 160,
    y: state.y - 94,
    size: 9,
    font: regularFont,
    color: theme.muted
  });

  state.y -= cardHeight + 20;
}

function renderOverview(state: PageState, input: QuotePdfInput, theme: Theme, boldFont: PDFFont, regularFont: PDFFont) {
  const summary = [
    { label: "Customer", value: input.customerCompany.name },
    { label: "Contact", value: input.customerCompany.contactName ?? input.quote.recipientEmail ?? input.customerCompany.billingEmail ?? "-" },
    { label: "Phone", value: input.customerCompany.phone ?? "-" },
    { label: "Site", value: input.site?.name ?? "-" },
    {
      label: "Site address",
      value: [
        input.site?.addressLine1,
        input.site?.addressLine2,
        [input.site?.city, input.site?.state, input.site?.postalCode].filter(Boolean).join(" ")
      ].filter(Boolean).join(", ") || "-"
    },
    { label: "Issue date", value: formatDate(input.quote.issuedAt) },
    { label: "Expiration", value: formatDate(input.quote.expiresAt) },
    { label: "Proposal ID", value: input.quote.quoteNumber }
  ];

  const gap = 12;
  const columns = 2;
  const columnWidth = (CONTENT_WIDTH - gap) / columns;
  const rowHeights: number[] = [];
  for (let index = 0; index < summary.length; index += columns) {
    const items = summary.slice(index, index + columns);
    rowHeights.push(
      items.reduce((maxHeight, item) => Math.max(maxHeight, 34 + measureParagraphHeight(regularFont, item.value, columnWidth - 20, 10, 3)), 54)
    );
  }
  const totalHeight = rowHeights.reduce((sum, height) => sum + height, 0) + gap * Math.max(rowHeights.length - 1, 0) + 16;

  drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, totalHeight, theme.surface, theme.line);
  let y = state.y - 10;
  let rowIndex = 0;
  for (let index = 0; index < summary.length; index += columns) {
    const items = summary.slice(index, index + columns);
    const rowHeight = rowHeights[rowIndex] ?? 54;
    items.forEach((item, columnIndex) => {
      const x = PAGE_MARGIN + 8 + columnIndex * (columnWidth + gap);
      drawRect(state.page, x, y, columnWidth, rowHeight, theme.softSurface, theme.line);
      state.page.drawText(item.label.toUpperCase(), {
        x: x + 10,
        y: y - 14,
        size: 7,
        font: boldFont,
        color: theme.softText
      });
      drawParagraph(state.page, regularFont, item.value, x + 10, y - 28, columnWidth - 20, 10, theme.ink, 3);
    });
    y -= rowHeight + gap;
    rowIndex += 1;
  }

  state.y -= totalHeight + 18;
}

function drawLineItemHeader(page: PDFPage, y: number, theme: Theme, boldFont: PDFFont) {
  drawRect(page, PAGE_MARGIN, y, CONTENT_WIDTH, 24, theme.softSurface, theme.line);
  const columns = [
    { label: "Service", x: PAGE_MARGIN + 12 },
    { label: "Qty", x: PAGE_MARGIN + 326 },
    { label: "Unit Price", x: PAGE_MARGIN + 388 },
    { label: "Total", x: PAGE_MARGIN + 485 }
  ];

  for (const column of columns) {
    page.drawText(column.label, {
      x: column.x,
      y: y - 15,
      size: 7.5,
      font: boldFont,
      color: theme.muted
    });
  }
}

function renderLineItems(
  state: PageState,
  pdfDoc: PDFDocument,
  input: QuotePdfInput,
  theme: Theme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  logo: PDFImage | null
) {
  const groupedLineItems = groupQuotePresentationLineItems(buildQuotePresentationLineItems(input.lineItems));
  state = ensureSpace(state, pdfDoc, input, theme, boldFont, regularFont, logo, 120);
  drawSectionTitle(state, "Scope and Pricing", "Clear, customer-ready pricing for the work included in this proposal.", theme, boldFont, regularFont);
  for (const group of groupedLineItems) {
    state = ensureSpace(state, pdfDoc, input, theme, boldFont, regularFont, logo, 70);
    drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, 24, theme.softSurface, theme.line);
    state.page.drawText(group.title, {
      x: PAGE_MARGIN + 12,
      y: state.y - 15,
      size: 8,
      font: boldFont,
      color: theme.primary
    });
    state.y -= 24;
    drawLineItemHeader(state.page, state.y, theme, boldFont);
    state.y -= 24;

    for (const [index, line] of group.items.entries()) {
      const description = line.description ?? "-";
      const descriptionHeight = line.description ? measureParagraphHeight(regularFont, description, 290, 8.5, 2) : 0;
      const rowHeight = Math.max(40, 24 + descriptionHeight);
      state = ensureSpace(state, pdfDoc, input, theme, boldFont, regularFont, logo, rowHeight + 12);
      if (state.y === BODY_TOP) {
        drawSectionTitle(state, "Scope and Pricing", "Continued proposal line items.", theme, boldFont, regularFont);
        drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, 24, theme.softSurface, theme.line);
        state.page.drawText(group.title, {
          x: PAGE_MARGIN + 12,
          y: state.y - 15,
          size: 8,
          font: boldFont,
          color: theme.primary
        });
        state.y -= 24;
        drawLineItemHeader(state.page, state.y, theme, boldFont);
        state.y -= 24;
      }

      drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, rowHeight, index % 2 === 0 ? theme.surface : theme.softSurface, theme.line);
      state.page.drawText(line.title, {
        x: PAGE_MARGIN + 12,
        y: state.y - 16,
        size: 9.5,
        font: boldFont,
        color: theme.ink
      });
      if (line.description) {
        drawParagraph(state.page, regularFont, description, PAGE_MARGIN + 12, state.y - 29, 290, 8.5, theme.muted, 2);
      }

      const qtyText = String(line.quantity ?? 1);
      const unitText = money(line.unitPrice ?? 0);
      const totalText = money(line.total ?? 0);
      state.page.drawText(qtyText, {
        x: PAGE_MARGIN + 350 - regularFont.widthOfTextAtSize(qtyText, 9),
        y: state.y - 16,
        size: 9,
        font: regularFont,
        color: theme.ink
      });
      state.page.drawText(unitText, {
        x: PAGE_MARGIN + 450 - regularFont.widthOfTextAtSize(unitText, 9),
        y: state.y - 16,
        size: 9,
        font: regularFont,
        color: theme.ink
      });
      state.page.drawText(totalText, {
        x: PAGE_MARGIN + CONTENT_WIDTH - 12 - boldFont.widthOfTextAtSize(totalText, 9.5),
        y: state.y - 16,
        size: 9.5,
        font: boldFont,
        color: theme.ink
      });

      state.y -= rowHeight;
    }

    state.y -= 12;
  }

  state.y -= 18;
}

function renderTotals(state: PageState, input: QuotePdfInput, theme: Theme, boldFont: PDFFont, regularFont: PDFFont) {
  const width = 240;
  const x = PAGE_WIDTH - PAGE_MARGIN - width;
  drawRect(state.page, x, state.y, width, 108, theme.surface, theme.line);
  drawRect(state.page, x, state.y, width, 6, theme.primary, theme.primary, 0);

  const rows: Array<[string, string, boolean]> = [
    ["Subtotal", money(input.quote.subtotal), false],
    ["Tax", money(input.quote.taxAmount), false],
    ["Proposal Total", money(input.quote.total), true]
  ];
  let y = state.y - 22;
  for (const [label, value, isTotal] of rows) {
    const font = isTotal ? boldFont : regularFont;
    const size = isTotal ? 11.5 : 9.5;
    if (isTotal) {
      state.page.drawLine({
        start: { x: x + 14, y: y + 9 },
        end: { x: x + width - 14, y: y + 9 },
        thickness: 1,
        color: theme.line
      });
    }
    state.page.drawText(label, {
      x: x + 14,
      y,
      size,
      font,
      color: isTotal ? theme.ink : theme.muted
    });
    state.page.drawText(value, {
      x: x + width - 14 - font.widthOfTextAtSize(value, size),
      y,
      size,
      font,
      color: theme.ink
    });
    y -= isTotal ? 28 : 22;
  }

  state.y -= 124;
}

function renderTerms(
  state: PageState,
  pdfDoc: PDFDocument,
  input: QuotePdfInput,
  theme: Theme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  logo: PDFImage | null
) {
  const terms = getQuoteTermsContent();
  state = ensureSpace(state, pdfDoc, input, theme, boldFont, regularFont, logo, 160);
  drawSectionTitle(state, terms.title, "Clear project terms, scope boundaries, and approval expectations for this proposal.", theme, boldFont, regularFont);

  if (terms.intro) {
    const introHeight = 24 + measureParagraphHeight(regularFont, terms.intro, CONTENT_WIDTH - 20, 9.5, 3);
    state = ensureSpace(state, pdfDoc, input, theme, boldFont, regularFont, logo, introHeight + 12);
    drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, introHeight, theme.surface, theme.line);
    drawParagraph(state.page, regularFont, terms.intro, PAGE_MARGIN + 10, state.y - 15, CONTENT_WIDTH - 20, 9.5, theme.ink, 3);
    state.y -= introHeight + 12;
  }

  const emphasisHeight = 34 + measureParagraphHeight(regularFont, terms.emphasisBody, CONTENT_WIDTH - 20, 9.5, 3);
  state = ensureSpace(state, pdfDoc, input, theme, boldFont, regularFont, logo, emphasisHeight + 14);
  drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, emphasisHeight, theme.accentSurface, theme.line);
  state.page.drawText(terms.emphasisTitle.toUpperCase(), {
    x: PAGE_MARGIN + 12,
    y: state.y - 15,
    size: 7.5,
    font: boldFont,
    color: theme.accentText
  });
  drawParagraph(state.page, regularFont, terms.emphasisBody, PAGE_MARGIN + 12, state.y - 31, CONTENT_WIDTH - 24, 9.5, theme.ink, 3);
  state.y -= emphasisHeight + 14;

  for (const section of terms.sections) {
    const bodyHeight = (section.body ?? []).reduce((sum, paragraph) => sum + measureParagraphHeight(regularFont, paragraph, CONTENT_WIDTH - 24, 9, 3) + 8, 0);
    const bulletHeight = (section.bullets ?? []).reduce((sum, bullet) => sum + measureParagraphHeight(regularFont, bullet, CONTENT_WIDTH - 44, 9, 3) + 6, 0);
    const sectionHeight = Math.max(58, 28 + bodyHeight + bulletHeight);
    state = ensureSpace(state, pdfDoc, input, theme, boldFont, regularFont, logo, sectionHeight + 12);
    drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, sectionHeight, theme.surface, theme.line);
    state.page.drawText(section.title.toUpperCase(), {
      x: PAGE_MARGIN + 12,
      y: state.y - 15,
      size: 7.5,
      font: boldFont,
      color: theme.muted
    });

    let y = state.y - 31;
    for (const paragraph of section.body ?? []) {
      y = drawParagraph(state.page, regularFont, paragraph, PAGE_MARGIN + 12, y, CONTENT_WIDTH - 24, 9, theme.ink, 3) - 5;
    }

    for (const bullet of section.bullets ?? []) {
      state.page.drawCircle({
        x: PAGE_MARGIN + 15,
        y: y + 4,
        size: 1.8,
        color: theme.softText
      });
      y = drawParagraph(state.page, regularFont, bullet, PAGE_MARGIN + 24, y + 8, CONTENT_WIDTH - 44, 9, theme.ink, 3) - 2;
    }

    state.y -= sectionHeight + 12;
  }

  if (input.quote.customerNotes?.trim()) {
    const noteText = input.quote.customerNotes.trim();
    const noteHeight = 28 + measureParagraphHeight(regularFont, noteText, CONTENT_WIDTH - 24, 9, 3);
    state = ensureSpace(state, pdfDoc, input, theme, boldFont, regularFont, logo, noteHeight + 12);
    drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, noteHeight, theme.softSurface, theme.line);
    state.page.drawText("ADDITIONAL QUOTE NOTES", {
      x: PAGE_MARGIN + 12,
      y: state.y - 15,
      size: 7.5,
      font: boldFont,
      color: theme.muted
    });
    drawParagraph(state.page, regularFont, noteText, PAGE_MARGIN + 12, state.y - 31, CONTENT_WIDTH - 24, 9, theme.ink, 3);
    state.y -= noteHeight + 12;
  }
}

function renderHostedLink(state: PageState, input: QuotePdfInput, theme: Theme, boldFont: PDFFont, regularFont: PDFFont) {
  if (!input.quote.hostedQuoteUrl) {
    return;
  }

  const copy = "Use the secure proposal link below to review the latest scope, confirm pricing, download the PDF, and approve online.";
  const urlHeight = measureParagraphHeight(regularFont, input.quote.hostedQuoteUrl, CONTENT_WIDTH - 24, 8, 2);
  const height = 44 + measureParagraphHeight(regularFont, copy, CONTENT_WIDTH - 24, 9, 3) + urlHeight;

  drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, height, theme.softSurface, theme.line);
  state.page.drawText("REVIEW PROPOSAL ONLINE", {
    x: PAGE_MARGIN + 12,
    y: state.y - 15,
    size: 7.5,
    font: boldFont,
    color: theme.primary
  });
  const afterCopy = drawParagraph(state.page, regularFont, copy, PAGE_MARGIN + 12, state.y - 31, CONTENT_WIDTH - 24, 9, theme.ink, 3);
  drawParagraph(state.page, regularFont, input.quote.hostedQuoteUrl, PAGE_MARGIN + 12, afterCopy - 8, CONTENT_WIDTH - 24, 8, theme.primary, 2);
  state.y -= height + 10;
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

  let state = addPage(pdfDoc, input, theme, boldFont, regularFont, logo, 1);
  renderHero(state, input, theme, boldFont, regularFont);
  drawSectionTitle(state, "Proposal Summary", "Customer, contact, and location details for this project proposal.", theme, boldFont, regularFont);
  renderOverview(state, input, theme, boldFont, regularFont);
  renderLineItems(state, pdfDoc, input, theme, boldFont, regularFont, logo);
  renderTotals(state, input, theme, boldFont, regularFont);
  state = ensureSpace(state, pdfDoc, input, theme, boldFont, regularFont, logo, 120);
  renderTerms(state, pdfDoc, input, theme, boldFont, regularFont, logo);
  state = ensureSpace(state, pdfDoc, input, theme, boldFont, regularFont, logo, 90);
  renderHostedLink(state, input, theme, boldFont, regularFont);

  return pdfDoc.save();
}
