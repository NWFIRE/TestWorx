import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { InspectionType } from "@prisma/client";

import { resolveTenantBranding } from "./branding";
import { buildReportPreview, describeRepeaterValueLines, isFieldVisible, type ReportDraft } from "./report-engine";
import { getReportPdfMetadata, resolveReportTemplate, type ReportFieldDefinition, type ReportPrimitiveValue } from "./report-config";
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
  card: ReturnType<typeof rgb>;
  cardBorder: ReturnType<typeof rgb>;
  subtle: ReturnType<typeof rgb>;
  dangerBg: ReturnType<typeof rgb>;
  dangerBorder: ReturnType<typeof rgb>;
  dangerText: ReturnType<typeof rgb>;
  successBg: ReturnType<typeof rgb>;
  successText: ReturnType<typeof rgb>;
  warningBg: ReturnType<typeof rgb>;
  warningText: ReturnType<typeof rgb>;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const MIN_CONTENT_Y = 68;

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
    primary: hexToRgb(primaryHex ?? "#16324F", { r: 0.09, g: 0.2, b: 0.31 }),
    accent: hexToRgb(accentHex ?? "#C06A2C", { r: 0.75, g: 0.42, b: 0.17 }),
    ink: rgb(0.12, 0.16, 0.22),
    muted: rgb(0.28, 0.33, 0.39),
    softText: rgb(0.45, 0.5, 0.56),
    card: rgb(0.985, 0.989, 0.994),
    cardBorder: rgb(0.87, 0.9, 0.94),
    subtle: rgb(0.95, 0.965, 0.98),
    dangerBg: rgb(0.997, 0.955, 0.947),
    dangerBorder: rgb(0.93, 0.78, 0.75),
    dangerText: rgb(0.55, 0.18, 0.16),
    successBg: rgb(0.94, 0.98, 0.95),
    successText: rgb(0.13, 0.42, 0.25),
    warningBg: rgb(0.995, 0.968, 0.91),
    warningText: rgb(0.61, 0.39, 0.06)
  };
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "Not available";
  }

  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "Not available";
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

  if (!/[_-]/.test(trimmed) && !/^[a-z0-9 ]+$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed
    .replaceAll(/[_-]+/g, " ")
    .split(/\s+/)
    .map((token) => token ? `${token.slice(0, 1).toUpperCase()}${token.slice(1)}` : token)
    .join(" ");
}

function formatFieldValue(value: ReportPrimitiveValue | undefined) {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (value === null || value === undefined || value === "") {
    return "Not recorded";
  }

  if (typeof value === "string" && (value.startsWith("blob:") || value.startsWith("data:image/"))) {
    return "Photo attached";
  }

  if (typeof value === "string") {
    return humanizeText(value);
  }

  return String(value);
}

function splitTextIntoLines(font: PDFFont, text: string, maxWidth: number, size: number) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function measureParagraphHeight(font: PDFFont, text: string, maxWidth: number, size: number, lineGap = 3) {
  return splitTextIntoLines(font, text, maxWidth, size).length * (size + lineGap);
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
  const lines = splitTextIntoLines(font, text, maxWidth, size);
  lines.forEach((line, index) => {
    page.drawText(line, { x, y: y - index * (size + lineGap), size, font, color });
  });
  return y - lines.length * (size + lineGap);
}

function drawCard(page: PDFPage, x: number, yTop: number, width: number, height: number, theme: PdfTheme, fill = theme.card) {
  page.drawRectangle({
    x,
    y: yTop - height,
    width,
    height,
    color: fill,
    borderColor: theme.cardBorder,
    borderWidth: 1
  });
}

function drawStatusPill(page: PDFPage, x: number, yTop: number, label: string, theme: PdfTheme, boldFont: PDFFont, variant: "success" | "warning" | "danger" | "neutral" = "neutral") {
  const normalized = variant === "success"
    ? { bg: theme.successBg, text: theme.successText }
    : variant === "warning"
      ? { bg: theme.warningBg, text: theme.warningText }
      : variant === "danger"
        ? { bg: theme.dangerBg, text: theme.dangerText }
        : { bg: theme.subtle, text: theme.primary };
  const width = Math.max(72, boldFont.widthOfTextAtSize(label, 8) + 22);
  page.drawRectangle({ x, y: yTop - 18, width, height: 18, color: normalized.bg, borderColor: normalized.bg, borderWidth: 1 });
  page.drawText(label, { x: x + 11, y: yTop - 11.5, size: 8, font: boldFont, color: normalized.text });
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
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 116, width: PAGE_WIDTH, height: 116, color: theme.primary });
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 124, width: PAGE_WIDTH, height: 8, color: theme.accent });

  if (logoEmbedded) {
    page.drawImage(logoEmbedded, { x: PAGE_MARGIN, y: PAGE_HEIGHT - 88, width: 46, height: 46 });
  } else {
    page.drawRectangle({
      x: PAGE_MARGIN,
      y: PAGE_HEIGHT - 88,
      width: 46,
      height: 46,
      color: rgb(1, 1, 1),
      opacity: 0.16,
      borderColor: rgb(1, 1, 1),
      borderWidth: 1
    });
    page.drawText(input.tenant.name.split(/\s+/).map((part) => part[0] ?? "").slice(0, 2).join("").toUpperCase(), {
      x: PAGE_MARGIN + 10,
      y: PAGE_HEIGHT - 70,
      size: 18,
      font: boldFont,
      color: rgb(1, 1, 1)
    });
  }

  page.drawText(branding.legalBusinessName || input.tenant.name, {
    x: PAGE_MARGIN + 60,
    y: PAGE_HEIGHT - 56,
    size: 20,
    font: boldFont,
    color: rgb(1, 1, 1)
  });
  page.drawText("Inspection documentation", {
    x: PAGE_MARGIN + 60,
    y: PAGE_HEIGHT - 77,
    size: 10,
    font: regularFont,
    color: rgb(0.92, 0.95, 0.98)
  });

  const contactLine = [
    branding.phone,
    branding.email,
    branding.website
  ].filter(Boolean).join("  |  ");
  if (contactLine) {
    page.drawText(contactLine, {
      x: PAGE_MARGIN,
      y: PAGE_HEIGHT - 108,
      size: 8,
      font: regularFont,
      color: rgb(0.87, 0.91, 0.96)
    });
  }

  page.drawText(`Page ${pageNumber}`, {
    x: PAGE_WIDTH - PAGE_MARGIN - 34,
    y: 24,
    size: 8,
    font: regularFont,
    color: theme.softText
  });
  page.drawText(`Report ${input.report.id}`, {
    x: PAGE_MARGIN,
    y: 24,
    size: 8,
    font: regularFont,
    color: theme.softText
  });
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

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const nextPageNumber = state.pageNumber + 1;
  renderPageChrome(page, input, branding, theme, boldFont, regularFont, logoEmbedded, nextPageNumber);
  return { page, y: PAGE_HEIGHT - 146, pageNumber: nextPageNumber };
}

function drawSectionHeading(state: PageState, label: string, theme: PdfTheme, boldFont: PDFFont, regularFont: PDFFont, subtitle?: string) {
  state.page.drawText(label, { x: PAGE_MARGIN, y: state.y, size: 15, font: boldFont, color: theme.ink });
  if (subtitle) {
    state.y = drawParagraph(state.page, regularFont, subtitle, PAGE_MARGIN, state.y - 16, CONTENT_WIDTH, 9, theme.softText) - 8;
    return;
  }
  state.y -= 22;
}

function statusVariant(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "pass" || status === "completed") {
    return "success";
  }
  if (status === "attention" || status === "in_progress") {
    return "warning";
  }
  if (status === "fail" || status === "deficiencies_found" || status === "cancelled") {
    return "danger";
  }
  return "neutral";
}

function renderSummaryGrid(
  state: PageState,
  rows: Array<{ label: string; value: string }>,
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  const columns = 2;
  const cardWidth = (CONTENT_WIDTH - 14) / columns;
  const rowHeight = 52;
  const totalRows = Math.ceil(rows.length / columns);
  const totalHeight = totalRows * (rowHeight + 10);
  drawCard(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, totalHeight + 8, theme, rgb(1, 1, 1));

  rows.forEach((row, index) => {
    const column = index % columns;
    const rowIndex = Math.floor(index / columns);
    const x = PAGE_MARGIN + 14 + column * (cardWidth + 14);
    const y = state.y - 14 - rowIndex * (rowHeight + 10);
    state.page.drawRectangle({ x, y: y - rowHeight, width: cardWidth, height: rowHeight, color: theme.card, borderColor: theme.cardBorder, borderWidth: 1 });
    state.page.drawText(row.label, { x: x + 12, y: y - 16, size: 8, font: boldFont, color: theme.primary });
    drawParagraph(state.page, regularFont, row.value, x + 12, y - 30, cardWidth - 24, 10, theme.ink, 2);
  });

  state.y -= totalHeight + 18;
}

function renderReferencesBlock(
  state: PageState,
  references: string[],
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  const detail = references.length > 0 ? references.join("  •  ") : "No NFPA references have been configured for this report type.";
  const detailHeight = measureParagraphHeight(regularFont, detail, CONTENT_WIDTH - 28, 10, 3);
  const cardHeight = 44 + detailHeight;
  drawCard(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, cardHeight, theme, rgb(1, 1, 1));
  state.page.drawText("Applicable Codes and Standards", { x: PAGE_MARGIN + 14, y: state.y - 18, size: 11, font: boldFont, color: theme.primary });
  state.y = drawParagraph(state.page, regularFont, detail, PAGE_MARGIN + 14, state.y - 34, CONTENT_WIDTH - 28, 10, theme.ink) - 18;
}

function getSectionLines(
  field: ReportFieldDefinition,
  sectionFields: Record<string, unknown>
) {
  if (field.type === "repeater") {
    return describeRepeaterValueLines(field, sectionFields[field.id]).map((line) => ({
      text: line.trimStart(),
      indent: line.startsWith("  ") ? 1 : 0,
      emphasize: !line.startsWith("  ")
    }));
  }

  return [{
    text: `${field.label}: ${formatFieldValue(sectionFields[field.id] as ReportPrimitiveValue | undefined)}`,
    indent: 0,
    emphasize: false
  }];
}

function measureSectionCardHeight(
  sectionTemplate: ReturnType<typeof resolveReportTemplate>["sections"][number],
  section: ReportDraft["sections"][string],
  regularFont: PDFFont,
  boldFont: PDFFont
) {
  const lineItems = sectionTemplate.fields
    .filter((field) => isFieldVisible(field, section.fields))
    .flatMap((field) => getSectionLines(field, section.fields));

  let height = 62;
  for (const item of lineItems) {
    const font = item.emphasize ? boldFont : regularFont;
    const width = CONTENT_WIDTH - 64 - item.indent * 18;
    height += measureParagraphHeight(font, item.text, width, item.emphasize ? 9.5 : 9, 2) + 3;
  }

  if (section.notes) {
    height += 18 + measureParagraphHeight(regularFont, section.notes, CONTENT_WIDTH - 64, 9, 3);
  }

  return Math.max(90, height);
}

function renderSectionCard(
  state: PageState,
  sectionTemplate: ReturnType<typeof resolveReportTemplate>["sections"][number],
  section: ReportDraft["sections"][string],
  theme: PdfTheme,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  const height = measureSectionCardHeight(sectionTemplate, section, regularFont, boldFont);
  drawCard(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, height, theme, rgb(1, 1, 1));
  state.page.drawText(sectionTemplate.label, { x: PAGE_MARGIN + 14, y: state.y - 18, size: 12, font: boldFont, color: theme.ink });
  drawStatusPill(state.page, PAGE_MARGIN + CONTENT_WIDTH - 92, state.y - 6, humanizeText(section.status), theme, boldFont, statusVariant(section.status));

  let y = state.y - 38;
  if (sectionTemplate.description) {
    y = drawParagraph(state.page, regularFont, sectionTemplate.description, PAGE_MARGIN + 14, y, CONTENT_WIDTH - 28, 8.5, theme.softText) - 8;
  }

  const lineItems = sectionTemplate.fields
    .filter((field) => isFieldVisible(field, section.fields))
    .flatMap((field) => getSectionLines(field, section.fields));

  for (const item of lineItems) {
    const font = item.emphasize ? boldFont : regularFont;
    const size = item.emphasize ? 9.5 : 9;
    const x = PAGE_MARGIN + 14 + item.indent * 18;
    const width = CONTENT_WIDTH - 28 - item.indent * 18;
    y = drawParagraph(state.page, font, item.text, x, y, width, size, item.emphasize ? theme.ink : theme.muted, 2) - 4;
  }

  if (section.notes) {
    state.page.drawRectangle({
      x: PAGE_MARGIN + 14,
      y: y - 34,
      width: CONTENT_WIDTH - 28,
      height: 30 + measureParagraphHeight(regularFont, section.notes, CONTENT_WIDTH - 52, 8.5, 3),
      color: theme.subtle,
      borderColor: theme.cardBorder,
      borderWidth: 1
    });
    state.page.drawText("Section notes", { x: PAGE_MARGIN + 24, y: y - 12, size: 8.5, font: boldFont, color: theme.primary });
    drawParagraph(state.page, regularFont, section.notes, PAGE_MARGIN + 24, y - 26, CONTENT_WIDTH - 52, 8.5, theme.muted);
  }

  state.y -= height + 14;
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

  const firstPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  renderPageChrome(firstPage, input, branding, theme, boldFont, regularFont, logoEmbedded, 1);
  let state: PageState = { page: firstPage, y: PAGE_HEIGHT - 146, pageNumber: 1 };

  const reportStatusLabel = preview.inspectionStatus === "deficiencies_found" ? "Deficiencies Found" : "Pass";
  drawCard(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, 90, theme, rgb(1, 1, 1));
  state.page.drawText(template.label, { x: PAGE_MARGIN + 16, y: state.y - 24, size: 20, font: boldFont, color: theme.ink });
  if (pdfMetadata.subtitle) {
    state.page.drawText(pdfMetadata.subtitle, { x: PAGE_MARGIN + 16, y: state.y - 44, size: 10, font: regularFont, color: theme.softText });
  }
  drawStatusPill(state.page, PAGE_MARGIN + CONTENT_WIDTH - 112, state.y - 12, reportStatusLabel, theme, boldFont, statusVariant(preview.inspectionStatus));
  state.page.drawText(`Report ID ${input.report.id}`, { x: PAGE_MARGIN + 16, y: state.y - 64, size: 9, font: regularFont, color: theme.muted });
  state.page.drawText(`Inspection ${input.inspection.id}`, { x: PAGE_MARGIN + 150, y: state.y - 64, size: 9, font: regularFont, color: theme.muted });
  state.y -= 108;

  drawSectionHeading(state, "Summary", theme, boldFont, regularFont, "Key inspection details for customer, site, schedule, technician, and final outcome.");
  renderSummaryGrid(state, [
    { label: "Customer", value: input.customerCompany.name },
    { label: "Site", value: input.site.name },
    { label: "Inspection Date", value: formatDate(input.inspection.scheduledStart) },
    { label: "Technician", value: input.report.technicianName ?? "Not recorded" },
    { label: "Completion", value: input.report.finalizedAt ? formatDateTime(input.report.finalizedAt) : "Not finalized" },
    { label: "Deficiencies", value: `${preview.deficiencyCount + preview.manualDeficiencyCount}` },
    { label: "Progress", value: `${Math.round(preview.reportCompletion * 100)}% complete` },
    { label: "Site Address", value: [input.site.addressLine1, input.site.addressLine2, [input.site.city, input.site.state, input.site.postalCode].filter(Boolean).join(", ")].filter(Boolean).join(", ") }
  ], theme, boldFont, regularFont);

  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 110);
  drawSectionHeading(state, "Applicable Codes and Standards", theme, boldFont, regularFont, "Configured NFPA references associated with this report type.");
  renderReferencesBlock(state, pdfMetadata.nfpaReferences ?? [], theme, boldFont, regularFont);

  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 140);
  drawSectionHeading(state, "Inspection Overview", theme, boldFont, regularFont, "Visit details, current inspection status, and prior-report context.");
  drawCard(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, 98, theme, rgb(1, 1, 1));
  const overviewLines = [
    `Inspection status: ${humanizeText(input.inspection.status)}`,
    `Scheduled start: ${formatDateTime(input.inspection.scheduledStart)}`,
    `Scheduled end: ${input.inspection.scheduledEnd ? formatDateTime(input.inspection.scheduledEnd) : "Not recorded"}`,
    `Customer contact: ${input.customerCompany.contactName ?? "Not recorded"}`,
    `Billing contact: ${input.customerCompany.billingEmail ?? input.customerCompany.phone ?? "Not recorded"}`,
    `Prior report summary: ${input.draft.context.priorReportSummary || "No prior finalized summary recorded."}`
  ];
  let overviewY = state.y - 18;
  for (const line of overviewLines) {
    overviewY = drawParagraph(state.page, regularFont, line, PAGE_MARGIN + 14, overviewY, CONTENT_WIDTH - 28, 9.5, theme.muted, 2) - 3;
  }
  state.y -= 114;

  drawSectionHeading(state, "Report Sections", theme, boldFont, regularFont, "Structured findings organized by the active smart-report template.");
  for (const sectionId of input.draft.sectionOrder) {
    const sectionTemplate = template.sections.find((section) => section.id === sectionId);
    const section = input.draft.sections[sectionId];
    if (!section || !sectionTemplate) {
      continue;
    }

    const estimatedHeight = measureSectionCardHeight(sectionTemplate, section, regularFont, boldFont) + 12;
    state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, estimatedHeight);
    renderSectionCard(state, sectionTemplate, section, theme, boldFont, regularFont);
  }

  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 110);
  drawSectionHeading(state, "Overall Notes", theme, boldFont, regularFont, "Technician summary and general service observations.");
  const notesText = input.draft.overallNotes || input.inspection.notes || "No overall notes recorded.";
  const notesHeight = 34 + measureParagraphHeight(regularFont, notesText, CONTENT_WIDTH - 28, 10, 3);
  drawCard(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, notesHeight, theme, rgb(1, 1, 1));
  state.y = drawParagraph(state.page, regularFont, notesText, PAGE_MARGIN + 14, state.y - 18, CONTENT_WIDTH - 28, 10, theme.muted) - 18;

  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 120);
  drawSectionHeading(state, "Findings and Deficiencies", theme, boldFont, regularFont, "Items requiring follow-up or captured as deficiencies during the visit.");
  if (input.deficiencies.length === 0) {
    drawCard(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, 52, theme, rgb(1, 1, 1));
    state.page.drawText("No deficiencies recorded for this report.", { x: PAGE_MARGIN + 14, y: state.y - 24, size: 10, font: regularFont, color: theme.muted });
    state.y -= 66;
  } else {
    for (const deficiency of input.deficiencies) {
      const descriptionHeight = measureParagraphHeight(regularFont, deficiency.description, CONTENT_WIDTH - 42, 9, 3);
      const noteText = deficiency.notes ? `Notes: ${deficiency.notes}` : "";
      const noteHeight = noteText ? measureParagraphHeight(regularFont, noteText, CONTENT_WIDTH - 42, 8.5, 3) + 6 : 0;
      const metaLines = [deficiency.deviceType, deficiency.location].filter(Boolean).length;
      const height = 58 + descriptionHeight + noteHeight + metaLines * 12;
      state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, height + 10);
      drawCard(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, height, theme, theme.dangerBg);
      state.page.drawRectangle({ x: PAGE_MARGIN, y: state.y - height, width: 6, height, color: theme.dangerBorder });
      state.page.drawText(deficiency.title, { x: PAGE_MARGIN + 16, y: state.y - 18, size: 11, font: boldFont, color: theme.dangerText });
      drawStatusPill(state.page, PAGE_MARGIN + CONTENT_WIDTH - 110, state.y - 8, `${humanizeText(deficiency.severity)} • ${humanizeText(deficiency.status)}`, theme, boldFont, "danger");
      let y = drawParagraph(state.page, regularFont, deficiency.description, PAGE_MARGIN + 16, state.y - 38, CONTENT_WIDTH - 42, 9, theme.dangerText) - 4;
      if (deficiency.deviceType) {
        state.page.drawText(`Device: ${deficiency.deviceType}`, { x: PAGE_MARGIN + 16, y, size: 8.5, font: regularFont, color: theme.dangerText });
        y -= 12;
      }
      if (deficiency.location) {
        state.page.drawText(`Location: ${deficiency.location}`, { x: PAGE_MARGIN + 16, y, size: 8.5, font: regularFont, color: theme.dangerText });
        y -= 12;
      }
      if (noteText) {
        drawParagraph(state.page, regularFont, noteText, PAGE_MARGIN + 16, y, CONTENT_WIDTH - 42, 8.5, theme.dangerText);
      }
      state.y -= height + 12;
    }
  }

  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 120);
  drawSectionHeading(state, "Photo Evidence", theme, boldFont, regularFont, "Uploaded photos captured with this inspection report.");
  if (input.photos.length === 0) {
    drawCard(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, 52, theme, rgb(1, 1, 1));
    state.page.drawText("No photo evidence attached.", { x: PAGE_MARGIN + 14, y: state.y - 24, size: 10, font: regularFont, color: theme.muted });
    state.y -= 66;
  } else {
    for (const photo of input.photos) {
      const embeddedPhoto = await embedImage(pdfDoc, photo.storageKey);
      if (!embeddedPhoto) {
        continue;
      }

      const scaled = embeddedPhoto.scale(1);
      const scale = Math.min(220 / scaled.width, 150 / scaled.height, 1);
      const width = scaled.width * scale;
      const height = scaled.height * scale;
      const cardHeight = Math.max(84, height + 28);
      state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, cardHeight + 8);
      drawCard(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, cardHeight, theme, rgb(1, 1, 1));
      state.page.drawImage(embeddedPhoto, { x: PAGE_MARGIN + 14, y: state.y - 16 - height, width, height });
      state.page.drawText(photo.fileName, { x: PAGE_MARGIN + width + 28, y: state.y - 20, size: 10, font: boldFont, color: theme.ink });
      state.page.drawText("Attached inspection photo", { x: PAGE_MARGIN + width + 28, y: state.y - 38, size: 8.5, font: regularFont, color: theme.softText });
      state.y -= cardHeight + 10;
    }
  }

  state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 160);
  drawSectionHeading(state, "Signatures", theme, boldFont, regularFont, "Technician and customer sign-off captured at finalization.");
  const signatures = [
    { label: "Technician Signature", value: input.technicianSignature },
    { label: "Customer Signature", value: input.customerSignature }
  ];

  for (const signature of signatures) {
    state = ensureSpace(state, pdfDoc, input, branding, theme, boldFont, regularFont, logoEmbedded, 126);
    drawCard(state.page, PAGE_MARGIN, state.y, CONTENT_WIDTH, 112, theme, rgb(1, 1, 1));
    state.page.drawText(signature.label, { x: PAGE_MARGIN + 14, y: state.y - 18, size: 11, font: boldFont, color: theme.ink });
    if (signature.value) {
      state.page.drawText(signature.value.signerName, { x: PAGE_MARGIN + 14, y: state.y - 36, size: 9.5, font: regularFont, color: theme.muted });
      state.page.drawText(formatDateTime(signature.value.signedAt), { x: PAGE_MARGIN + 14, y: state.y - 50, size: 8.5, font: regularFont, color: theme.softText });
      const embeddedSignature = await embedImage(pdfDoc, signature.value.imageDataUrl);
      if (embeddedSignature) {
        const dimensions = embeddedSignature.scale(1);
        const scale = Math.min(170 / dimensions.width, 44 / dimensions.height, 1);
        state.page.drawImage(embeddedSignature, {
          x: PAGE_MARGIN + 14,
          y: state.y - 96,
          width: dimensions.width * scale,
          height: dimensions.height * scale
        });
      }
    } else {
      state.page.drawText("Not captured", { x: PAGE_MARGIN + 14, y: state.y - 40, size: 10, font: regularFont, color: theme.softText });
    }
    state.y -= 126;
  }

  return pdfDoc.save();
}
