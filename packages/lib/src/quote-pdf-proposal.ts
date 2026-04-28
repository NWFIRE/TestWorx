import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

import { resolveTenantBranding } from "./branding";
import {
  buildQuotePresentationLineItems,
  buildQuoteProjectSummary,
  groupQuotePresentationLineItems
} from "./quote-presentation";
import { getQuoteTermsContent } from "./quote-terms";
import { getCustomerFacingSiteLabel } from "./scheduling";
import { decodeStoredFile } from "./storage";

export type QuotePdfInput = {
  tenant: {
    name: string;
    branding: unknown;
    billingEmail: string | null;
  };
  quote: {
    quoteNumber: string;
    recipientEmail: string | null;
    proposalType?: string | null;
    includeDepositRequirement?: boolean;
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
  heading: ReturnType<typeof rgb>;
  muted: ReturnType<typeof rgb>;
  softText: ReturnType<typeof rgb>;
  line: ReturnType<typeof rgb>;
  paper: ReturnType<typeof rgb>;
  panel: ReturnType<typeof rgb>;
  panelStrong: ReturnType<typeof rgb>;
  softPanel: ReturnType<typeof rgb>;
  accentPanel: ReturnType<typeof rgb>;
  accentText: ReturnType<typeof rgb>;
  successPanel: ReturnType<typeof rgb>;
  successText: ReturnType<typeof rgb>;
  warningPanel: ReturnType<typeof rgb>;
  warningText: ReturnType<typeof rgb>;
};

type QuoteBranding = ReturnType<typeof resolveTenantBranding>;

type PageState = {
  page: PDFPage;
  cursorY: number;
  pageNumber: number;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 38;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const HEADER_HEIGHT = 106;
const FOOTER_HEIGHT = 32;
const BODY_TOP = PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT - 18;
const BODY_BOTTOM = PAGE_MARGIN + FOOTER_HEIGHT + 12;
const SECTION_GAP = 24;
const BLOCK_GAP = 16;
const CARD_PADDING = 16;
const BODY_LINE_GAP = 4;

function hexToRgb(hex: string, fallback: { r: number; g: number; b: number }) {
  const normalized = hex.replace("#", "").trim();
  if (![3, 6].includes(normalized.length)) {
    return rgb(fallback.r, fallback.g, fallback.b);
  }

  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : normalized;
  const parsed = Number.parseInt(expanded, 16);
  if (Number.isNaN(parsed)) {
    return rgb(fallback.r, fallback.g, fallback.b);
  }

  return rgb(((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255);
}

function buildTheme(primaryHex?: string | null, accentHex?: string | null): Theme {
  return {
    primary: hexToRgb(primaryHex ?? "#214873", { r: 0.13, g: 0.28, b: 0.45 }),
    accent: hexToRgb(accentHex ?? "#E46A20", { r: 0.89, g: 0.42, b: 0.12 }),
    ink: rgb(0.11, 0.14, 0.19),
    heading: rgb(0.08, 0.12, 0.18),
    muted: rgb(0.36, 0.41, 0.49),
    softText: rgb(0.54, 0.59, 0.66),
    line: rgb(0.88, 0.91, 0.95),
    paper: rgb(1, 1, 1),
    panel: rgb(0.985, 0.989, 0.994),
    panelStrong: rgb(0.95, 0.962, 0.978),
    softPanel: rgb(0.973, 0.978, 0.985),
    accentPanel: rgb(0.995, 0.974, 0.93),
    accentText: rgb(0.58, 0.33, 0.03),
    successPanel: rgb(0.93, 0.975, 0.947),
    successText: rgb(0.12, 0.4, 0.24),
    warningPanel: rgb(0.992, 0.949, 0.939),
    warningText: rgb(0.61, 0.16, 0.14)
  };
}

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function normalizeText(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : "";
}

function wrapText(font: PDFFont, text: string, maxWidth: number, size: number) {
  const safeText = normalizeText(text);
  if (!safeText) {
    return [];
  }

  const paragraphs = safeText.split(/\n+/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      continue;
    }

    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }

    if (current) {
      lines.push(current);
    }
  }

  return lines;
}

function measureTextHeight(font: PDFFont, text: string, maxWidth: number, size: number, lineGap = BODY_LINE_GAP) {
  const lines = wrapText(font, text, maxWidth, size);
  if (lines.length === 0) {
    return 0;
  }

  return lines.length * size + Math.max(0, lines.length - 1) * lineGap;
}

function drawTextBlock(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  color: ReturnType<typeof rgb>,
  lineGap = BODY_LINE_GAP
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

  if (lines.length === 0) {
    return y;
  }

  return y - (lines.length * size + Math.max(0, lines.length - 1) * lineGap);
}

function drawPanel(
  page: PDFPage,
  x: number,
  yTop: number,
  width: number,
  height: number,
  fill: ReturnType<typeof rgb>,
  border: ReturnType<typeof rgb>,
  borderWidth = 1
) {
  page.drawRectangle({
    x,
    y: yTop - height,
    width,
    height,
    color: fill,
    borderColor: border,
    borderWidth
  });
}

function drawDivider(page: PDFPage, x: number, y: number, width: number, color: ReturnType<typeof rgb>) {
  page.drawLine({
    start: { x, y },
    end: { x: x + width, y },
    thickness: 1,
    color
  });
}

function getStatusPresentation(theme: Theme, status: string) {
  const normalized = normalizeText(status).toLowerCase();
  if (normalized === "approved") {
    return { label: "Approved", fill: theme.successPanel, text: theme.successText };
  }
  if (normalized === "sent") {
    return { label: "Sent", fill: theme.accentPanel, text: theme.accentText };
  }
  if (normalized === "expired" || normalized === "declined" || normalized === "cancelled") {
    return {
      label: status.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase()),
      fill: theme.warningPanel,
      text: theme.warningText
    };
  }

  return {
    label: status.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase()),
    fill: theme.panelStrong,
    text: theme.primary
  };
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

function renderPageHeader(
  page: PDFPage,
  theme: Theme,
  branding: QuoteBranding,
  quote: QuotePdfInput["quote"],
  boldFont: PDFFont,
  regularFont: PDFFont,
  logo: PDFImage | null
) {
  const top = PAGE_HEIGHT - PAGE_MARGIN;
  drawPanel(page, PAGE_MARGIN, top, CONTENT_WIDTH, HEADER_HEIGHT, theme.paper, theme.line);
  page.drawRectangle({
    x: PAGE_MARGIN,
    y: top - 10,
    width: CONTENT_WIDTH,
    height: 10,
    color: theme.primary
  });

  if (logo) {
    const scaled = logo.scale(1);
    const ratio = Math.min(38 / scaled.height, 70 / scaled.width, 1);
    page.drawImage(logo, {
      x: PAGE_MARGIN + 16,
      y: top - 26 - scaled.height * ratio,
      width: scaled.width * ratio,
      height: scaled.height * ratio
    });
  }

  const brandX = logo ? PAGE_MARGIN + 96 : PAGE_MARGIN + 18;
  page.drawText(branding.legalBusinessName || "TradeWorx", {
    x: brandX,
    y: top - 30,
    size: 18,
    font: boldFont,
    color: theme.heading
  });

  const contactLines = [
    [branding.phone, branding.email].filter(Boolean).join("  |  "),
    branding.website || ""
  ].filter(Boolean);

  let contactY = top - 50;
  for (const line of contactLines) {
    page.drawText(line, {
      x: brandX,
      y: contactY,
      size: 9,
      font: regularFont,
      color: theme.muted
    });
    contactY -= 12;
  }

  const metaWidth = 172;
  const metaHeight = 74;
  const metaX = PAGE_WIDTH - PAGE_MARGIN - metaWidth - 16;
  const metaTop = top - 18;
  drawPanel(page, metaX, metaTop, metaWidth, metaHeight, theme.softPanel, theme.line);

  page.drawText("Proposal", {
    x: metaX + 14,
    y: metaTop - 18,
    size: 12,
    font: regularFont,
    color: theme.muted
  });
  page.drawText(quote.quoteNumber, {
    x: metaX + 14,
    y: metaTop - 38,
    size: 14,
    font: boldFont,
    color: theme.heading
  });

  const issuedValue = formatDate(quote.issuedAt) || "—";
  const expiresValue = formatDate(quote.expiresAt) || "—";
  const leftMetaX = metaX + 14;
  const rightMetaX = metaX + 94;
  page.drawText("Issued", {
    x: leftMetaX,
    y: metaTop - 56,
    size: 7.5,
    font: boldFont,
    color: theme.softText
  });
  page.drawText(issuedValue, {
    x: leftMetaX,
    y: metaTop - 67,
    size: 8.5,
    font: regularFont,
    color: theme.ink
  });
  page.drawText("Expires", {
    x: rightMetaX,
    y: metaTop - 56,
    size: 7.5,
    font: boldFont,
    color: theme.softText
  });
  page.drawText(expiresValue, {
    x: rightMetaX,
    y: metaTop - 67,
    size: 8.5,
    font: regularFont,
    color: theme.ink
  });
}

function renderPageFooter(page: PDFPage, theme: Theme, regularFont: PDFFont, pageNumber: number, totalPages: number) {
  drawDivider(page, PAGE_MARGIN, PAGE_MARGIN + 10, CONTENT_WIDTH, theme.line);
  const label = `Page ${pageNumber} of ${totalPages}`;
  page.drawText(label, {
    x: PAGE_WIDTH - PAGE_MARGIN - regularFont.widthOfTextAtSize(label, 8),
    y: PAGE_MARGIN - 1,
    size: 8,
    font: regularFont,
    color: theme.softText
  });
}

function addPage(
  pdfDoc: PDFDocument,
  pageNumber: number,
  theme: Theme,
  branding: QuoteBranding,
  quote: QuotePdfInput["quote"],
  boldFont: PDFFont,
  regularFont: PDFFont,
  logo: PDFImage | null
) {
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  renderPageHeader(page, theme, branding, quote, boldFont, regularFont, logo);
  return { page, cursorY: BODY_TOP, pageNumber };
}

function ensureSpace(
  state: PageState,
  neededHeight: number,
  pdfDoc: PDFDocument,
  theme: Theme,
  branding: QuoteBranding,
  quote: QuotePdfInput["quote"],
  boldFont: PDFFont,
  regularFont: PDFFont,
  logo: PDFImage | null
) {
  if (state.cursorY - neededHeight >= BODY_BOTTOM) {
    return state;
  }

  return addPage(pdfDoc, state.pageNumber + 1, theme, branding, quote, boldFont, regularFont, logo);
}

function buildSummaryFields(input: QuotePdfInput) {
  const siteAddress = normalizeText(
    [
      input.site?.addressLine1,
      input.site?.addressLine2,
      [input.site?.city, input.site?.state, input.site?.postalCode].filter(Boolean).join(" ")
    ]
      .filter(Boolean)
      .join(", ")
  );

  return [
    { label: "Customer", value: normalizeText(input.customerCompany.name) },
    { label: "Project / Site", value: normalizeText(getCustomerFacingSiteLabel(input.site?.name)) },
    { label: "Contact", value: normalizeText(input.customerCompany.contactName || input.quote.recipientEmail || input.customerCompany.billingEmail) },
    { label: "Phone", value: normalizeText(input.customerCompany.phone) },
    { label: "Site Address", value: siteAddress },
    { label: "Proposal ID", value: normalizeText(input.quote.quoteNumber) }
  ].filter((field) => field.value);
}

function renderProposalHero(
  state: PageState,
  input: QuotePdfInput,
  theme: Theme,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  const status = getStatusPresentation(theme, input.quote.status);
  const summaryLine = buildQuoteProjectSummary(input.lineItems, input.quote.proposalType);
  const customerFacingSiteName = getCustomerFacingSiteLabel(input.site?.name);
  const customerDisplayLine = customerFacingSiteName
    ? `${input.customerCompany.name} - ${customerFacingSiteName}`
    : input.customerCompany.name;
  void customerDisplayLine;
  const customerLine = customerDisplayLine;
  /*
    ? `${input.customerCompany.name} · ${input.site.name}`
    : input.customerCompany.name;

  */
  void customerLine;
  const leftWidth = 334;
  const rightWidth = CONTENT_WIDTH - leftWidth - 16;
  const leftBodyHeight =
    24 +
    11 +
    18 +
    15 +
    18 +
    measureTextHeight(
      regularFont,
      "This proposal includes the scoped work, customer-facing pricing, and project terms needed for review and approval.",
      leftWidth - CARD_PADDING * 2,
      9.5
    );
  const rightBodyHeight =
    22 +
    8 +
    34 +
    22 +
    9.5 +
    18 +
    measureTextHeight(
      regularFont,
      "Review the proposal details below. Once approved, work can move into scheduling and delivery.",
      rightWidth - CARD_PADDING * 2,
      8.5,
      3
    );
  const heroHeight = Math.max(176, CARD_PADDING * 2 + leftBodyHeight, CARD_PADDING * 2 + rightBodyHeight);

  drawPanel(state.page, PAGE_MARGIN, state.cursorY, leftWidth, heroHeight, theme.panel, theme.line);
  drawPanel(state.page, PAGE_MARGIN + leftWidth + 16, state.cursorY, rightWidth, heroHeight, theme.primary, theme.primary);

  state.page.drawText("Project Proposal", {
    x: PAGE_MARGIN + CARD_PADDING,
    y: state.cursorY - 24,
    size: 21,
    font: boldFont,
    color: theme.heading
  });

  state.page.drawText(customerDisplayLine, {
    x: PAGE_MARGIN + CARD_PADDING,
    y: state.cursorY - 46,
    size: 11,
    font: regularFont,
    color: theme.muted
  });

  state.page.drawText(summaryLine, {
    x: PAGE_MARGIN + CARD_PADDING,
    y: state.cursorY - 76,
    size: 15,
    font: boldFont,
    color: theme.ink
  });

  drawTextBlock(
    state.page,
    regularFont,
    "This proposal includes the scoped work, customer-facing pricing, and project terms needed for review and approval.",
    PAGE_MARGIN + CARD_PADDING,
    state.cursorY - 98,
    leftWidth - CARD_PADDING * 2,
    9.5,
    theme.muted
  );

  const badgeWidth = Math.max(74, boldFont.widthOfTextAtSize(status.label, 8) + 24);
  drawPanel(
    state.page,
    PAGE_MARGIN + leftWidth + 16 + CARD_PADDING,
    state.cursorY - 16,
    badgeWidth,
    22,
    status.fill,
    status.fill,
    0
  );
  state.page.drawText(status.label, {
    x:
      PAGE_MARGIN + leftWidth + 16 + CARD_PADDING + (badgeWidth - boldFont.widthOfTextAtSize(status.label, 8)) / 2,
    y: state.cursorY - 30,
    size: 8,
    font: boldFont,
    color: status.text
  });

  state.page.drawText("Total", {
    x: PAGE_MARGIN + leftWidth + 16 + CARD_PADDING,
    y: state.cursorY - 58,
    size: 8,
    font: boldFont,
    color: rgb(0.83, 0.89, 0.95)
  });
  state.page.drawText(formatMoney(input.quote.total), {
    x: PAGE_MARGIN + leftWidth + 16 + CARD_PADDING,
    y: state.cursorY - 92,
    size: 26,
    font: boldFont,
    color: rgb(1, 1, 1)
  });
  state.page.drawText(`Expires ${formatDate(input.quote.expiresAt) || "On receipt"}`, {
    x: PAGE_MARGIN + leftWidth + 16 + CARD_PADDING,
    y: state.cursorY - 114,
    size: 9.5,
    font: regularFont,
    color: rgb(0.9, 0.94, 0.98)
  });
  drawTextBlock(
    state.page,
    regularFont,
    "Review the proposal details below. Once approved, work can move into scheduling and delivery.",
    PAGE_MARGIN + leftWidth + 16 + CARD_PADDING,
    state.cursorY - 136,
    rightWidth - CARD_PADDING * 2,
    8.5,
    rgb(0.9, 0.94, 0.98),
    3
  );

  state.cursorY -= heroHeight + SECTION_GAP;
}

function renderSummaryAndTotals(
  state: PageState,
  input: QuotePdfInput,
  theme: Theme,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  const fields = buildSummaryFields(input);
  const summaryWidth = 330;
  const totalWidth = CONTENT_WIDTH - summaryWidth - 16;

  const summaryRows = fields.map((field) => ({
    ...field,
    height: 28 + measureTextHeight(regularFont, field.value, summaryWidth - CARD_PADDING * 2, 9.5, 4)
  }));
  const summaryHeight =
    22 + summaryRows.reduce((sum, row) => sum + row.height, 0) + Math.max(0, summaryRows.length - 1) * 10;
  const pricingSummaryTextHeight = 0;
  const totalsRowsHeight = 22 + 22;
  const proposalTotalBoxHeight = 72;
  const totalCardHeight =
    20 +
    18 +
    pricingSummaryTextHeight +
    22 +
    totalsRowsHeight +
    18 +
    proposalTotalBoxHeight +
    20;
  const blockHeight = Math.max(summaryHeight, totalCardHeight);

  drawPanel(state.page, PAGE_MARGIN, state.cursorY, summaryWidth, blockHeight, theme.paper, theme.line);
  drawPanel(
    state.page,
    PAGE_MARGIN + summaryWidth + 16,
    state.cursorY,
    totalWidth,
    blockHeight,
    theme.panel,
    theme.line
  );

  state.page.drawText("Proposal Summary", {
    x: PAGE_MARGIN + CARD_PADDING,
    y: state.cursorY - 20,
    size: 13.5,
    font: boldFont,
    color: theme.heading
  });

  let summaryY = state.cursorY - 44;
  summaryRows.forEach((row, index) => {
    state.page.drawText(row.label.toUpperCase(), {
      x: PAGE_MARGIN + CARD_PADDING,
      y: summaryY,
      size: 7.25,
      font: boldFont,
      color: theme.softText
    });
    drawTextBlock(
      state.page,
      regularFont,
      row.value,
      PAGE_MARGIN + CARD_PADDING,
      summaryY - 14,
      summaryWidth - CARD_PADDING * 2,
      9.5,
      theme.ink
    );

    summaryY -= row.height + (index === summaryRows.length - 1 ? 0 : 10);
  });

  state.page.drawText("Pricing Summary", {
    x: PAGE_MARGIN + summaryWidth + 16 + CARD_PADDING,
    y: state.cursorY - 20,
    size: 13.5,
    font: boldFont,
    color: theme.heading
  });

  const totalsX = PAGE_MARGIN + summaryWidth + 16 + CARD_PADDING;
  const totalsWidth = totalWidth - CARD_PADDING * 2;
  let rowY = state.cursorY - 58;
  for (const [label, value] of [
    ["Subtotal", formatMoney(input.quote.subtotal)],
    ["Tax", formatMoney(input.quote.taxAmount)]
  ] as const) {
    state.page.drawText(label, {
      x: totalsX,
      y: rowY,
      size: 10,
      font: regularFont,
      color: theme.muted
    });
    state.page.drawText(value, {
      x: totalsX + totalsWidth - regularFont.widthOfTextAtSize(value, 10),
      y: rowY,
      size: 10,
      font: regularFont,
      color: theme.ink
    });
    rowY -= 22;
  }

  drawDivider(state.page, totalsX, rowY - 2, totalsWidth, theme.line);
  const proposalTotalTop = rowY - 20;
  drawPanel(state.page, totalsX, proposalTotalTop, totalsWidth, proposalTotalBoxHeight, theme.paper, theme.line);
  state.page.drawText("Proposal Total", {
    x: totalsX + 14,
    y: proposalTotalTop - 22,
    size: 10.5,
    font: boldFont,
    color: theme.heading
  });
  const totalValue = formatMoney(input.quote.total);
  state.page.drawText(totalValue, {
    x: totalsX + totalsWidth - 14 - boldFont.widthOfTextAtSize(totalValue, 15),
    y: proposalTotalTop - 46,
    size: 15,
    font: boldFont,
    color: theme.heading
  });

  state.cursorY -= blockHeight + SECTION_GAP;
}

function drawSectionHeader(
  state: PageState,
  title: string,
  subtitle: string | null,
  theme: Theme,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  state.page.drawText(title, {
    x: PAGE_MARGIN,
    y: state.cursorY,
    size: 15.5,
    font: boldFont,
    color: theme.heading
  });
  let nextY = state.cursorY - 20;
  if (subtitle) {
    nextY =
      drawTextBlock(
        state.page,
        regularFont,
        subtitle,
        PAGE_MARGIN,
        nextY,
        CONTENT_WIDTH,
        8.8,
        theme.muted
      ) - 8;
  }
  drawDivider(state.page, PAGE_MARGIN, nextY, CONTENT_WIDTH, theme.line);
  state.cursorY = nextY - 16;
}

function renderPricingTable(
  state: PageState,
  input: QuotePdfInput,
  theme: Theme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  pdfDoc: PDFDocument,
  branding: QuoteBranding,
  logo: PDFImage | null
) {
  const groups = groupQuotePresentationLineItems(buildQuotePresentationLineItems(input.lineItems));
  drawSectionHeader(
    state,
    "Scope & Pricing",
    null,
    theme,
    boldFont,
    regularFont
  );

  for (const group of groups) {
    state = ensureSpace(state, 106, pdfDoc, theme, branding, input.quote, boldFont, regularFont, logo);

    drawPanel(state.page, PAGE_MARGIN, state.cursorY, CONTENT_WIDTH, 26, theme.panelStrong, theme.line);
    state.page.drawText(group.title, {
      x: PAGE_MARGIN + 12,
      y: state.cursorY - 17,
      size: 9,
      font: boldFont,
      color: theme.primary
    });
    state.cursorY -= 34;

    drawPanel(state.page, PAGE_MARGIN, state.cursorY, CONTENT_WIDTH, 24, theme.softPanel, theme.line);
    const columns = [
      { label: "Included Work", x: PAGE_MARGIN + 12 },
      { label: "Qty", x: PAGE_MARGIN + 348 },
      { label: "Unit Price", x: PAGE_MARGIN + 404 },
      { label: "Line Total", x: PAGE_MARGIN + 492 }
    ] as const;
    columns.forEach((column) => {
      state.page.drawText(column.label, {
        x: column.x,
        y: state.cursorY - 15,
        size: 7.5,
        font: boldFont,
        color: theme.muted
      });
    });
    state.cursorY -= 24;

    group.items.forEach((item, index) => {
      const descriptionHeight = item.description
        ? measureTextHeight(regularFont, item.description, 310, 8.5, 3)
        : 0;
      const rowHeight = Math.max(38, 18 + descriptionHeight + 14);

      state = ensureSpace(state, rowHeight + 18, pdfDoc, theme, branding, input.quote, boldFont, regularFont, logo);
      if (state.cursorY === BODY_TOP) {
        drawSectionHeader(state, "Scope & Pricing", "Continued proposal line items.", theme, boldFont, regularFont);
        drawPanel(state.page, PAGE_MARGIN, state.cursorY, CONTENT_WIDTH, 26, theme.panelStrong, theme.line);
        state.page.drawText(group.title, {
          x: PAGE_MARGIN + 12,
          y: state.cursorY - 17,
          size: 9,
          font: boldFont,
          color: theme.primary
        });
        state.cursorY -= 34;
        drawPanel(state.page, PAGE_MARGIN, state.cursorY, CONTENT_WIDTH, 24, theme.softPanel, theme.line);
        columns.forEach((column) => {
          state.page.drawText(column.label, {
            x: column.x,
            y: state.cursorY - 15,
            size: 7.5,
            font: boldFont,
            color: theme.muted
          });
        });
        state.cursorY -= 24;
      }

      drawPanel(
        state.page,
        PAGE_MARGIN,
        state.cursorY,
        CONTENT_WIDTH,
        rowHeight,
        index % 2 === 0 ? theme.paper : theme.panel,
        theme.line
      );
      state.page.drawText(item.title, {
        x: PAGE_MARGIN + 12,
        y: state.cursorY - 16,
        size: 9.7,
        font: boldFont,
        color: theme.ink
      });

      if (item.description) {
        drawTextBlock(
          state.page,
          regularFont,
          item.description,
          PAGE_MARGIN + 12,
          state.cursorY - 31,
          310,
          8.5,
          theme.muted,
          3
        );
      }

      const qty = String(item.quantity ?? 1);
      const unitPrice = formatMoney(item.unitPrice ?? 0);
      const total = formatMoney(item.total ?? 0);
      state.page.drawText(qty, {
        x: PAGE_MARGIN + 364 - regularFont.widthOfTextAtSize(qty, 9),
        y: state.cursorY - 16,
        size: 9,
        font: regularFont,
        color: theme.ink
      });
      state.page.drawText(unitPrice, {
        x: PAGE_MARGIN + 460 - regularFont.widthOfTextAtSize(unitPrice, 9),
        y: state.cursorY - 16,
        size: 9,
        font: regularFont,
        color: theme.ink
      });
      state.page.drawText(total, {
        x: PAGE_MARGIN + CONTENT_WIDTH - 12 - boldFont.widthOfTextAtSize(total, 9.5),
        y: state.cursorY - 16,
        size: 9.5,
        font: boldFont,
        color: theme.heading
      });

      state.cursorY -= rowHeight + 8;
    });

    state.cursorY -= 8;
  }

  state.cursorY -= 6;
}

function renderBulletList(
  page: PDFPage,
  font: PDFFont,
  bullets: string[],
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  textColor: ReturnType<typeof rgb>,
  bulletColor: ReturnType<typeof rgb>
) {
  let cursorY = y;
  const bulletColumnWidth = 16;
  const textWidth = maxWidth - bulletColumnWidth;

  for (const bullet of bullets) {
    const lines = wrapText(font, bullet, textWidth, size);
    page.drawCircle({
      x: x + 5,
      y: cursorY - size / 2 + 1,
      size: 1.8,
      color: bulletColor
    });
    lines.forEach((line, index) => {
      page.drawText(line, {
        x: x + bulletColumnWidth,
        y: cursorY - index * (size + BODY_LINE_GAP),
        size,
        font,
        color: textColor
      });
    });

    cursorY -= lines.length * size + Math.max(0, lines.length - 1) * BODY_LINE_GAP + 10;
  }

  return cursorY;
}

function measureBulletListHeight(font: PDFFont, bullets: string[], maxWidth: number, size: number) {
  return bullets.reduce((sum, bullet) => {
    const lines = wrapText(font, bullet, maxWidth - 16, size);
    return sum + lines.length * size + Math.max(0, lines.length - 1) * BODY_LINE_GAP + 10;
  }, 0);
}

function renderTerms(
  state: PageState,
  input: QuotePdfInput,
  theme: Theme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  pdfDoc: PDFDocument,
  branding: QuoteBranding,
  logo: PDFImage | null
) {
  const terms = getQuoteTermsContent({ includeDepositRequirement: input.quote.includeDepositRequirement ?? false });
  drawSectionHeader(
    state,
    terms.title,
    null,
    theme,
    boldFont,
    regularFont
  );

  if (terms.intro) {
    const introHeight = 30 + measureTextHeight(regularFont, terms.intro, CONTENT_WIDTH - CARD_PADDING * 2, 9, 4);
    state = ensureSpace(state, introHeight + BLOCK_GAP, pdfDoc, theme, branding, input.quote, boldFont, regularFont, logo);
    drawPanel(state.page, PAGE_MARGIN, state.cursorY, CONTENT_WIDTH, introHeight, theme.paper, theme.line);
    drawTextBlock(
      state.page,
      regularFont,
      terms.intro,
      PAGE_MARGIN + CARD_PADDING,
      state.cursorY - 18,
      CONTENT_WIDTH - CARD_PADDING * 2,
      9,
      theme.ink
    );
    state.cursorY -= introHeight + BLOCK_GAP;
  }

  if (terms.emphasisTitle && terms.emphasisBody) {
    const emphasisHeight =
      40 + measureTextHeight(regularFont, terms.emphasisBody, CONTENT_WIDTH - CARD_PADDING * 2, 9.5, 4);
    state = ensureSpace(state, emphasisHeight + BLOCK_GAP, pdfDoc, theme, branding, input.quote, boldFont, regularFont, logo);
    drawPanel(state.page, PAGE_MARGIN, state.cursorY, CONTENT_WIDTH, emphasisHeight, theme.accentPanel, theme.line);
    state.page.drawText(terms.emphasisTitle.toUpperCase(), {
      x: PAGE_MARGIN + CARD_PADDING,
      y: state.cursorY - 18,
      size: 7.5,
      font: boldFont,
      color: theme.accentText
    });
    drawTextBlock(
      state.page,
      regularFont,
      terms.emphasisBody,
      PAGE_MARGIN + CARD_PADDING,
      state.cursorY - 36,
      CONTENT_WIDTH - CARD_PADDING * 2,
      9.5,
      theme.heading
    );
    state.cursorY -= emphasisHeight + BLOCK_GAP;
  }

  for (const section of terms.sections) {
    const bodyHeight = (section.body ?? []).reduce(
      (sum, paragraph) => sum + measureTextHeight(regularFont, paragraph, CONTENT_WIDTH - CARD_PADDING * 2, 9, 4) + 10,
      0
    );
    const bulletHeight = section.bullets
      ? measureBulletListHeight(regularFont, section.bullets, CONTENT_WIDTH - CARD_PADDING * 2, 9)
      : 0;
    const sectionHeight = Math.max(78, 34 + bodyHeight + bulletHeight);

    state = ensureSpace(state, sectionHeight + BLOCK_GAP, pdfDoc, theme, branding, input.quote, boldFont, regularFont, logo);
    drawPanel(state.page, PAGE_MARGIN, state.cursorY, CONTENT_WIDTH, sectionHeight, theme.paper, theme.line);
    state.page.drawText(section.title.toUpperCase(), {
      x: PAGE_MARGIN + CARD_PADDING,
      y: state.cursorY - 18,
      size: 7.5,
      font: boldFont,
      color: theme.muted
    });

    let sectionY = state.cursorY - 38;
    for (const paragraph of section.body ?? []) {
      sectionY =
        drawTextBlock(
          state.page,
          regularFont,
          paragraph,
          PAGE_MARGIN + CARD_PADDING,
          sectionY,
          CONTENT_WIDTH - CARD_PADDING * 2,
          9,
          theme.ink
        ) - 10;
    }

    if (section.bullets?.length) {
      renderBulletList(
        state.page,
        regularFont,
        section.bullets,
        PAGE_MARGIN + CARD_PADDING,
        sectionY,
        CONTENT_WIDTH - CARD_PADDING * 2,
        9,
        theme.ink,
        theme.softText
      );
    }

    state.cursorY -= sectionHeight + BLOCK_GAP;
  }

  const noteText = normalizeText(input.quote.customerNotes);
  if (noteText) {
    const noteHeight = 32 + measureTextHeight(regularFont, noteText, CONTENT_WIDTH - CARD_PADDING * 2, 9, 4);
    state = ensureSpace(state, noteHeight + BLOCK_GAP, pdfDoc, theme, branding, input.quote, boldFont, regularFont, logo);
    drawPanel(state.page, PAGE_MARGIN, state.cursorY, CONTENT_WIDTH, noteHeight, theme.panel, theme.line);
    state.page.drawText("ADDITIONAL QUOTE NOTES", {
      x: PAGE_MARGIN + CARD_PADDING,
      y: state.cursorY - 18,
      size: 7.5,
      font: boldFont,
      color: theme.muted
    });
    drawTextBlock(
      state.page,
      regularFont,
      noteText,
      PAGE_MARGIN + CARD_PADDING,
      state.cursorY - 36,
      CONTENT_WIDTH - CARD_PADDING * 2,
      9,
      theme.ink
    );
    state.cursorY -= noteHeight + BLOCK_GAP;
  }
}

function renderApproval(
  state: PageState,
  input: QuotePdfInput,
  theme: Theme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  pdfDoc: PDFDocument,
  branding: QuoteBranding,
  logo: PDFImage | null
) {
  const includeHosted = Boolean(normalizeText(input.quote.hostedQuoteUrl));
  const rightWidth = includeHosted ? 208 : 0;
  const leftWidth = includeHosted ? CONTENT_WIDTH - rightWidth - 16 : CONTENT_WIDTH;
  const blockHeight = includeHosted ? 128 : 110;

  state = ensureSpace(state, blockHeight + 12, pdfDoc, theme, branding, input.quote, boldFont, regularFont, logo);
  drawPanel(state.page, PAGE_MARGIN, state.cursorY, leftWidth, blockHeight, theme.panel, theme.line);

  state.page.drawText("Approval", {
    x: PAGE_MARGIN + CARD_PADDING,
    y: state.cursorY - 20,
    size: 13.5,
    font: boldFont,
    color: theme.heading
  });
  drawTextBlock(
    state.page,
    regularFont,
    "This proposal outlines the included work, pricing, and project terms. Approval confirms acceptance of this work and authorizes next-step scheduling.",
    PAGE_MARGIN + CARD_PADDING,
    state.cursorY - 40,
    leftWidth - CARD_PADDING * 2,
    9,
    theme.ink
  );

  const signatureY = state.cursorY - 100;
  drawDivider(state.page, PAGE_MARGIN + CARD_PADDING, signatureY, leftWidth - CARD_PADDING * 2, theme.line);
  state.page.drawText("Authorized approval", {
    x: PAGE_MARGIN + CARD_PADDING,
    y: signatureY - 12,
    size: 7.5,
    font: regularFont,
    color: theme.softText
  });

  if (includeHosted) {
    const hostedX = PAGE_MARGIN + leftWidth + 16;
    drawPanel(state.page, hostedX, state.cursorY, rightWidth, blockHeight, theme.primary, theme.primary);
    state.page.drawText("Review Online", {
      x: hostedX + CARD_PADDING,
      y: state.cursorY - 20,
      size: 12.5,
      font: boldFont,
      color: rgb(1, 1, 1)
    });
    drawTextBlock(
      state.page,
      regularFont,
      "Use the hosted proposal to review the latest details and approve online.",
      hostedX + CARD_PADDING,
      state.cursorY - 40,
      rightWidth - CARD_PADDING * 2,
      8.3,
      rgb(0.91, 0.95, 0.98),
      3
    );
    drawTextBlock(
      state.page,
      regularFont,
      input.quote.hostedQuoteUrl ?? "",
      hostedX + CARD_PADDING,
      state.cursorY - 86,
      rightWidth - CARD_PADDING * 2,
      7.5,
      rgb(1, 1, 1),
      3
    );
  }

  state.cursorY -= blockHeight + 12;
}

export async function generateProposalQuotePdf(input: QuotePdfInput) {
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

  let state = addPage(pdfDoc, 1, theme, branding, input.quote, boldFont, regularFont, logo);
  renderProposalHero(state, input, theme, boldFont, regularFont);
  renderSummaryAndTotals(state, input, theme, boldFont, regularFont);
  state = addPage(pdfDoc, state.pageNumber + 1, theme, branding, input.quote, boldFont, regularFont, logo);
  renderPricingTable(state, input, theme, boldFont, regularFont, pdfDoc, branding, logo);
  state = addPage(pdfDoc, state.pageNumber + 1, theme, branding, input.quote, boldFont, regularFont, logo);
  renderTerms(state, input, theme, boldFont, regularFont, pdfDoc, branding, logo);
  renderApproval(state, input, theme, boldFont, regularFont, pdfDoc, branding, logo);

  const totalPages = pdfDoc.getPageCount();
  pdfDoc.getPages().forEach((page, index) => {
    renderPageFooter(page, theme, regularFont, index + 1, totalPages);
  });

  return pdfDoc.save();
}
