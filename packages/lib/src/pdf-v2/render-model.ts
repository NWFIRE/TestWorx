import { resolveTenantBranding } from "../branding";
import { buildReportPreview } from "../report-engine";
import type { ReportPrimitiveValue } from "../report-config";
import { getCustomerFacingSiteLabel } from "../scheduling";
import { buildIndicatorLines } from "./indicators";
import {
  buildPhotoCaption,
  cleanCustomerFacingText,
  customerFacingFieldRules,
  formatDate,
  formatDateTime,
  formatFieldValue,
  formatPdfAddress,
  humanizeText,
  joinPresentValues
} from "./formatters";
import { resolveReportTypeConfigV2 } from "./registry";
import { getCustomerFacingOutcomeLabel, mapCustomerFacingReportStatus } from "./status";
import type {
  PdfInput,
  RenderKeyValueRow,
  RenderChecklistItem,
  RenderMetricCard,
  RenderSection,
  RenderTableCell,
  RenderTableColumn,
  RenderTableRow,
  ReportRenderModelV2,
  ReportSectionConfig,
  ReportTypeConfig,
  SummaryFactKey,
  SummaryMetricKey
} from "./types";

function toCell(text: string, lines?: string[]): RenderTableCell {
  return { text, lines };
}

function mapSummaryFact(input: PdfInput, factKey: SummaryFactKey): RenderKeyValueRow {
  const customerFacingSiteName = getCustomerFacingSiteLabel(input.site.name) || input.site.name;
  const siteAddress = formatPdfAddress({
    addressLine1: input.site.addressLine1,
    addressLine2: input.site.addressLine2,
    city: input.site.city,
    state: input.site.state,
    postalCode: input.site.postalCode,
    fallback: customerFacingFieldRules.addressFallback
  });
  const status = mapCustomerFacingReportStatus({
    isFinalized: Boolean(input.report.finalizedAt),
    isSigned: Boolean(input.technicianSignature || input.customerSignature),
    workflowStatus: input.inspection.status
  });

  switch (factKey) {
    case "customer":
      return { label: "Customer", value: input.customerCompany.name };
    case "site":
      return { label: "Site", value: customerFacingSiteName };
    case "inspectionDate":
      return { label: "Inspection Date", value: formatDate(input.inspection.scheduledStart) };
    case "completionDate":
      return { label: "Completion Date", value: formatDateTime(input.report.finalizedAt) };
    case "technician":
      return { label: "Technician", value: input.report.technicianName ?? "" };
    case "billingContact":
      return { label: "Billing Contact", value: input.customerCompany.billingEmail ?? input.customerCompany.phone ?? "" };
    case "siteAddress":
      return { label: "Site Address", value: siteAddress };
    case "scheduledWindow":
      return {
        label: "Scheduled Window",
        value: input.inspection.scheduledEnd
          ? `${formatDateTime(input.inspection.scheduledStart)} - ${formatDateTime(input.inspection.scheduledEnd)}`
          : formatDateTime(input.inspection.scheduledStart)
      };
    case "inspectionStatus":
      return { label: "Inspection Status", value: status.inspectionStatus };
  }
}

function buildSectionFieldIndex(input: PdfInput) {
  const merged: Record<string, ReportPrimitiveValue | undefined> = {};
  for (const section of Object.values(input.draft.sections)) {
    for (const [key, value] of Object.entries(section.fields)) {
      if (!Array.isArray(value)) {
        merged[key] = value as ReportPrimitiveValue | undefined;
      }
    }
  }
  return merged;
}

function mapOutcomeMetric(
  input: PdfInput,
  config: ReportTypeConfig,
  preview: ReturnType<typeof buildReportPreview>,
  key: SummaryMetricKey
): RenderMetricCard {
  const status = mapCustomerFacingReportStatus({
    isFinalized: Boolean(input.report.finalizedAt),
    isSigned: Boolean(input.technicianSignature || input.customerSignature),
    workflowStatus: input.inspection.status
  });
  const deficiencyTotal = preview.deficiencyCount + input.deficiencies.length;

  switch (key) {
    case "documentStatus":
      return { label: "Document Status", value: status.documentStatus, tone: "neutral" };
    case "outcome":
      return {
        label: "Outcome",
        value: getCustomerFacingOutcomeLabel({
          isFinalized: Boolean(input.report.finalizedAt),
          isSigned: Boolean(input.technicianSignature || input.customerSignature),
          deficiencyTotal,
          passLabel: config.statusMapping.passLabel,
          failLabel: config.statusMapping.failLabel,
          deficiencyFoundLabel: config.statusMapping.deficiencyFoundLabel
        }),
        tone: deficiencyTotal > 0 ? "fail" : "pass"
      };
    case "deficiencyCount":
      return { label: "Deficiencies", value: String(deficiencyTotal), tone: deficiencyTotal > 0 ? "fail" : "pass" };
    case "completionPercent":
      return { label: "Completion", value: `${Math.round(preview.reportCompletion * 100)}%`, tone: preview.reportCompletion >= 1 ? "pass" : "warn" };
    case "serviceDate":
      return { label: "Service Date", value: formatDate(input.inspection.scheduledStart), tone: "neutral" };
    case "followUpRequired": {
      const merged = buildSectionFieldIndex(input);
      const yes = merged.followUpRequired === true || cleanCustomerFacingText(merged.followUpRequired).toLowerCase() === "yes";
      return { label: "Follow-Up Required", value: yes ? "Yes" : "No", tone: yes ? "warn" : "pass" };
    }
  }
}

function buildKeyValueSection(
  sourceFields: Record<string, unknown>,
  sectionConfig: ReportSectionConfig
): Extract<RenderSection, { renderer: "keyValue" }> {
  return {
    key: sectionConfig.key,
    title: sectionConfig.title,
    description: sectionConfig.description,
    renderer: "keyValue",
    pageBreakBehavior: sectionConfig.pageBreakBehavior,
    emptyMessage: sectionConfig.emptyState?.message ?? "",
    items: (sectionConfig.fields ?? [])
      .map((field) => ({
        label: field.label,
        value: formatFieldValue(sourceFields[field.key], field.format, field.fallback)
      }))
      .filter((item) => item.value || !sectionConfig.fields?.find((field) => field.label === item.label)?.hideIfEmpty)
  };
}

function renderRowsWithColumns(columns: RenderTableColumn[], rows: Array<Record<string, unknown>>, options: { inspectionType: string; dataset: string }) {
  const normalizedRows: RenderTableRow[] = rows.map((row) => {
    const indicatorLines = buildIndicatorLines({
      inspectionType: options.inspectionType,
      dataset: options.dataset,
      row
    });
    const nextRow: RenderTableRow = {};
    for (const column of columns) {
      if (column.key === "inspectionIndicators") {
        nextRow[column.key] = toCell(indicatorLines.join(" | "), indicatorLines);
      } else {
        nextRow[column.key] = toCell(cleanCustomerFacingText(row[column.key]));
      }
    }
    return nextRow;
  });

  const visibleColumns = columns.filter((column) => normalizedRows.some((row) => cleanCustomerFacingText(row[column.key]?.text) || (row[column.key]?.lines?.length ?? 0) > 0));
  return {
    columns: visibleColumns,
    rows: normalizedRows.map((row) => Object.fromEntries(visibleColumns.map((column) => [column.key, row[column.key] ?? toCell("")])))
  };
}

function buildTableSection(input: PdfInput, sectionConfig: ReportSectionConfig, rows: Array<Record<string, unknown>>) {
  const columns: RenderTableColumn[] = (sectionConfig.table?.columns ?? []).map((column) => ({
    key: column.key,
    label: column.label,
    width: column.width,
    align: column.align
  }));
  const rendered = renderRowsWithColumns(columns, rows, {
    inspectionType: input.task.inspectionType,
    dataset: sectionConfig.table?.dataset ?? sectionConfig.key
  });

  return {
    key: sectionConfig.key,
    title: sectionConfig.title,
    description: sectionConfig.description,
    renderer: "table" as const,
    pageBreakBehavior: sectionConfig.pageBreakBehavior,
    emptyMessage: sectionConfig.table?.emptyMessage ?? sectionConfig.emptyState?.message ?? "No items recorded",
    columns: rendered.columns,
    rows: rendered.rows,
    repeatHeader: sectionConfig.table?.repeatHeader ?? true
  };
}

function buildChecklistSection(sourceFields: Record<string, unknown>, sectionConfig: ReportSectionConfig) {
  const items: RenderChecklistItem[] = (sectionConfig.checklist?.items ?? [])
    .map((item) => {
      const value = cleanCustomerFacingText(sourceFields[item.key]);
      const normalized = value.toLowerCase();
      return {
        label: item.label,
        result: humanizeText(value || ""),
        tone: normalized === "pass" || normalized === "yes"
          ? "pass"
          : normalized === "fail" || normalized === "no"
            ? "fail"
            : "neutral"
      } as RenderChecklistItem;
    })
    .filter((item) => item.result);

  return {
    key: sectionConfig.key,
    title: sectionConfig.title,
    description: sectionConfig.description,
    renderer: "checklist" as const,
    pageBreakBehavior: sectionConfig.pageBreakBehavior,
    emptyMessage: sectionConfig.emptyState?.message ?? "No checklist results recorded",
    items
  };
}

function buildFindingsSection(input: PdfInput, preview: ReturnType<typeof buildReportPreview>): Extract<RenderSection, { renderer: "findings" }> {
  const serviceFindings = preview.detectedDeficiencies.map((item) =>
    [item.rowLabel, item.description, item.location].map((part) => cleanCustomerFacingText(part)).filter(Boolean).join(" - ")
  );
  const manualDeficiencies = input.deficiencies.map((item) =>
    [item.title, item.description, item.location].map((part) => cleanCustomerFacingText(part)).filter(Boolean).join(" - ")
  );

  return {
    key: "findings",
    title: "Findings and Deficiencies",
    renderer: "findings" as const,
    groups: [
      {
        title: "Service findings",
        tone: serviceFindings.length > 0 ? "warn" : "neutral",
        lines: serviceFindings.length > 0 ? serviceFindings : [customerFacingFieldRules.findingsFallback]
      },
      {
        title: "Deficiencies",
        tone: manualDeficiencies.length > 0 ? "fail" : "neutral",
        lines: manualDeficiencies.length > 0 ? manualDeficiencies : [customerFacingFieldRules.deficienciesFallback]
      }
    ]
  };
}

function buildNotesSection(input: PdfInput): Extract<RenderSection, { renderer: "notes" }> {
  return {
    key: "notes",
    title: "Notes",
    renderer: "notes" as const,
    body: cleanCustomerFacingText(input.draft.overallNotes || input.inspection.notes) || customerFacingFieldRules.notesFallback
  };
}

function buildPhotoSection(input: PdfInput, config: ReportTypeConfig): Extract<RenderSection, { renderer: "photos" }> {
  const mode = config.photos?.captionMode ?? "sequential";
  return {
    key: "photos",
    title: config.photos?.title ?? "Photos",
    renderer: "photos" as const,
    emptyMessage: "No inspection photos included",
    photos: input.photos.map((photo, index) => ({
      caption: buildPhotoCaption(index, mode),
      sourceName: photo.fileName,
      storageKey: photo.storageKey
    }))
  };
}

function buildSignatureSection(input: PdfInput, config: ReportTypeConfig): Extract<RenderSection, { renderer: "signatures" }> {
  return {
    key: "signatures",
    title: config.signatures?.title ?? "Signatures",
    renderer: "signatures" as const,
    signatures: [
      {
        role: config.signatures?.roles[0] ?? "Technician",
        signerName: input.technicianSignature?.signerName ?? "",
        signedAt: formatDateTime(input.technicianSignature?.signedAt),
        imageDataUrl: input.technicianSignature?.imageDataUrl ?? null
      },
      {
        role: config.signatures?.roles[1] ?? "Customer",
        signerName: input.customerSignature?.signerName ?? "",
        signedAt: formatDateTime(input.customerSignature?.signedAt),
        imageDataUrl: input.customerSignature?.imageDataUrl ?? null
      }
    ]
  };
}

function getSourceSectionFields(input: PdfInput, sectionKey: string) {
  return input.draft.sections[sectionKey]?.fields ?? {};
}

function buildDatasetRows(input: PdfInput, dataset: string): Array<Record<string, unknown>> {
  const [sectionId, fieldId] = dataset.split(".", 2);
  if (sectionId && fieldId) {
    const candidate = input.draft.sections[sectionId]?.fields?.[fieldId];
    return Array.isArray(candidate) ? candidate as Array<Record<string, unknown>> : [];
  }

  switch (dataset) {
    case "controlPanels":
      return Array.isArray(input.draft.sections["control-panel"]?.fields.controlPanels) ? input.draft.sections["control-panel"]?.fields.controlPanels as Array<Record<string, unknown>> : [];
    case "initiatingDevices":
      return Array.isArray(input.draft.sections["initiating-devices"]?.fields.initiatingDevices) ? input.draft.sections["initiating-devices"]?.fields.initiatingDevices as Array<Record<string, unknown>> : [];
    case "notificationAppliances":
      return Array.isArray(input.draft.sections.notification?.fields.notificationAppliances) ? input.draft.sections.notification?.fields.notificationAppliances as Array<Record<string, unknown>> : [];
    case "hoods":
      return Array.isArray(input.draft.sections["appliance-coverage"]?.fields.hoods) ? input.draft.sections["appliance-coverage"]?.fields.hoods as Array<Record<string, unknown>> : [];
    case "appliances":
      return Array.isArray(input.draft.sections["appliance-coverage"]?.fields.hoodAppliances) ? input.draft.sections["appliance-coverage"]?.fields.hoodAppliances as Array<Record<string, unknown>> : [];
    case "fusibleLinksUsed":
      return Array.isArray(input.draft.sections["tank-and-service"]?.fields.fusibleLinksUsed) ? input.draft.sections["tank-and-service"]?.fields.fusibleLinksUsed as Array<Record<string, unknown>> : [];
    case "extinguishers":
      return Array.isArray(input.draft.sections.inventory?.fields.extinguishers) ? input.draft.sections.inventory?.fields.extinguishers as Array<Record<string, unknown>> : [];
    case "serviceActions": {
      const rows = Array.isArray(input.draft.sections.inventory?.fields.extinguishers) ? input.draft.sections.inventory?.fields.extinguishers as Array<Record<string, unknown>> : [];
      return rows
        .filter((row) => cleanCustomerFacingText(row.servicePerformed ?? row.servicePerformedOther))
        .map((row) => ({
          location: row.location,
          extinguisherType: row.extinguisherType,
          action: row.servicePerformedOther || row.servicePerformed,
          partsUsed: "",
          technicianNotes: row.notes
        }));
    }
    default:
      return [];
  }
}

function buildSectionByConfig(input: PdfInput, sectionConfig: ReportSectionConfig): RenderSection | null {
  switch (sectionConfig.key) {
    case "control_panel_summary":
      return buildKeyValueSection(getSourceSectionFields(input, "control-panel"), sectionConfig);
    case "general_system_summary":
      return buildKeyValueSection(getSourceSectionFields(input, "system-summary"), sectionConfig);
    case "system_details":
      return buildKeyValueSection(getSourceSectionFields(input, "system-details"), sectionConfig);
    case "extinguisher_summary": {
      const inventoryFields = getSourceSectionFields(input, "inventory");
      const rows = Array.isArray(inventoryFields.extinguishers) ? inventoryFields.extinguishers as Array<Record<string, unknown>> : [];
      return buildKeyValueSection({
        extinguishersInspected: rows.length || inventoryFields.unitsInspected,
        extinguishersPassed: rows.filter((row) => cleanCustomerFacingText(row.gaugeStatus).toLowerCase() === "pass").length,
        extinguishersFailed: rows.filter((row) => cleanCustomerFacingText(row.gaugeStatus).toLowerCase() === "fail").length,
        extinguishersServiced: rows.filter((row) => cleanCustomerFacingText(row.servicePerformed ?? row.servicePerformedOther)).length,
        deficiencyCount: input.deficiencies.length
      }, sectionConfig);
    }
    case "system_checklist":
      return buildChecklistSection(getSourceSectionFields(input, "system-checklist"), sectionConfig);
    case "findings":
    case "notes":
      return null;
    default:
      if (sectionConfig.renderer === "table" && sectionConfig.table) {
        return buildTableSection(input, sectionConfig, buildDatasetRows(input, sectionConfig.table.dataset));
      }
      if (sectionConfig.renderer === "keyValue") {
        return buildKeyValueSection(getSourceSectionFields(input, sectionConfig.key), sectionConfig);
      }
      return null;
  }
}

export function buildReportRenderModelV2(input: PdfInput): ReportRenderModelV2 {
  const config = resolveReportTypeConfigV2(input.task.inspectionType);
  if (!config) {
    throw new Error(`PDF v2 is not configured for inspection type ${input.task.inspectionType}.`);
  }

  const preview = buildReportPreview(input.draft);
  const branding = resolveTenantBranding({ tenantName: input.tenant.name, branding: input.tenant.branding });
  const companyName = branding.legalBusinessName || input.tenant.name;
  const brandAddress = formatPdfAddress({
    addressLine1: branding.addressLine1,
    addressLine2: branding.addressLine2,
    city: branding.city,
    state: branding.state,
    postalCode: branding.postalCode
  });

  const detailSections = config.sections.map((section) => buildSectionByConfig(input, section)).filter(Boolean) as RenderSection[];
  const systemSummary = detailSections.find((section) =>
    (section.renderer === "keyValue" || section.renderer === "compactMetrics") &&
    section.key === config.pageOne.systemSummarySectionKey
  ) as ReportRenderModelV2["systemSummary"] | undefined;

  const sections: RenderSection[] = [
    ...detailSections.filter((section) => section.key !== config.pageOne.systemSummarySectionKey),
    buildFindingsSection(input, preview),
    buildNotesSection(input),
    buildPhotoSection(input, config),
    buildSignatureSection(input, config)
  ];

  const reportState = mapCustomerFacingReportStatus({
    isFinalized: Boolean(input.report.finalizedAt),
    isSigned: Boolean(input.technicianSignature || input.customerSignature),
    workflowStatus: input.inspection.status
  });

  return {
    version: {
      key: "v2",
      label: "Report PDF v2"
    },
    inspectionType: input.task.inspectionType,
    title: config.title,
    documentCategory: config.documentCategory,
    branding: {
      companyName,
      phone: branding.phone ?? "",
      email: branding.email ?? "",
      website: branding.website ?? "",
      address: brandAddress,
      primaryColor: branding.primaryColor,
      accentColor: branding.accentColor,
      logoDataUrl: branding.logoDataUrl
    },
    header: {
      reportId: input.report.id,
      serviceDate: formatDate(input.inspection.scheduledStart),
      companyName,
      reportTitle: config.title,
      contactLine: joinPresentValues([branding.phone, branding.email, branding.website], "   "),
      addressLine: brandAddress
    },
    footer: {
      brandLabel: companyName,
      reportId: input.report.id,
      versionLabel: "Report PDF v2",
      documentState: reportState.documentStatus
    },
    identity: {
      title: config.title,
      customer: input.customerCompany.name,
      site: getCustomerFacingSiteLabel(input.site.name) || input.site.name,
      technician: input.report.technicianName ?? "",
      serviceDate: formatDate(input.inspection.scheduledStart)
    },
    compliance: {
      title: config.compliance.label,
      description: config.compliance.description ?? "",
      codes: config.compliance.codes
    },
    outcomeCards: config.pageOne.outcomeMetrics.map((metric) => mapOutcomeMetric(input, config, preview, metric)),
    primaryFacts: config.pageOne.primaryFacts.map((fact) => mapSummaryFact(input, fact)).filter((item) => item.value),
    overviewFacts: config.pageOne.overviewFacts.map((fact) => mapSummaryFact(input, fact)).filter((item) => item.value),
    systemSummary,
    sections
  };
}
