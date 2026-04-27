import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { InspectionType } from "@testworx/types";

import { resolveTenantBranding } from "./branding";
import {
  buildReportPreview,
  isCustomerVisibleField,
  type ReportDraft
} from "./report-engine";
import {
  resolveReportTemplate,
  type ReportFieldDefinition,
  type ReportPrimitiveValue
} from "./report-config";
import {
  customerFacingFieldRules,
  type ReportPageOneConfig,
  mapCustomerFacingReportStatus,
  resolveReportTypeConfig,
  type ChecklistItemConfig,
  type ReportSectionConfig,
  type SummaryFactKey,
  type SummaryMetricKey
} from "./report-pdf-config";
import { getCustomerFacingSiteLabel } from "./scheduling";
import { decodeStoredFile } from "./storage";
import type { PdfInput } from "./pdf-v2";

type PageState = {
  page: PDFPage;
  y: number;
  pageNumber: number;
};

type PdfTheme = {
  primary: ReturnType<typeof rgb>;
  accent: ReturnType<typeof rgb>;
  ink: ReturnType<typeof rgb>;
  muted: ReturnType<typeof rgb>;
  softText: ReturnType<typeof rgb>;
  line: ReturnType<typeof rgb>;
  surface: ReturnType<typeof rgb>;
  softSurface: ReturnType<typeof rgb>;
  passBg: ReturnType<typeof rgb>;
  passText: ReturnType<typeof rgb>;
  failBg: ReturnType<typeof rgb>;
  failText: ReturnType<typeof rgb>;
  warnBg: ReturnType<typeof rgb>;
  warnText: ReturnType<typeof rgb>;
};

type KeyValueRow = { label: string; value: string };
type TableColumn = { key: string; label: string; width: number };
type TableRow = Record<string, string>;
type MetricCard = {
  label: string;
  value: string;
  supportingText?: string;
  tone: "pass" | "fail" | "warn" | "neutral";
};

type OrderedReportSection = {
  sectionConfig: ReportSectionConfig;
  templateSection: ReturnType<typeof resolveReportTemplate>["sections"][number];
  draftSection: ReportDraft["sections"][string];
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const HEADER_HEIGHT = 116;
const FOOTER_HEIGHT = 28;
const BODY_TOP = PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT - 20;
const MIN_CONTENT_Y = PAGE_MARGIN + FOOTER_HEIGHT + 12;
const SECTION_SPACING = 18;
const CARD_GAP = 12;
const TABLE_CELL_PADDING_X = 10;
const TABLE_CELL_PADDING_Y = 12;
const DEFAULT_EMPTY_COPY = "Not provided";
const NO_SITE_ADDRESS_COPY = "No fixed service address on file";
const NO_NOTES_COPY = "No notes provided";
const NO_PHOTOS_COPY = "No inspection photos included";
const NO_SIGNATURE_COPY = "Not captured";
const COMPLIANCE_SUBTITLE = "This inspection was performed in accordance with the following standards.";

function hexToRgb(hex: string, fallback: { r: number; g: number; b: number }) {
  const normalized = hex.replace("#", "").trim();
  if (![3, 6].includes(normalized.length)) {
    return rgb(fallback.r, fallback.g, fallback.b);
  }

  const expanded = normalized.length === 3 ? normalized.split("").map((char) => `${char}${char}`).join("") : normalized;
  const value = Number.parseInt(expanded, 16);
  if (Number.isNaN(value)) {
    return rgb(fallback.r, fallback.g, fallback.b);
  }

  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

function buildTheme(primaryHex?: string | null, accentHex?: string | null): PdfTheme {
  return {
    primary: hexToRgb(primaryHex ?? "#1E3A5F", { r: 0.12, g: 0.23, b: 0.37 }),
    accent: hexToRgb(accentHex ?? "#C2410C", { r: 0.76, g: 0.25, b: 0.05 }),
    ink: rgb(0.09, 0.13, 0.19),
    muted: rgb(0.31, 0.36, 0.43),
    softText: rgb(0.5, 0.56, 0.63),
    line: rgb(0.86, 0.9, 0.94),
    surface: rgb(1, 1, 1),
    softSurface: rgb(0.972, 0.979, 0.987),
    passBg: rgb(0.93, 0.975, 0.947),
    passText: rgb(0.11, 0.41, 0.24),
    failBg: rgb(0.993, 0.948, 0.944),
    failText: rgb(0.6, 0.17, 0.16),
    warnBg: rgb(0.994, 0.972, 0.91),
    warnText: rgb(0.56, 0.39, 0.04)
  };
}

function cleanCustomerFacingText(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const normalized = String(value).replace(/\s+/g, " ").trim();
  if (!normalized || /^(undefined|null|unknown|n\/a|na|[-–—]+|â€”|â€¦)$/i.test(normalized)) {
    return "";
  }

  return normalized;
}

function cleanCellValue(value: string | null | undefined) {
  return cleanCustomerFacingText(value);
}

function withFallback(value: string, fallback: string) {
  return cleanCustomerFacingText(value) || fallback;
}

function joinPresentValues(values: Array<string | null | undefined>, separator: string) {
  return values.map((value) => cleanCustomerFacingText(value)).filter(Boolean).join(separator);
}

function formatCityStatePostal(city?: string | null, state?: string | null, postalCode?: string | null) {
  const locality = joinPresentValues([city, state], ", ");
  return joinPresentValues([locality, postalCode ?? null], " ");
}

export function formatPdfAddress(input: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  fallback?: string;
}) {
  const address = joinPresentValues(
    [
      input.addressLine1 ?? null,
      input.addressLine2 ?? null,
      formatCityStatePostal(input.city, input.state, input.postalCode)
    ],
    ", "
  );

  return address || input.fallback || "";
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

function humanizeText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (!/[_-]/.test(trimmed) && /[A-Z]/.test(trimmed) && /[a-z]/.test(trimmed)) {
    return trimmed;
  }

  if (!/[_-]/.test(trimmed) && !/^[a-z0-9 ]+$/i.test(trimmed)) {
    return trimmed;
  }

  return trimmed
    .replaceAll(/[_-]+/g, " ")
    .split(/\s+/)
    .map((token) => token ? `${token.slice(0, 1).toUpperCase()}${token.slice(1)}` : token)
    .join(" ");
}

function normalizeDisplayValue(value: ReportPrimitiveValue | undefined) {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "string" && (value.startsWith("blob:") || value.startsWith("data:image/"))) {
    return "Included";
  }

  if (typeof value === "string") {
    return cleanCustomerFacingText(humanizeText(value));
  }

  return cleanCustomerFacingText(String(value));
}

function isOtherOptionValue(value: unknown) {
  return typeof value === "string" && value.trim().toLowerCase() === "other";
}

function resolveWorkOrderDisplayValue(primary: unknown, custom?: unknown) {
  const customValue = normalizeDisplayValue(custom as ReportPrimitiveValue | undefined);
  if (isMeaningful(customValue)) {
    return customValue;
  }

  const primaryValue = normalizeDisplayValue(primary as ReportPrimitiveValue | undefined);
  if (isOtherOptionValue(primary) && !isMeaningful(customValue)) {
    return "";
  }

  return primaryValue;
}

function isMeaningful(value: string | null | undefined) {
  return Boolean(value && cleanCustomerFacingText(value));
}

function splitTextIntoLines(font: PDFFont, text: string, maxWidth: number, size: number, maxLines?: number) {
  const normalized = cleanCustomerFacingText(text);
  if (!normalized) {
    return [];
  }
  const paragraphs = normalized.split(/\n+/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      continue;
    }

    let currentLine = "";
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = candidate;
      }

      if (maxLines && lines.length >= maxLines) {
        break;
      }
    }

    if (currentLine && (!maxLines || lines.length < maxLines)) {
      lines.push(currentLine);
    }

    if (maxLines && lines.length >= maxLines) {
      break;
    }
  }

  if (maxLines && lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }

  return lines;
}

function clampLines(lines: string[], font: PDFFont, maxWidth: number, size: number, maxLines: number) {
  if (lines.length <= maxLines) {
    return lines;
  }

  const trimmed = lines.slice(0, maxLines);
  let last = trimmed[maxLines - 1] ?? "";
  while (last.length > 0 && font.widthOfTextAtSize(`${last}…`, size) > maxWidth) {
    last = last.slice(0, -1);
  }
  trimmed[maxLines - 1] = `${last.trimEnd()}…`;
  return trimmed;
}

function measureParagraphHeight(font: PDFFont, text: string, maxWidth: number, size: number, lineGap = 3, maxLines?: number) {
  const lines = clampLines(splitTextIntoLines(font, text, maxWidth, size, maxLines), font, maxWidth, size, maxLines ?? Number.MAX_SAFE_INTEGER);
  return Math.max(lines.length, 1) * (size + lineGap);
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
  lineGap = 3,
  maxLines?: number
) {
  const lines = clampLines(splitTextIntoLines(font, text, maxWidth, size, maxLines), font, maxWidth, size, maxLines ?? Number.MAX_SAFE_INTEGER);
  if (lines.length === 0) {
    return y;
  }
  lines.forEach((line, index) => {
    page.drawText(line, { x, y: y - index * (size + lineGap), size, font, color });
  });
  return y - lines.length * (size + lineGap);
}

function drawRect(page: PDFPage, x: number, yTop: number, width: number, height: number, color: ReturnType<typeof rgb>, borderColor?: ReturnType<typeof rgb>, borderWidth = 0) {
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

async function embedImage(pdfDoc: PDFDocument, dataUrl: string) {
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

function getReportTitle(input: PdfInput) {
  return resolveReportTypeConfig(input.task.inspectionType).title;
}

export function getCustomerFacingReportState(input: Pick<PdfInput, "report">) {
  return mapCustomerFacingReportStatus({
    isFinalized: Boolean(input.report.finalizedAt),
    isSigned: Boolean(input.report.finalizedAt)
  }).documentStatus;
}

export function getCustomerFacingOutcomeLabel(input: Pick<PdfInput, "report">, deficiencyTotal: number) {
  if (!input.report.finalizedAt) {
    return deficiencyTotal > 0 ? "Deficiencies Found" : "Completed";
  }

  return deficiencyTotal > 0 ? "Deficiencies Found" : "Passed";
}

export function buildPdfPhotoCaption(index: number) {
  return `Photo ${index + 1}`;
}

export function getPdfComplianceStandards(inspectionType: InspectionType) {
  return resolveReportTypeConfig(inspectionType).compliance.codes;
}

function getDisplayCompletionStatus(input: PdfInput) {
  return input.report.finalizedAt ? "Completed" : "In Review";
}

function getDisplayResultStatus(input: PdfInput, deficiencyTotal: number) {
  if (!input.report.finalizedAt) {
    return deficiencyTotal > 0 ? "Failed" : "Completed";
  }

  return deficiencyTotal > 0 ? "Failed" : "Passed";
}

function getDisplayInspectionStatus(input: PdfInput) {
  return mapCustomerFacingReportStatus({
    isFinalized: Boolean(input.report.finalizedAt),
    isSigned: Boolean(input.report.finalizedAt),
    workflowStatus: input.inspection.status
  }).inspectionStatus;
}

function getDisplaySectionStatus(status: string, input: PdfInput) {
  const normalized = cleanCustomerFacingText(status).toLowerCase();
  if (input.report.finalizedAt && ["in progress", "in_progress", "to be completed", "draft", "pending"].includes(normalized)) {
    return "Finalized";
  }

  if (normalized === "pass_with_deficiencies") {
    return "Deficiencies Found";
  }

  return humanizeText(status);
}

function renderPremiumPageChrome(
  page: PDFPage,
  input: PdfInput,
  branding: ReturnType<typeof resolveTenantBranding>,
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  logoEmbedded: PDFImage | null,
  pageNumber: number
) {
  const headerTop = PAGE_HEIGHT - PAGE_MARGIN;
  const leftX = PAGE_MARGIN;
  const rightZoneWidth = 224;
  const gutter = 20;
  const leftZoneWidth = CONTENT_WIDTH - rightZoneWidth - gutter;
  const rightZoneX = PAGE_MARGIN + leftZoneWidth + gutter;
  const logoBox = 42;
  const companyName = branding.legalBusinessName || input.tenant.name;
  const contactDetails = joinPresentValues([branding.phone, branding.email], "   ");
  const addressLine = formatPdfAddress({
    addressLine1: branding.addressLine1,
    addressLine2: branding.addressLine2,
    city: branding.city,
    state: branding.state,
    postalCode: branding.postalCode
  });
  const reportTitle = getReportTitle(input);
  const metadataRows: KeyValueRow[] = [
    { label: "Report ID", value: input.report.id },
    { label: "Service Date", value: formatDate(input.inspection.scheduledStart) },
    { label: "Page", value: String(pageNumber) }
  ];
  const row1Top = headerTop - 8;
  const row2Top = headerTop - 52;

  if (logoEmbedded) {
    const scaled = logoEmbedded.scale(1);
    const ratio = Math.min(logoBox / scaled.width, logoBox / scaled.height, 1);
    const width = scaled.width * ratio;
    const height = scaled.height * ratio;
    page.drawImage(logoEmbedded, {
      x: leftX,
      y: row1Top - height + 2,
      width,
      height
    });
  } else {
    drawRect(page, leftX, row1Top + 4, logoBox, logoBox, theme.softSurface, theme.line, 1);
    page.drawText(companyName.split(/\s+/).map((part) => part[0] ?? "").slice(0, 2).join("").toUpperCase(), {
      x: leftX + 13,
      y: row1Top - 24,
      size: 18,
      font: boldFont,
      color: theme.primary
    });
  }

  drawParagraph(page, boldFont, companyName, leftX + 56, row1Top - 2, leftZoneWidth - 56, 13, theme.ink, 3, 2);
  drawParagraph(page, boldFont, reportTitle, rightZoneX, row1Top - 2, rightZoneWidth, 16, theme.ink, 3, 2);

  let contactY = row2Top;
  if (contactDetails) {
    drawParagraph(page, regularFont, contactDetails, leftX, contactY, leftZoneWidth, 8.5, theme.softText, 3, 2);
    contactY -= 12;
  }
  if (addressLine) {
    drawParagraph(page, regularFont, addressLine, leftX, contactY, leftZoneWidth, 8, theme.softText, 3, 2);
  }

  let metaY = row2Top;
  metadataRows.forEach((row) => {
    page.drawText(row.label.toUpperCase(), {
      x: rightZoneX,
      y: metaY,
      size: 7,
      font: boldFont,
      color: theme.softText
    });
    const valueWidth = regularFont.widthOfTextAtSize(row.value, 8.5);
    page.drawText(row.value, {
      x: rightZoneX + rightZoneWidth - valueWidth,
      y: metaY,
      size: 8.5,
      font: regularFont,
      color: theme.ink
    });
    metaY -= 12;
  });

  page.drawLine({
    start: { x: PAGE_MARGIN, y: PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT },
    end: { x: PAGE_WIDTH - PAGE_MARGIN, y: PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT },
    thickness: 1,
    color: theme.line
  });

  page.drawText(companyName, {
    x: PAGE_MARGIN,
    y: PAGE_MARGIN - 2,
    size: 8,
    font: regularFont,
    color: theme.softText
  });

  const footerReference = joinPresentValues([getCustomerFacingReportState(input), input.report.id], " | ");
  if (footerReference) {
    page.drawText(footerReference, {
      x: PAGE_MARGIN + 150,
      y: PAGE_MARGIN - 2,
      size: 8,
      font: regularFont,
      color: theme.softText
    });
  }

  const pageLabel = `Page ${pageNumber}`;
  page.drawText(pageLabel, {
    x: PAGE_WIDTH - PAGE_MARGIN - regularFont.widthOfTextAtSize(pageLabel, 8),
    y: PAGE_MARGIN - 2,
    size: 8,
    font: regularFont,
    color: theme.softText
  });
}

function renderPageChrome(
  page: PDFPage,
  input: PdfInput,
  branding: ReturnType<typeof resolveTenantBranding>,
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  logoEmbedded: PDFImage | null,
  pageNumber: number
) {
  const headerTop = PAGE_HEIGHT - PAGE_MARGIN;
  const leftX = PAGE_MARGIN;
  const rightX = PAGE_WIDTH - PAGE_MARGIN;
  const logoBox = 54;

  if (logoEmbedded) {
    const scaled = logoEmbedded.scale(1);
    const ratio = Math.min(logoBox / scaled.width, logoBox / scaled.height, 1);
    const width = scaled.width * ratio;
    const height = scaled.height * ratio;
    page.drawImage(logoEmbedded, {
      x: leftX,
      y: headerTop - 8 - height,
      width,
      height
    });
  } else {
    drawRect(page, leftX, headerTop - 4, logoBox, logoBox, theme.softSurface, theme.line, 1);
    page.drawText((branding.legalBusinessName || input.tenant.name).split(/\s+/).map((part) => part[0] ?? "").slice(0, 2).join("").toUpperCase(), {
      x: leftX + 13,
      y: headerTop - 34,
      size: 18,
      font: boldFont,
      color: theme.primary
    });
  }

  page.drawText(branding.legalBusinessName || input.tenant.name, {
    x: leftX + 66,
    y: headerTop - 18,
    size: 16,
    font: boldFont,
    color: theme.ink
  });

  const contactLines = [
    [branding.phone, branding.email].filter(Boolean).join("  •  "),
    branding.website || [branding.addressLine1, branding.city && branding.state ? `${branding.city}, ${branding.state}` : branding.city || branding.state, branding.postalCode].filter(Boolean).join(" ")
  ].filter(Boolean);

  let contactY = headerTop - 34;
  for (const line of contactLines) {
    page.drawText(line, {
      x: leftX + 66,
      y: contactY,
      size: 8.5,
      font: regularFont,
      color: theme.softText
    });
    contactY -= 12;
  }

  const title = getReportTitle(input);
  const titleWidth = boldFont.widthOfTextAtSize(title, 17);
  page.drawText(title, {
    x: Math.max(rightX - titleWidth, PAGE_MARGIN + 240),
    y: headerTop - 18,
    size: 17,
    font: boldFont,
    color: theme.ink
  });

  const metaRows = [
    ["Report ID", input.report.id],
    ["Inspection Date", formatDate(input.inspection.scheduledStart)],
    ["Page", `${pageNumber}`]
  ] satisfies Array<[string, string]>;

  let metaY = headerTop - 36;
  for (const [label, value] of metaRows) {
    const labelWidth = regularFont.widthOfTextAtSize(label, 8);
    const valueWidth = boldFont.widthOfTextAtSize(value, 8.5);
    const x = rightX - Math.max(labelWidth, valueWidth);
    page.drawText(label, { x, y: metaY, size: 8, font: regularFont, color: theme.softText });
    page.drawText(value, { x: rightX - valueWidth, y: metaY - 11, size: 8.5, font: boldFont, color: theme.ink });
    metaY -= 24;
  }

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
  input: PdfInput,
  branding: ReturnType<typeof resolveTenantBranding>,
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  logoEmbedded: PDFImage | null,
  pageNumber: number
) {
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  renderPremiumPageChrome(page, input, branding, theme, boldFont, regularFont, logoEmbedded, pageNumber);
  return { page, y: BODY_TOP, pageNumber };
}

function ensureSpace(
  state: PageState,
  pdfDoc: PDFDocument,
  input: PdfInput,
  branding: ReturnType<typeof resolveTenantBranding>,
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  logoEmbedded: PDFImage | null,
  neededHeight: number
) {
  if (state.y - neededHeight >= MIN_CONTENT_Y) {
    return state;
  }

  return addPage(pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, state.pageNumber + 1);
}

function drawSectionTitle(state: PageState, title: string, subtitle: string | undefined, theme: PdfTheme, boldFont: PDFFont, regularFont: PDFFont) {
  drawRect(state.page, PAGE_MARGIN, state.y + 2, 4, 28, theme.accent);
  state.page.drawText(title, {
    x: PAGE_MARGIN + 12,
    y: state.y,
    size: 12.5,
    font: boldFont,
    color: theme.ink
  });

  let nextY = state.y - 16;
  if (subtitle) {
    nextY = drawParagraph(state.page, regularFont, subtitle, PAGE_MARGIN + 12, nextY, CONTENT_WIDTH - 12, 8.5, theme.softText, 3, 3) - 6;
  } else {
    nextY -= 4;
  }

  state.page.drawLine({
    start: { x: PAGE_MARGIN, y: nextY },
    end: { x: PAGE_MARGIN + CONTENT_WIDTH, y: nextY },
    thickness: 1,
    color: theme.line
  });
  state.y = nextY - 12;
}

function drawBadge(
  page: PDFPage,
  x: number,
  yTop: number,
  label: string,
  theme: PdfTheme,
  boldFont: PDFFont,
  variant: "pass" | "fail" | "warn" | "neutral"
) {
  const palette = variant === "pass"
    ? { bg: theme.passBg, text: theme.passText }
    : variant === "fail"
      ? { bg: theme.failBg, text: theme.failText }
      : variant === "warn"
        ? { bg: theme.warnBg, text: theme.warnText }
        : { bg: theme.softSurface, text: theme.primary };
  const width = Math.max(74, boldFont.widthOfTextAtSize(label, 8) + 18);
  drawRect(page, x, yTop, width, 18, palette.bg, palette.bg, 1);
  page.drawText(label, {
    x: x + (width - boldFont.widthOfTextAtSize(label, 8)) / 2,
    y: yTop - 11.5,
    size: 8,
    font: boldFont,
    color: palette.text
  });
  return width;
}

function statusVariant(status: string): "pass" | "fail" | "warn" | "neutral" {
  if (["pass", "completed", "resolved"].includes(status)) {
    return "pass";
  }
  if (["fail", "deficiencies_found", "cancelled", "open"].includes(status)) {
    return "fail";
  }
  if (["attention", "pending", "in_progress", "follow_up_required"].includes(status)) {
    return "warn";
  }
  return "neutral";
}

function renderComplianceStandards(
  state: PageState,
  compliance: ReportPageOneConfig["compliance"],
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  const standards = compliance.enabled ? compliance.codes : [];
  if (standards.length === 0) {
    return;
  }

  const standardsLine = standards.join(" • ");
  const description = compliance.description || COMPLIANCE_SUBTITLE;
  const contentHeight =
    18 +
    measureParagraphHeight(boldFont, standardsLine, CONTENT_WIDTH - 24, 12, 3, 2) +
    measureParagraphHeight(regularFont, description, CONTENT_WIDTH - 24, 8.5, 3, 2);
  const blockHeight = Math.max(64, contentHeight);

  drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, blockHeight, theme.softSurface, theme.line, 1);
  state.page.drawText((compliance.label || "Compliance Standards").toUpperCase(), {
    x: PAGE_MARGIN + 12,
    y: state.y - 16,
    size: 7.5,
    font: boldFont,
    color: theme.softText
  });
  drawParagraph(state.page, boldFont, standardsLine, PAGE_MARGIN + 12, state.y - 34, CONTENT_WIDTH - 24, 12, theme.ink, 3, 2);
  drawParagraph(state.page, regularFont, description, PAGE_MARGIN + 12, state.y - 52, CONTENT_WIDTH - 24, 8.5, theme.muted, 3, 2);
  state.y -= blockHeight + SECTION_SPACING;
}

function renderIdentityBand(
  state: PageState,
  input: PdfInput,
  pageOneConfig: ReportPageOneConfig,
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  const customerFacingSiteName = getCustomerFacingSiteLabel(input.site.name);
  const facts: KeyValueRow[] = [];

  if (pageOneConfig.identity.showCustomer && isMeaningful(input.customerCompany.name)) {
    facts.push({ label: "Customer", value: input.customerCompany.name });
  }
  if (pageOneConfig.identity.showSite && isMeaningful(customerFacingSiteName)) {
    facts.push({ label: "Site", value: customerFacingSiteName ?? "" });
  }
  if (pageOneConfig.identity.showTechnician && isMeaningful(input.report.technicianName ?? "")) {
    facts.push({ label: "Technician", value: input.report.technicianName ?? "" });
  }
  if (pageOneConfig.identity.showServiceDate) {
    facts.push({ label: "Service Date", value: formatDate(input.inspection.scheduledStart) });
  }

  const title = getReportTitle(input);
  const blockHeight = Math.max(88, 40 + Math.max(facts.length, 1) * 18);
  drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, blockHeight, theme.surface, theme.line, 1);
  drawParagraph(state.page, boldFont, title, PAGE_MARGIN + 14, state.y - 18, CONTENT_WIDTH - 28, 18, theme.ink, 3, 2);

  let rowY = state.y - 46;
  for (const fact of facts) {
    state.page.drawText(`${fact.label}:`, {
      x: PAGE_MARGIN + 14,
      y: rowY,
      size: 8.5,
      font: boldFont,
      color: theme.muted
    });
    drawParagraph(state.page, regularFont, fact.value, PAGE_MARGIN + 90, rowY, CONTENT_WIDTH - 104, 8.5, theme.ink, 3, 1);
    rowY -= 18;
  }

  state.y -= blockHeight + SECTION_SPACING;
}

function renderKpiStrip(
  state: PageState,
  preview: ReturnType<typeof buildReportPreview>,
  input: PdfInput,
  metricKeys: SummaryMetricKey[],
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  const deficiencyTotal = preview.deficiencyCount + preview.manualDeficiencyCount;
  const cards = metricKeys.map((metricKey) => buildSummaryMetricCard(metricKey, input, deficiencyTotal));

  renderMetricCards(state, cards, theme, boldFont, regularFont, Math.max(1, cards.length));
}

function inspectionHasFollowUp(input: PdfInput) {
  for (const section of Object.values(input.draft.sections)) {
    for (const [fieldId, value] of Object.entries(section.fields)) {
      if (/follow.?up|recommendedRepair|recommended/i.test(fieldId) && (value === true || (typeof value === "string" && cleanCustomerFacingText(value)))) {
        return true;
      }
    }
  }

  return false;
}

function buildSummaryMetricCard(metricKey: SummaryMetricKey, input: PdfInput, deficiencyTotal: number): MetricCard {
  switch (metricKey) {
    case "documentStatus":
      return {
        label: "Document Status",
        value: getCustomerFacingReportState(input),
        supportingText: input.report.finalizedAt ? withFallback(formatDateTime(input.report.finalizedAt), "Finalized") : "Awaiting finalization",
        tone: input.report.finalizedAt ? "pass" : "warn"
      };
    case "outcome":
      return {
        label: "Outcome",
        value: getDisplayResultStatus(input, deficiencyTotal),
        supportingText: deficiencyTotal > 0 ? "Deficiencies require follow-up" : "No deficiencies recorded",
        tone: deficiencyTotal > 0 ? "fail" : "pass"
      };
    case "deficiencyCount":
      return {
        label: "Deficiencies",
        value: deficiencyTotal === 0 ? "None" : String(deficiencyTotal),
        supportingText: deficiencyTotal === 1 ? "1 issue recorded" : `${deficiencyTotal} issues recorded`,
        tone: deficiencyTotal > 0 ? "fail" : "neutral"
      };
    case "completionPercent":
      return {
        label: "Completion",
        value: input.report.finalizedAt ? "100%" : "In Review",
        supportingText: input.report.finalizedAt ? "Report finalized" : "Awaiting finalization",
        tone: input.report.finalizedAt ? "pass" : "warn"
      };
    case "followUpRequired": {
      const followUpRequired = inspectionHasFollowUp(input);
      return {
        label: "Follow-Up",
        value: followUpRequired ? "Required" : "Not Required",
        supportingText: followUpRequired ? "Additional service may be needed" : "No follow-up recorded",
        tone: followUpRequired ? "warn" : "neutral"
      };
    }
    case "serviceDate":
    default:
      return {
        label: "Service Date",
        value: withFallback(formatDate(input.inspection.scheduledStart), DEFAULT_EMPTY_COPY),
        supportingText: input.report.technicianName ? `Technician ${input.report.technicianName}` : "Technician not assigned",
        tone: "neutral"
      };
  }
}

function renderMetricCards(
  state: PageState,
  cards: MetricCard[],
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  columns?: number
) {
  const gap = 10;
  const count = Math.max(1, columns ?? cards.length);
  const cardWidth = (CONTENT_WIDTH - gap * (count - 1)) / count;
  const cardHeight = 74;

  cards.forEach((card, index) => {
    const x = PAGE_MARGIN + index * (cardWidth + gap);
    const toneBg = card.tone === "pass"
      ? theme.passBg
      : card.tone === "fail"
        ? theme.failBg
        : card.tone === "warn"
          ? theme.warnBg
          : theme.softSurface;
    const toneText = card.tone === "pass"
      ? theme.passText
      : card.tone === "fail"
        ? theme.failText
        : card.tone === "warn"
          ? theme.warnText
          : theme.primary;

    drawRect(state.page, x, state.y, cardWidth, cardHeight, toneBg, theme.line, 1);
    state.page.drawText(card.label.toUpperCase(), {
      x: x + 10,
      y: state.y - 14,
      size: 7,
      font: boldFont,
      color: theme.softText
    });
    drawParagraph(state.page, boldFont, card.value, x + 10, state.y - 30, cardWidth - 20, 15, toneText, 3, 2);
    if (card.supportingText) {
      drawParagraph(state.page, regularFont, card.supportingText, x + 10, state.y - 54, cardWidth - 20, 8, theme.muted, 3, 2);
    }
  });

  state.y -= cardHeight + SECTION_SPACING;
}

function renderKeyValueGrid(
  state: PageState,
  items: KeyValueRow[],
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  columns = 2
) {
  const filtered = items.filter((item) => isMeaningful(item.value));
  const rows = filtered.length > 0 ? filtered : [{ label: "Details", value: DEFAULT_EMPTY_COPY }];
  const gap = CARD_GAP;
  const columnWidth = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  const heights = rows.map((row) => 34 + measureParagraphHeight(regularFont, row.value, columnWidth - 20, 10, 3, 3));
  const totalRows = Math.ceil(rows.length / columns);
  const rowHeights = Array.from({ length: totalRows }, (_, rowIndex) => {
    const slice = heights.slice(rowIndex * columns, rowIndex * columns + columns);
    return Math.max(...slice, 54);
  });
  const totalHeight = rowHeights.reduce((sum, height) => sum + height, 0) + gap * Math.max(totalRows - 1, 0);

  drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, totalHeight + 16, theme.surface, theme.line, 1);
  let currentY = state.y - 12;
  for (let rowIndex = 0; rowIndex < totalRows; rowIndex += 1) {
    const rowHeight = rowHeights[rowIndex]!;
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const index = rowIndex * columns + columnIndex;
      const item = rows[index];
      if (!item) {
        continue;
      }
      const x = PAGE_MARGIN + 8 + columnIndex * (columnWidth + gap);
      drawRect(state.page, x, currentY, columnWidth, rowHeight, theme.softSurface, theme.line, 1);
      state.page.drawText(item.label.toUpperCase(), {
        x: x + 10,
        y: currentY - 14,
        size: 7,
        font: boldFont,
        color: theme.softText
      });
      drawParagraph(state.page, regularFont, item.value, x + 10, currentY - 28, columnWidth - 20, 10, theme.ink, 3, 3);
    }
    currentY -= rowHeight + gap;
  }

  state.y -= totalHeight + 28;
}

function firstValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const normalized = normalizeDisplayValue(row[key] as ReportPrimitiveValue | undefined);
    if (isMeaningful(normalized)) {
      return normalized;
    }
  }

  return "";
}

function buildIndicatorSummary(
  row: Record<string, unknown>,
  rowFields: Array<Exclude<ReportFieldDefinition, { type: "repeater" }>>
) {
  const priority = rowFields
    .filter((field) =>
      /(gauge|mount|seal|hose|pin|pressure|test|status|condition|battery|load|hydro|serviceDate|newUnit|signal|alarm|breaker|power|followUp|recommendedRepair)/i.test(field.id)
    )
    .map((field) => `${field.label}: ${normalizeDisplayValue(row[field.id] as ReportPrimitiveValue | undefined)}`)
    .filter((value) => !value.endsWith(": "))
    .slice(0, 4);

  if (priority.length > 0) {
    return priority.join(" • ");
  }

  const fallback = rowFields
    .map((field) => `${field.label}: ${normalizeDisplayValue(row[field.id] as ReportPrimitiveValue | undefined)}`)
    .filter((value) => !value.endsWith(": "))
    .slice(0, 3);

  return fallback.length > 0 ? fallback.join(" • ") : "";
}

function buildRepeaterTableRows(
  rowFields: Array<Exclude<ReportFieldDefinition, { type: "repeater" }>>,
  rows: Array<Record<string, unknown>>
) {
  return rows.map((row) => ({
    location: firstValue(row, ["location", "systemLocation", "protectedArea", "pullStationLocation", "assemblyLocation"]),
    type: firstValue(row, ["extinguisherType", "fixtureType", "deviceType", "assemblyType", "tankType", "assetTag"]),
    manufacturer: firstValue(row, ["manufacturer", "billingManufacturer"]),
    service: firstValue(row, ["servicePerformed", "serviceAction", "status", "fireAlarmSystemStatus"]),
    indicators: buildIndicatorSummary(row, rowFields),
    notes: firstValue(row, ["notes", "servicePerformedOther", "inspectorNotes", "jurisdictionNotes"])
  }));
}

function renderTableHeader(
  state: PageState,
  columns: TableColumn[],
  theme: PdfTheme,
  boldFont: PDFFont
) {
  let x = PAGE_MARGIN;
  drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, 22, theme.softSurface, theme.line, 1);
  for (const column of columns) {
    const width = CONTENT_WIDTH * column.width;
    state.page.drawText(column.label.toUpperCase(), {
      x: x + 8,
      y: state.y - 14,
      size: 7,
      font: boldFont,
      color: theme.softText
    });
    x += width;
  }
  state.y -= 22;
}

function rowHeightForTable(columns: TableColumn[], row: TableRow, regularFont: PDFFont) {
  let maxHeight = 34;
  for (const column of columns) {
    const width = CONTENT_WIDTH * column.width;
    const height = 16 + measureParagraphHeight(regularFont, row[column.key] ?? "", width - TABLE_CELL_PADDING_X * 2, 8.5, 2, 3);
    maxHeight = Math.max(maxHeight, height);
  }
  return maxHeight;
}

function drawTableRow(
  state: PageState,
  columns: TableColumn[],
  row: TableRow,
  theme: PdfTheme,
  regularFont: PDFFont,
  rowHeight: number,
  index: number
) {
  drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, rowHeight, index % 2 === 0 ? theme.surface : theme.softSurface, theme.line, 1);
  let x = PAGE_MARGIN;
  for (const column of columns) {
    const width = CONTENT_WIDTH * column.width;
    drawParagraph(state.page, regularFont, cleanCellValue(row[column.key] ?? ""), x + TABLE_CELL_PADDING_X, state.y - TABLE_CELL_PADDING_Y, width - TABLE_CELL_PADDING_X * 2, 8.5, theme.ink, 2, 3);
    x += width;
  }
  state.y -= rowHeight;
}

function renderTableBlock(
  state: PageState,
  pdfDoc: PDFDocument,
  input: PdfInput,
  branding: ReturnType<typeof resolveTenantBranding>,
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  logoEmbedded: PDFImage | null,
  title: string,
  columns: TableColumn[],
  rows: TableRow[],
  emptyMessage: string
) {
  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 54);
  state.page.drawText(title, {
    x: PAGE_MARGIN,
    y: state.y,
    size: 10.5,
    font: boldFont,
    color: theme.ink
  });
  state.y -= 16;

  if (rows.length === 0) {
    drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, 42, theme.surface, theme.line, 1);
    state.page.drawText(emptyMessage, {
      x: PAGE_MARGIN + 10,
      y: state.y - 24,
      size: 9,
      font: regularFont,
      color: theme.softText
    });
    state.y -= 56;
    return state;
  }

  renderTableHeader(state, columns, theme, boldFont);

  rows.forEach((row, index) => {
    const height = rowHeightForTable(columns, row, regularFont);
    state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, height + 12);
    if (state.y === BODY_TOP) {
      state.page.drawText(title, {
        x: PAGE_MARGIN,
        y: state.y,
        size: 10.5,
        font: boldFont,
        color: theme.ink
      });
      state.y -= 16;
      renderTableHeader(state, columns, theme, boldFont);
    }
    drawTableRow(state, columns, row, theme, regularFont, height, index);
  });

  state.y -= 14;
  return state;
}

function renderRepeaterTable(
  state: PageState,
  pdfDoc: PDFDocument,
  input: PdfInput,
  branding: ReturnType<typeof resolveTenantBranding>,
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  logoEmbedded: PDFImage | null,
  title: string,
  rows: TableRow[]
) {
  const columns: TableColumn[] = [
    { key: "location", label: "Location", width: 0.17 },
    { key: "type", label: "Type", width: 0.15 },
    { key: "manufacturer", label: "Manufacturer", width: 0.13 },
    { key: "service", label: "Service", width: 0.15 },
    { key: "indicators", label: "Key inspection indicators", width: 0.24 },
    { key: "notes", label: "Notes", width: 0.16 }
  ];

  return renderTableBlock(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, title, columns, rows, "No items recorded.");
}

function renderChecklistSection(
  state: PageState,
  pdfDoc: PDFDocument,
  input: PdfInput,
  branding: ReturnType<typeof resolveTenantBranding>,
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  logoEmbedded: PDFImage | null,
  title: string,
  items: ChecklistItemConfig[],
  fields: Record<string, unknown>,
  emptyMessage: string
) {
  const rows = items
    .map((item) => ({
      item: item.label,
      result: normalizeDisplayValue(fields[item.key] as ReportPrimitiveValue | undefined)
    }))
    .filter((row) => isMeaningful(row.result));

  const columns: TableColumn[] = [
    { key: "item", label: "Checklist Item", width: 0.72 },
    { key: "result", label: "Result", width: 0.28 }
  ];

  return renderTableBlock(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, title, columns, rows, emptyMessage);
}

function getScalarSectionItems(
  sectionTemplate: ReturnType<typeof resolveReportTemplate>["sections"][number],
  section: ReportDraft["sections"][string]
) {
  return sectionTemplate.fields
    .filter((field) => field.type !== "repeater")
    .filter((field) => isCustomerVisibleField(field, section.fields))
    .map((field) => ({
      label: field.label,
      value: normalizeDisplayValue(section.fields[field.id] as ReportPrimitiveValue | undefined)
    }))
    .filter((item) => isMeaningful(item.value));
}

function getSectionTableGroups(
  sectionTemplate: ReturnType<typeof resolveReportTemplate>["sections"][number],
  section: ReportDraft["sections"][string]
) {
  return sectionTemplate.fields
    .filter((field): field is Extract<ReportFieldDefinition, { type: "repeater" }> => field.type === "repeater")
    .filter((field) => isCustomerVisibleField(field, section.fields))
    .map((field) => {
      const rows = Array.isArray(section.fields[field.id]) ? section.fields[field.id] as Array<Record<string, unknown>> : [];
      return {
        label: field.label,
        rows: buildRepeaterTableRows(field.rowFields, rows)
      };
    })
    .filter((group) => group.rows.length > 0);
}

function getOrderedReportSections(
  configSections: ReportSectionConfig[],
  template: ReturnType<typeof resolveReportTemplate>,
  draft: ReportDraft
) {
  const configured = configSections
    .filter((section) => !["findings", "notes", "photos", "signatures"].includes(section.renderer))
    .map((sectionConfig) => {
      const sourceSectionId = sectionConfig.sourceSectionId ?? sectionConfig.key;
      const templateSection = template.sections.find((section) => section.id === sourceSectionId);
      const draftSection = draft.sections[sourceSectionId];
      return templateSection && draftSection ? { sectionConfig, templateSection, draftSection } : null;
    })
    .filter(Boolean) as OrderedReportSection[];

  if (configured.length > 0) {
    return configured;
  }

  return draft.sectionOrder
    .map((sectionId) => {
      const templateSection = template.sections.find((section) => section.id === sectionId);
      const draftSection = draft.sections[sectionId];
      return templateSection && draftSection
        ? {
            sectionConfig: {
              key: sectionId,
              title: templateSection.label,
              description: templateSection.description,
              renderer: templateSection.fields.some((field) => field.type === "repeater") ? "table" as const : "keyValue" as const,
              sourceSectionId: sectionId
            },
            templateSection,
            draftSection
          }
        : null;
    })
    .filter(Boolean) as OrderedReportSection[];
}

function renderPageOne(
  state: PageState,
  pdfDoc: PDFDocument,
  input: PdfInput,
  branding: ReturnType<typeof resolveTenantBranding>,
  pageOneConfig: ReportPageOneConfig,
  orderedSections: OrderedReportSection[],
  preview: ReturnType<typeof buildReportPreview>,
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  logoEmbedded: PDFImage | null
) {
  renderIdentityBand(state, input, pageOneConfig, theme, boldFont, regularFont);
  renderComplianceStandards(state, pageOneConfig.compliance, theme, boldFont, regularFont);
  renderKpiStrip(state, preview, input, pageOneConfig.outcomeSummary.metrics, theme, boldFont, regularFont);

  drawSectionTitle(state, "Customer and Service Context", "Customer, site, technician, and completion context for this report.", theme, boldFont, regularFont);
  renderInspectionOverview(state, input, pageOneConfig.primaryFacts.fields, pageOneConfig.primaryFacts.layout, theme, boldFont, regularFont);

  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 160);
  drawSectionTitle(state, "Inspection Overview", "Operational context and service details captured for this visit.", theme, boldFont, regularFont);
  renderSummaryContext(state, input, pageOneConfig.overviewFacts.fields, pageOneConfig.overviewFacts.layout, theme, boldFont, regularFont);

  const systemSection = orderedSections.find(({ sectionConfig }) => sectionConfig.key === pageOneConfig.systemSummary.sectionKey || sectionConfig.sourceSectionId === pageOneConfig.systemSummary.sectionKey);
  if (!systemSection) {
    return state;
  }

  const compactItems = getScalarSectionItems(systemSection.templateSection, systemSection.draftSection);
  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 140);
  renderCompactSystemSummary(
    state,
    compactItems,
    systemSection.sectionConfig.title,
    systemSection.sectionConfig.description ?? systemSection.templateSection.description,
    pageOneConfig.systemSummary.mode,
    theme,
    boldFont,
    regularFont
  );

  return state;
}

function extractFollowUpRequirements(sectionTemplate: ReturnType<typeof resolveReportTemplate>["sections"][number], section: ReportDraft["sections"][string]) {
  return sectionTemplate.fields
    .filter((field) => field.type !== "repeater")
    .filter((field) => /follow.?up|recommendedRepair|recommended/i.test(field.id))
    .map((field) => {
      const value = section.fields[field.id] as ReportPrimitiveValue | undefined;
      if (value === true) {
        return `${field.label}: Yes`;
      }
      if (typeof value === "string" && value.trim()) {
        return `${field.label}: ${humanizeText(value.trim())}`;
      }
      return null;
    })
    .filter((value): value is string => Boolean(value));
}

function renderSectionNotes(state: PageState, notes: string, theme: PdfTheme, boldFont: PDFFont, regularFont: PDFFont) {
  const resolvedNotes = withFallback(notes, NO_NOTES_COPY);
  const height = 28 + measureParagraphHeight(regularFont, resolvedNotes, CONTENT_WIDTH - 24, 9, 3, 4);
  drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, height, theme.softSurface, theme.line, 1);
  state.page.drawText("Section notes".toUpperCase(), {
    x: PAGE_MARGIN + 10,
    y: state.y - 14,
    size: 7,
    font: boldFont,
    color: theme.softText
  });
  drawParagraph(state.page, regularFont, resolvedNotes, PAGE_MARGIN + 10, state.y - 28, CONTENT_WIDTH - 20, 9, theme.ink, 3, 4);
  state.y -= height + 14;
}

function renderInspectionOverview(
  state: PageState,
  input: PdfInput,
  factKeys: SummaryFactKey[],
  layout: "two-column-grid" | "stacked",
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  renderKeyValueGrid(state, buildSummaryFacts(input, factKeys), theme, boldFont, regularFont, layout === "stacked" ? 1 : 2);
}

function renderSummaryContext(
  state: PageState,
  input: PdfInput,
  factKeys: SummaryFactKey[],
  layout: "two-column-grid" | "stacked",
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  renderKeyValueGrid(state, buildSummaryFacts(input, factKeys), theme, boldFont, regularFont, layout === "stacked" ? 1 : 2);
}

function buildSummaryFacts(input: PdfInput, factKeys: SummaryFactKey[]): KeyValueRow[] {
  const customerFacingSiteName = getCustomerFacingSiteLabel(input.site.name);
  const siteAddress = customerFacingSiteName
    ? [input.site.addressLine1, input.site.addressLine2, [input.site.city, input.site.state, input.site.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : null;

  return factKeys.map((factKey) => {
    switch (factKey) {
      case "customer":
        return { label: "Customer", value: input.customerCompany.name };
      case "site":
        return { label: "Site", value: customerFacingSiteName ?? "" };
      case "inspectionDate":
        return { label: "Inspection Date", value: formatDate(input.inspection.scheduledStart) };
      case "completionDate":
        return { label: "Completion Date", value: input.report.finalizedAt ? formatDateTime(input.report.finalizedAt) : "" };
      case "technician":
        return { label: "Technician", value: input.report.technicianName ?? "" };
      case "billingContact":
        return { label: "Billing Contact", value: input.customerCompany.billingEmail ?? input.customerCompany.phone ?? "" };
      case "siteAddress":
        return { label: "Site Address", value: siteAddress ?? "" };
      case "scheduledWindow":
        return {
          label: "Scheduled Window",
          value: input.inspection.scheduledEnd
            ? `${formatDateTime(input.inspection.scheduledStart)} - ${formatDateTime(input.inspection.scheduledEnd)}`
            : formatDateTime(input.inspection.scheduledStart)
        };
      case "inspectionStatus":
        return { label: "Inspection Status", value: getDisplayInspectionStatus(input) };
      default:
        return { label: humanizeText(factKey), value: "" };
    }
  });
}

function renderCompactSystemSummary(
  state: PageState,
  items: KeyValueRow[],
  title: string,
  description: string | undefined,
  mode: ReportPageOneConfig["systemSummary"]["mode"],
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  const compactItems = items.filter((item) => isMeaningful(item.value)).slice(0, mode === "compact-metrics" ? 4 : 6);
  if (compactItems.length === 0) {
    return;
  }

  drawSectionTitle(state, title, description, theme, boldFont, regularFont);
  renderKeyValueGrid(state, compactItems, theme, boldFont, regularFont, mode === "compact-metrics" ? 4 : 2);
}

function getDraftSectionFieldValue(input: PdfInput, sectionId: string, fieldId: string) {
  return input.draft.sections[sectionId]?.fields?.[fieldId] as ReportPrimitiveValue | Array<Record<string, unknown>> | undefined;
}

function formatWorkOrderHours(value: unknown, custom?: unknown) {
  const resolved = resolveWorkOrderDisplayValue(value, custom);
  if (!isMeaningful(resolved)) {
    return "";
  }

  if (/^\d+(\.\d+)?$/.test(resolved)) {
    const numeric = Number.parseFloat(resolved);
    return `${numeric} ${numeric === 1 ? "hour" : "hours"}`;
  }

  return resolved;
}

function renderWorkOrderSummaryStrip(
  state: PageState,
  input: PdfInput,
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  const gap = 10;
  const cardWidth = (CONTENT_WIDTH - gap * 2) / 3;
  const cardHeight = 68;
  const workOrderNumber = normalizeDisplayValue(getDraftSectionFieldValue(input, "work-performed", "workOrderNumber") as ReportPrimitiveValue | undefined);
  const jobsiteHours = formatWorkOrderHours(
    getDraftSectionFieldValue(input, "work-performed", "jobsiteHours"),
    getDraftSectionFieldValue(input, "work-performed", "jobsiteHoursCustom")
  );
  const followUpRequired = getDraftSectionFieldValue(input, "work-performed", "followUpRequired") === true ? "Yes" : "No";
  const cards = [
    { label: "Work Order", value: isMeaningful(workOrderNumber) ? workOrderNumber : input.report.id, tone: "neutral" as const },
    { label: "Jobsite Hours", value: jobsiteHours, tone: "neutral" as const },
    { label: "Follow-Up", value: followUpRequired, tone: followUpRequired === "Yes" ? "warn" as const : "pass" as const }
  ];

  cards.forEach((card, index) => {
    const x = PAGE_MARGIN + index * (cardWidth + gap);
    const bg = card.tone === "pass" ? theme.passBg : card.tone === "warn" ? theme.warnBg : theme.softSurface;
    const text = card.tone === "pass" ? theme.passText : card.tone === "warn" ? theme.warnText : theme.primary;
    drawRect(state.page, x, state.y, cardWidth, cardHeight, bg, theme.line, 1);
    state.page.drawText(card.label.toUpperCase(), {
      x: x + cardWidth / 2 - boldFont.widthOfTextAtSize(card.label.toUpperCase(), 7) / 2,
      y: state.y - 16,
      size: 7,
      font: boldFont,
      color: theme.softText
    });
    state.page.drawText(card.value, {
      x: x + cardWidth / 2 - boldFont.widthOfTextAtSize(card.value, 16) / 2,
      y: state.y - 42,
      size: 16,
      font: boldFont,
      color: text
    });
  });

  state.y -= cardHeight + 18;
}

function renderWorkOrderNarrative(
  state: PageState,
  title: string,
  body: string,
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  const narrative = withFallback(body, NO_NOTES_COPY);
  const height = 30 + measureParagraphHeight(regularFont, narrative, CONTENT_WIDTH - 20, 9.5, 3, 10);
  drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, height, theme.surface, theme.line, 1);
  state.page.drawText(title.toUpperCase(), {
    x: PAGE_MARGIN + 10,
    y: state.y - 15,
    size: 7,
    font: boldFont,
    color: theme.softText
  });
  drawParagraph(state.page, regularFont, narrative, PAGE_MARGIN + 10, state.y - 30, CONTENT_WIDTH - 20, 9.5, theme.ink, 3, 10);
  state.y -= height + 14;
}

function buildWorkOrderPartsRows(input: PdfInput) {
  const rows = Array.isArray(getDraftSectionFieldValue(input, "parts-equipment-used", "partsEquipmentUsed"))
    ? getDraftSectionFieldValue(input, "parts-equipment-used", "partsEquipmentUsed") as Array<Record<string, unknown>>
    : [];

  return rows.map((row) => ({
    item: resolveWorkOrderDisplayValue(row.item, row.itemCustom),
    category: normalizeDisplayValue(row.category as ReportPrimitiveValue | undefined),
    quantity: normalizeDisplayValue(row.quantity as ReportPrimitiveValue | undefined),
    notes: normalizeDisplayValue(row.notes as ReportPrimitiveValue | undefined)
  }));
}

function buildWorkOrderServiceRows(input: PdfInput) {
  const rows = Array.isArray(getDraftSectionFieldValue(input, "service-provided", "serviceProvided"))
    ? getDraftSectionFieldValue(input, "service-provided", "serviceProvided") as Array<Record<string, unknown>>
    : [];

  return rows.map((row) => ({
    service: resolveWorkOrderDisplayValue(row.service, row.serviceCustom),
    equipment: resolveWorkOrderDisplayValue(row.applicableEquipment, row.applicableEquipmentCustom),
    quantity: normalizeDisplayValue(row.quantity as ReportPrimitiveValue | undefined),
    notes: normalizeDisplayValue(row.notes as ReportPrimitiveValue | undefined)
  }));
}

async function renderWorkOrderReport(
  pdfDoc: PDFDocument,
  input: PdfInput,
  branding: ReturnType<typeof resolveTenantBranding>,
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  logoEmbedded: PDFImage | null
) {
  let state = addPage(pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 1);
  const workOrderNumber = normalizeDisplayValue(getDraftSectionFieldValue(input, "work-performed", "workOrderNumber") as ReportPrimitiveValue | undefined);
  const jobsiteHours = formatWorkOrderHours(
    getDraftSectionFieldValue(input, "work-performed", "jobsiteHours"),
    getDraftSectionFieldValue(input, "work-performed", "jobsiteHoursCustom")
  );
  const followUpRequired = getDraftSectionFieldValue(input, "work-performed", "followUpRequired") === true ? "Yes" : "No";
  const descriptionOfWork = normalizeDisplayValue(getDraftSectionFieldValue(input, "work-performed", "descriptionOfWork") as ReportPrimitiveValue | undefined);
  const additionalNotes = normalizeDisplayValue(getDraftSectionFieldValue(input, "work-performed", "additionalNotes") as ReportPrimitiveValue | undefined);

  renderWorkOrderSummaryStrip(state, input, theme, boldFont, regularFont);

  drawSectionTitle(state, "Summary", "Customer, site, technician, and job summary details for this work order visit.", theme, boldFont, regularFont);
  const customerFacingSiteName = getCustomerFacingSiteLabel(input.site.name);
  const customerFacingSiteAddress = customerFacingSiteName
    ? [input.site.addressLine1, input.site.addressLine2, [input.site.city, input.site.state, input.site.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : "";
  renderKeyValueGrid(state, [
    { label: "Customer", value: input.customerCompany.name },
    { label: "Site", value: customerFacingSiteName ?? "" },
    { label: "Site address", value: customerFacingSiteAddress },
    { label: "Customer contact", value: input.customerCompany.contactName ?? input.customerCompany.billingEmail ?? input.customerCompany.phone ?? "" },
    { label: "Technician", value: input.report.technicianName ?? "" },
    { label: "Work date", value: formatDate(input.inspection.scheduledStart) },
    { label: "Completion date", value: input.report.finalizedAt ? formatDateTime(input.report.finalizedAt) : "" },
    { label: "Jobsite hours", value: jobsiteHours },
    { label: "Follow-up required", value: followUpRequired },
    { label: "Work order ID", value: isMeaningful(workOrderNumber) ? workOrderNumber : input.report.id }
  ], theme, boldFont, regularFont, 2);

  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 120);
  drawSectionTitle(state, "Work performed", "This work order outlines the service work completed and any supporting notes captured during the visit.", theme, boldFont, regularFont);
  renderWorkOrderNarrative(state, "Description of Work", descriptionOfWork, theme, boldFont, regularFont);
  if (isMeaningful(additionalNotes)) {
    state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 96);
    renderWorkOrderNarrative(state, "Additional Notes", additionalNotes, theme, boldFont, regularFont);
  }

  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 88);
  drawSectionTitle(state, "Parts / Equipment Used", "Parts, equipment, and replacement devices supplied during this work order visit.", theme, boldFont, regularFont);
  const partColumns: TableColumn[] = [
    { key: "item", label: "Item", width: 0.36 },
    { key: "category", label: "Category / Type", width: 0.2 },
    { key: "quantity", label: "Qty", width: 0.12 },
    { key: "notes", label: "Notes", width: 0.32 }
  ];
  state = renderTableBlock(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, "Parts / Equipment Used", partColumns, buildWorkOrderPartsRows(input), "No parts or equipment recorded.");

  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 88);
  drawSectionTitle(state, "Service Provided", "Review the service actions completed during this job, along with any applicable device or equipment type.", theme, boldFont, regularFont);
  const serviceColumns: TableColumn[] = [
    { key: "service", label: "Service", width: 0.28 },
    { key: "equipment", label: "Applicable Type / Equipment", width: 0.3 },
    { key: "quantity", label: "Qty", width: 0.1 },
    { key: "notes", label: "Notes", width: 0.32 }
  ];
  state = renderTableBlock(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, "Service Provided", serviceColumns, buildWorkOrderServiceRows(input), "No service entries recorded.");

  if (followUpRequired === "Yes") {
    state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 80);
    renderFindingsBlock(state, "Follow-up requirements", ["Follow-up is required for this job."], "warn", theme, boldFont, regularFont);
  }

  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 170);
  drawSectionTitle(state, "Signatures", "Technician and customer sign-off captured for this work order report.", theme, boldFont, regularFont);
  await renderSignatures(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded);

  return pdfDoc.save();
}

function renderFindingsBlock(
  state: PageState,
  title: string,
  items: string[],
  tone: "neutral" | "fail" | "warn",
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  const bg = tone === "fail" ? theme.failBg : tone === "warn" ? theme.warnBg : theme.surface;
  const text = tone === "fail" ? theme.failText : tone === "warn" ? theme.warnText : theme.ink;
  const height = Math.max(52, 28 + items.reduce((sum, item) => sum + measureParagraphHeight(regularFont, item, CONTENT_WIDTH - 30, 9, 3, 3) + 6, 0));
  drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, height, bg, theme.line, 1);
  state.page.drawText(title, {
    x: PAGE_MARGIN + 10,
    y: state.y - 14,
    size: 10.5,
    font: boldFont,
    color: text
  });
  let y = state.y - 30;
  if (items.length === 0) {
    state.page.drawText(title === "Deficiencies" ? "No deficiencies recorded" : NO_NOTES_COPY, {
      x: PAGE_MARGIN + 10,
      y,
      size: 9,
      font: regularFont,
      color: text
    });
  } else {
    items.forEach((item) => {
      y = drawParagraph(state.page, regularFont, `• ${item}`, PAGE_MARGIN + 10, y, CONTENT_WIDTH - 20, 9, text, 3, 3) - 3;
    });
  }
  state.y -= height + 12;
}

function buildServiceFindingLines(preview: ReturnType<typeof buildReportPreview>) {
  return preview.detectedDeficiencies.map((finding) => {
    const descriptor = [finding.sectionLabel, finding.rowLabel, finding.assetTag, finding.location, finding.deviceType].filter(Boolean).join(" • ");
    return descriptor ? `${descriptor}: ${finding.description}` : finding.description;
  });
}

function buildManualDeficiencyLines(input: PdfInput) {
  return input.deficiencies.map((deficiency) => {
    const meta = [deficiency.location, deficiency.deviceType, `${humanizeText(deficiency.severity)} ${humanizeText(deficiency.status)}`].filter(Boolean).join(" • ");
    return [deficiency.title, deficiency.description, meta].filter(Boolean).join(" — ");
  });
}

async function renderPhotos(
  state: PageState,
  pdfDoc: PDFDocument,
  input: PdfInput,
  branding: ReturnType<typeof resolveTenantBranding>,
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  logoEmbedded: PDFImage | null
) {
  if (input.photos.length === 0) {
    drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, 52, theme.surface, theme.line, 1);
    state.page.drawText(NO_PHOTOS_COPY, {
      x: PAGE_MARGIN + 12,
      y: state.y - 24,
      size: 10,
      font: regularFont,
      color: theme.softText
    });
    state.y -= 66;
    return state;
  }

  const cardGap = CARD_GAP;
  const cardWidth = (CONTENT_WIDTH - cardGap) / 2;
  let column = 0;
  let rowTop = state.y;
  let rowHeight = 0;

  for (const [index, photo] of input.photos.entries()) {
    const embeddedPhoto = await embedImage(pdfDoc, photo.storageKey);
    if (!embeddedPhoto) {
      continue;
    }

    const scaled = embeddedPhoto.scale(1);
    const ratio = Math.min((cardWidth - 20) / scaled.width, 120 / scaled.height, 1);
    const width = scaled.width * ratio;
    const height = scaled.height * ratio;
    const cardHeight = 158;

    if (column === 0) {
      state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, cardHeight + 12);
      rowTop = state.y;
      rowHeight = cardHeight;
    }

    const x = PAGE_MARGIN + column * (cardWidth + cardGap);
    drawRect(state.page, x, rowTop, cardWidth, cardHeight, theme.surface, theme.line, 1);
    state.page.drawImage(embeddedPhoto, {
      x: x + (cardWidth - width) / 2,
      y: rowTop - 18 - height,
      width,
      height
    });
    drawParagraph(state.page, boldFont, buildPdfPhotoCaption(index), x + 10, rowTop - 138, cardWidth - 20, 8.5, theme.ink, 2, 2);

    column += 1;
    if (column === 2) {
      state.y -= rowHeight + 12;
      column = 0;
    }
  }

  if (column !== 0) {
    state.y -= rowHeight + 12;
  }

  return state;
}

async function renderSignatures(
  state: PageState,
  pdfDoc: PDFDocument,
  input: PdfInput,
  branding: ReturnType<typeof resolveTenantBranding>,
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont,
  logoEmbedded: PDFImage | null
) {
  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 168);
  const gap = CARD_GAP;
  const cardWidth = (CONTENT_WIDTH - gap) / 2;
  const cards = [
    { title: "Technician signature", value: input.technicianSignature },
    { title: "Customer signature", value: input.customerSignature }
  ];

  cards.forEach((card, index) => {
    const x = PAGE_MARGIN + index * (cardWidth + gap);
    drawRect(state.page, x, state.y, cardWidth, 140, theme.surface, theme.line, 1);
    state.page.drawText(card.title, {
      x: x + 12,
      y: state.y - 14,
      size: 7,
      font: boldFont,
      color: theme.softText
    });

    if (card.value) {
      state.page.drawText(card.title.startsWith("Technician") ? "Inspector sign-off" : "Customer sign-off", {
        x: x + 12,
        y: state.y - 28,
        size: 8,
        font: regularFont,
        color: theme.muted
      });
      state.page.drawText(withFallback(card.value.signerName, DEFAULT_EMPTY_COPY), {
        x: x + 12,
        y: state.y - 44,
        size: 9.5,
        font: regularFont,
        color: theme.ink
      });
      state.page.drawText(withFallback(formatDateTime(card.value.signedAt), DEFAULT_EMPTY_COPY), {
        x: x + 12,
        y: state.y - 58,
        size: 8,
        font: regularFont,
        color: theme.softText
      });
    } else {
      state.page.drawText(NO_SIGNATURE_COPY, {
        x: x + 12,
        y: state.y - 44,
        size: 10,
        font: regularFont,
        color: theme.softText
      });
    }
  });

  for (const [index, card] of cards.entries()) {
    if (!card.value) {
      continue;
    }
    const embeddedSignature = await embedImage(pdfDoc, card.value.imageDataUrl);
    if (!embeddedSignature) {
      continue;
    }
    const x = PAGE_MARGIN + index * (cardWidth + gap);
    const scaled = embeddedSignature.scale(1);
    const ratio = Math.min((cardWidth - 24) / scaled.width, 44 / scaled.height, 1);
    state.page.drawImage(embeddedSignature, {
      x: x + 12,
      y: state.y - 118,
      width: scaled.width * ratio,
      height: scaled.height * ratio
    });
  }

  state.y -= 156;
  return state;
}

export async function generateInspectionReportPdf(input: PdfInput) {
  const { generateInspectionReportPdfV2, supportsPdfV2 } = await import("./pdf-v2");
  if (supportsPdfV2(input.task.inspectionType)) {
    return generateInspectionReportPdfV2(input);
  }

  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const branding = resolveTenantBranding({ tenantName: input.tenant.name, branding: input.tenant.branding });
  const theme = buildTheme(branding.primaryColor, branding.accentColor);
  const logoEmbedded = branding.logoDataUrl ? await embedImage(pdfDoc, branding.logoDataUrl) : null;

  if (input.task.inspectionType === "work_order") {
    return renderWorkOrderReport(pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded);
  }

  const template = resolveReportTemplate({ inspectionType: input.task.inspectionType });
  const reportTypeConfig = resolveReportTypeConfig(input.task.inspectionType);
  const preview = buildReportPreview(input.draft);
  const orderedSections = getOrderedReportSections(reportTypeConfig.sections, template, input.draft);

  let state = addPage(pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 1);
  state = renderPageOne(
    state,
    pdfDoc,
    input,
    branding,
    reportTypeConfig.pageOne,
    orderedSections,
    preview,
    theme,
    boldFont,
    regularFont,
    logoEmbedded
  );

  for (const { sectionConfig, templateSection, draftSection } of orderedSections) {
    const scalarItems = getScalarSectionItems(templateSection, draftSection);
    const tableGroups = getSectionTableGroups(templateSection, draftSection);
    const followUp = extractFollowUpRequirements(templateSection, draftSection);

    state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 88);
    drawSectionTitle(state, sectionConfig.title, sectionConfig.description ?? templateSection.description, theme, boldFont, regularFont);
    drawBadge(
      state.page,
      PAGE_MARGIN + CONTENT_WIDTH - 104,
      state.y + 12,
      getDisplaySectionStatus(draftSection.status, input),
      theme,
      boldFont,
      statusVariant(draftSection.status)
    );

    if (sectionConfig.renderer === "checklist" && sectionConfig.checklist) {
      state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 140);
      state = renderChecklistSection(
        state,
        pdfDoc,
        input,
        branding,
        theme,
        boldFont,
        regularFont,
        logoEmbedded,
        sectionConfig.title,
        sectionConfig.checklist.items,
        draftSection.fields,
        sectionConfig.emptyState?.message ?? "No checklist results recorded"
      );
    } else if (scalarItems.length > 0) {
      state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 150);
      renderKeyValueGrid(state, scalarItems, theme, boldFont, regularFont, 2);
    }

    for (const group of tableGroups) {
      state = renderRepeaterTable(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, group.label, group.rows);
    }

    if (followUp.length > 0) {
      state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 90);
      renderFindingsBlock(state, "Follow-up requirements", followUp, "warn", theme, boldFont, regularFont);
    }

    if (cleanCustomerFacingText(draftSection.notes)) {
      state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 96);
      renderSectionNotes(state, draftSection.notes, theme, boldFont, regularFont);
    }
  }

  const findingsConfig = reportTypeConfig.sections.find((section) => section.renderer === "findings");
  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 150);
  drawSectionTitle(
    state,
    findingsConfig?.title ?? "Findings and Deficiencies",
    findingsConfig?.description ?? "Service findings, recorded deficiencies, and follow-up items captured during the visit.",
    theme,
    boldFont,
    regularFont
  );
  renderFindingsBlock(state, "Service findings", buildServiceFindingLines(preview), "neutral", theme, boldFont, regularFont);
  const manualDeficiencies = buildManualDeficiencyLines(input);
  renderFindingsBlock(
    state,
    "Deficiencies",
    manualDeficiencies.length > 0 ? manualDeficiencies : [findingsConfig?.emptyState?.message ?? customerFacingFieldRules.findingsFallback],
    manualDeficiencies.length > 0 ? "fail" : "neutral",
    theme,
    boldFont,
    regularFont
  );

  const overallNotes = input.draft.overallNotes || input.inspection.notes || "";
  const notesConfig = reportTypeConfig.sections.find((section) => section.renderer === "notes");
  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 96);
  drawSectionTitle(state, notesConfig?.title ?? "Notes", notesConfig?.description ?? "Technician summary and visit-level observations.", theme, boldFont, regularFont);
  renderSectionNotes(state, overallNotes || notesConfig?.emptyState?.message || customerFacingFieldRules.notesFallback, theme, boldFont, regularFont);

  if (reportTypeConfig.photos?.enabled !== false) {
    state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 140);
    drawSectionTitle(state, reportTypeConfig.photos?.title ?? "Photos", "Photo evidence attached to this inspection report.", theme, boldFont, regularFont);
    state = await renderPhotos(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded);
  }

  if (reportTypeConfig.signatures?.enabled !== false) {
    state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 170);
    drawSectionTitle(state, reportTypeConfig.signatures?.title ?? "Signatures", "Technician and customer sign-off captured at finalization.", theme, boldFont, regularFont);
    await renderSignatures(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded);
  }

  return pdfDoc.save();
}
