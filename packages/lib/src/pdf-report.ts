import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { InspectionType } from "@testworx/types";

import { resolveTenantBranding } from "./branding";
import {
  buildReportPreview,
  isCustomerVisibleField,
  type ReportDraft
} from "./report-engine";
import {
  getReportPdfMetadata,
  resolveReportTemplate,
  type ReportFieldDefinition,
  type ReportPrimitiveValue
} from "./report-config";
import { decodeStoredFile } from "./storage";

type PdfInput = {
  tenant: { name: string; branding: unknown };
  customerCompany: { name: string; contactName: string | null; billingEmail: string | null; phone: string | null };
  site: { name: string; addressLine1: string; addressLine2: string | null; city: string; state: string; postalCode: string };
  inspection: { id: string; scheduledStart: Date; scheduledEnd: Date | null; status: string; notes: string | null };
  task: { inspectionType: InspectionType };
  report: { id: string; finalizedAt: Date | null; technicianName: string | null };
  draft: ReportDraft;
  deficiencies: Array<{ title: string; description: string; severity: string; status: string; deviceType?: string | null; location?: string | null; notes?: string | null }>;
  photos: Array<{ fileName: string; storageKey: string }>;
  technicianSignature: { signerName: string; imageDataUrl: string; signedAt: Date | string } | null;
  customerSignature: { signerName: string; imageDataUrl: string; signedAt: Date | string } | null;
};

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

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const HEADER_HEIGHT = 96;
const FOOTER_HEIGHT = 30;
const BODY_TOP = PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT - 18;
const MIN_CONTENT_Y = PAGE_MARGIN + FOOTER_HEIGHT + 12;

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

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);
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
    return "—";
  }

  if (typeof value === "string" && (value.startsWith("blob:") || value.startsWith("data:image/"))) {
    return "Attached";
  }

  if (typeof value === "string") {
    return humanizeText(value);
  }

  return String(value);
}

function isMeaningful(value: string | null | undefined) {
  return Boolean(value && value.trim() && value.trim() !== "—");
}

function splitTextIntoLines(font: PDFFont, text: string, maxWidth: number, size: number, maxLines?: number) {
  const normalized = text.trim() || "—";
  const paragraphs = normalized.split(/\n+/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("—");
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

  return lines.length > 0 ? lines : ["—"];
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
  return lines.length * (size + lineGap);
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
  const metadata = getReportPdfMetadata(input.task.inspectionType);
  return metadata.subtitle || `${humanizeText(input.task.inspectionType)} Inspection Report`;
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
  renderPageChrome(page, input, branding, theme, boldFont, regularFont, logoEmbedded, pageNumber);
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
  state.page.drawText(title, {
    x: PAGE_MARGIN,
    y: state.y,
    size: 13,
    font: boldFont,
    color: theme.ink
  });

  let nextY = state.y - 16;
  if (subtitle) {
    nextY = drawParagraph(state.page, regularFont, subtitle, PAGE_MARGIN, nextY, CONTENT_WIDTH, 8.5, theme.softText, 3) - 6;
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

function renderKpiStrip(
  state: PageState,
  preview: ReturnType<typeof buildReportPreview>,
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  const gap = 10;
  const cardWidth = (CONTENT_WIDTH - gap * 2) / 3;
  const cardHeight = 68;
  const deficiencyTotal = preview.deficiencyCount + preview.manualDeficiencyCount;
  const kpis = [
    {
      label: "Result",
      value: deficiencyTotal > 0 ? "FAIL" : "PASS",
      tone: deficiencyTotal > 0 ? "fail" as const : "pass" as const
    },
    {
      label: "Deficiencies",
      value: String(deficiencyTotal),
      tone: deficiencyTotal > 0 ? "fail" as const : "neutral" as const
    },
    {
      label: "Completion",
      value: `${Math.round(preview.reportCompletion * 100)}%`,
      tone: preview.reportCompletion >= 1 ? "pass" as const : "warn" as const
    }
  ];

  kpis.forEach((kpi, index) => {
    const x = PAGE_MARGIN + index * (cardWidth + gap);
    const toneBg = kpi.tone === "pass"
      ? theme.passBg
      : kpi.tone === "fail"
        ? theme.failBg
        : kpi.tone === "warn"
          ? theme.warnBg
          : theme.surface;
    const toneText = kpi.tone === "pass"
      ? theme.passText
      : kpi.tone === "fail"
        ? theme.failText
        : kpi.tone === "warn"
          ? theme.warnText
          : theme.primary;
    drawRect(state.page, x, state.y, cardWidth, cardHeight, toneBg, theme.line, 1);
    state.page.drawText(kpi.label.toUpperCase(), {
      x: x + cardWidth / 2 - boldFont.widthOfTextAtSize(kpi.label.toUpperCase(), 7) / 2,
      y: state.y - 16,
      size: 7,
      font: boldFont,
      color: theme.softText
    });
    state.page.drawText(kpi.value, {
      x: x + cardWidth / 2 - boldFont.widthOfTextAtSize(kpi.value, kpi.label === "Result" ? 22 : 20) / 2,
      y: state.y - 44,
      size: kpi.label === "Result" ? 22 : 20,
      font: boldFont,
      color: toneText
    });
  });

  state.y -= cardHeight + 18;
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
  const rows = filtered.length > 0 ? filtered : [{ label: "Details", value: "—" }];
  const gap = 12;
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

  return "—";
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
    .filter((value) => !value.endsWith(": —"))
    .slice(0, 4);

  if (priority.length > 0) {
    return priority.join(" • ");
  }

  const fallback = rowFields
    .map((field) => `${field.label}: ${normalizeDisplayValue(row[field.id] as ReportPrimitiveValue | undefined)}`)
    .filter((value) => !value.endsWith(": —"))
    .slice(0, 3);

  return fallback.length > 0 ? fallback.join(" • ") : "—";
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
    const height = 16 + measureParagraphHeight(regularFont, row[column.key] ?? "—", width - 16, 8.5, 2, 3);
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
    drawParagraph(state.page, regularFont, row[column.key] ?? "—", x + 8, state.y - 12, width - 16, 8.5, theme.ink, 2, 3);
    x += width;
  }
  state.y -= rowHeight;
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

  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 54);
  state.page.drawText(title, {
    x: PAGE_MARGIN,
    y: state.y,
    size: 10.5,
    font: boldFont,
    color: theme.ink
  });
  state.y -= 16;

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
  const height = 28 + measureParagraphHeight(regularFont, notes, CONTENT_WIDTH - 24, 9, 3, 4);
  drawRect(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, height, theme.softSurface, theme.line, 1);
  state.page.drawText("Section notes".toUpperCase(), {
    x: PAGE_MARGIN + 10,
    y: state.y - 14,
    size: 7,
    font: boldFont,
    color: theme.softText
  });
  drawParagraph(state.page, regularFont, notes, PAGE_MARGIN + 10, state.y - 28, CONTENT_WIDTH - 20, 9, theme.ink, 3, 4);
  state.y -= height + 14;
}

function renderInspectionOverview(
  state: PageState,
  input: PdfInput,
  pdfMetadata: ReturnType<typeof getReportPdfMetadata>,
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  renderKeyValueGrid(state, [
    { label: "Customer", value: input.customerCompany.name },
    { label: "Site", value: input.site.name },
    { label: "Inspection date", value: formatDate(input.inspection.scheduledStart) },
    { label: "Completion", value: input.report.finalizedAt ? formatDateTime(input.report.finalizedAt) : "—" },
    { label: "Technician", value: input.report.technicianName ?? "—" },
    { label: "Applicable codes", value: (pdfMetadata.nfpaReferences ?? []).join(" • ") || "—" }
  ], theme, boldFont, regularFont, 2);
}

function renderSummaryContext(
  state: PageState,
  input: PdfInput,
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  renderKeyValueGrid(state, [
    { label: "Inspection status", value: humanizeText(input.inspection.status) },
    { label: "Scheduled window", value: input.inspection.scheduledEnd ? `${formatDateTime(input.inspection.scheduledStart)} — ${formatDateTime(input.inspection.scheduledEnd)}` : formatDateTime(input.inspection.scheduledStart) },
    { label: "Customer contact", value: input.customerCompany.contactName ?? "—" },
    { label: "Billing contact", value: input.customerCompany.billingEmail ?? input.customerCompany.phone ?? "—" },
    { label: "Site address", value: [input.site.addressLine1, input.site.addressLine2, [input.site.city, input.site.state, input.site.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—" },
    { label: "Prior inspection context", value: input.draft.context.priorReportSummary || "—" }
  ], theme, boldFont, regularFont, 2);
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
    state.page.drawText(title === "Deficiencies" ? "No deficiencies recorded" : "—", {
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
    state.page.drawText("No photos attached", {
      x: PAGE_MARGIN + 12,
      y: state.y - 24,
      size: 10,
      font: regularFont,
      color: theme.softText
    });
    state.y -= 66;
    return state;
  }

  const cardGap = 12;
  const cardWidth = (CONTENT_WIDTH - cardGap) / 2;
  let column = 0;
  let rowTop = state.y;
  let rowHeight = 0;

  for (const photo of input.photos) {
    const embeddedPhoto = await embedImage(pdfDoc, photo.storageKey);
    if (!embeddedPhoto) {
      continue;
    }

    const scaled = embeddedPhoto.scale(1);
    const ratio = Math.min((cardWidth - 20) / scaled.width, 120 / scaled.height, 1);
    const width = scaled.width * ratio;
    const height = scaled.height * ratio;
    const cardHeight = 150;

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
    drawParagraph(state.page, boldFont, photo.fileName, x + 10, rowTop - 132, cardWidth - 20, 8.5, theme.ink, 2, 2);

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
  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 160);
  const gap = 12;
  const cardWidth = (CONTENT_WIDTH - gap) / 2;
  const cards = [
    { title: "Technician", value: input.technicianSignature },
    { title: "Customer", value: input.customerSignature }
  ];

  cards.forEach((card, index) => {
    const x = PAGE_MARGIN + index * (cardWidth + gap);
    drawRect(state.page, x, state.y, cardWidth, 132, theme.surface, theme.line, 1);
    state.page.drawText(card.title, {
      x: x + 12,
      y: state.y - 16,
      size: 10.5,
      font: boldFont,
      color: theme.ink
    });

    if (card.value) {
      state.page.drawText(card.value.signerName, {
        x: x + 12,
        y: state.y - 34,
        size: 9.5,
        font: regularFont,
        color: theme.ink
      });
      state.page.drawText(formatDateTime(card.value.signedAt), {
        x: x + 12,
        y: state.y - 48,
        size: 8,
        font: regularFont,
        color: theme.softText
      });
    } else {
      state.page.drawText("—", {
        x: x + 12,
        y: state.y - 36,
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
      y: state.y - 112,
      width: scaled.width * ratio,
      height: scaled.height * ratio
    });
  }

  state.y -= 148;
  return state;
}

export async function generateInspectionReportPdf(input: PdfInput) {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const branding = resolveTenantBranding({ tenantName: input.tenant.name, branding: input.tenant.branding });
  const theme = buildTheme(branding.primaryColor, branding.accentColor);
  const template = resolveReportTemplate({ inspectionType: input.task.inspectionType });
  const pdfMetadata = getReportPdfMetadata(input.task.inspectionType);
  const preview = buildReportPreview(input.draft);
  const logoEmbedded = branding.logoDataUrl ? await embedImage(pdfDoc, branding.logoDataUrl) : null;

  let state = addPage(pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 1);

  renderKpiStrip(state, preview, theme, boldFont, regularFont);

  drawSectionTitle(state, "Summary", "Client, site, technician, and code context for this inspection.", theme, boldFont, regularFont);
  renderInspectionOverview(state, input, pdfMetadata, theme, boldFont, regularFont);

  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 180);
  drawSectionTitle(state, "Inspection Overview", "Visit timing, account context, and prior-report carry-forward details.", theme, boldFont, regularFont);
  renderSummaryContext(state, input, theme, boldFont, regularFont);

  for (const sectionId of input.draft.sectionOrder) {
    const sectionTemplate = template.sections.find((section) => section.id === sectionId);
    const section = input.draft.sections[sectionId];
    if (!section || !sectionTemplate) {
      continue;
    }

    const scalarItems = getScalarSectionItems(sectionTemplate, section);
    const tableGroups = getSectionTableGroups(sectionTemplate, section);
    const followUp = extractFollowUpRequirements(sectionTemplate, section);

    state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 88);
    drawSectionTitle(state, sectionTemplate.label, sectionTemplate.description, theme, boldFont, regularFont);
    drawBadge(state.page, PAGE_MARGIN + CONTENT_WIDTH - 92, state.y + 12, humanizeText(section.status), theme, boldFont, statusVariant(section.status));

    if (scalarItems.length > 0) {
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

    if (section.notes.trim()) {
      state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 96);
      renderSectionNotes(state, section.notes, theme, boldFont, regularFont);
    }
  }

  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 150);
  drawSectionTitle(state, "Findings and Deficiencies", "Service findings, recorded deficiencies, and follow-up items captured during the visit.", theme, boldFont, regularFont);
  renderFindingsBlock(state, "Service findings", buildServiceFindingLines(preview), "neutral", theme, boldFont, regularFont);
  const manualDeficiencies = buildManualDeficiencyLines(input);
  renderFindingsBlock(state, "Deficiencies", manualDeficiencies, manualDeficiencies.length > 0 ? "fail" : "neutral", theme, boldFont, regularFont);

  const overallNotes = input.draft.overallNotes || input.inspection.notes || "";
  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 96);
  drawSectionTitle(state, "Notes", "Technician summary and visit-level observations.", theme, boldFont, regularFont);
  renderSectionNotes(state, overallNotes || "—", theme, boldFont, regularFont);

  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 140);
  drawSectionTitle(state, "Photos", "Photo evidence attached to this inspection report.", theme, boldFont, regularFont);
  state = await renderPhotos(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded);

  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 170);
  drawSectionTitle(state, "Signatures", "Technician and customer sign-off captured at finalization.", theme, boldFont, regularFont);
  await renderSignatures(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded);

  return pdfDoc.save();
}
