import type { InspectionType } from "@testworx/types";

import type { ReportDraft } from "../report-engine";

export type PdfInput = {
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

export type SummaryMetricKey =
  | "documentStatus"
  | "outcome"
  | "deficiencyCount"
  | "completionPercent"
  | "serviceDate"
  | "followUpRequired";

export type SummaryFactKey =
  | "customer"
  | "site"
  | "inspectionDate"
  | "completionDate"
  | "technician"
  | "billingContact"
  | "siteAddress"
  | "scheduledWindow"
  | "inspectionStatus";

export type ReportSectionRenderer =
  | "keyValue"
  | "compactMetrics"
  | "table"
  | "checklist"
  | "findings"
  | "notes"
  | "photos"
  | "signatures";

export type FieldConfig = {
  key: string;
  label: string;
  format?: "text" | "date" | "datetime" | "boolean" | "number" | "address" | "badge" | "hours";
  hideIfEmpty?: boolean;
  fallback?: string;
};

export type TableColumnConfig = {
  key: string;
  label: string;
  width?: string;
  align?: "left" | "center" | "right";
  format?: "text" | "number" | "boolean" | "badge";
  hideIfEmpty?: boolean;
  renderMode?: "plain" | "stacked" | "indicators";
};

export type TableConfig = {
  dataset: string;
  columns: TableColumnConfig[];
  repeatHeader?: boolean;
  hideIfEmpty?: boolean;
  emptyMessage?: string;
};

export type ChecklistConfig = {
  dataset: string;
  style?: "passFailGrid" | "stackedList";
  items: Array<{
    key: string;
    label: string;
  }>;
};

export type ReportSectionConfig = {
  key: string;
  title: string;
  description?: string;
  renderer: ReportSectionRenderer;
  visible?: boolean;
  pageBreakBehavior?: "auto" | "avoid-inside" | "start-on-new-page";
  emptyState?: {
    mode: "hide-section" | "show-clean-empty";
    message?: string;
  };
  fields?: FieldConfig[];
  table?: TableConfig;
  checklist?: ChecklistConfig;
};

export type PhotoSectionConfig = {
  enabled: boolean;
  title: string;
  captionMode: "sequential" | "single-generic" | "none";
};

export type SignatureSectionConfig = {
  enabled: boolean;
  title: string;
  roles: string[];
};

export type ReportTypeConfig = {
  type: InspectionType;
  version: "v2";
  title: string;
  documentCategory: "inspection" | "service" | "deficiency";
  compliance: {
    enabled: boolean;
    label: string;
    description?: string;
    codes: string[];
  };
  pageOne: {
    outcomeMetrics: SummaryMetricKey[];
    primaryFacts: SummaryFactKey[];
    overviewFacts: SummaryFactKey[];
    systemSummarySectionKey?: string;
  };
  statusMapping: {
    finalizedLabel: string;
    completedLabel: string;
    passLabel: string;
    failLabel: string;
    deficiencyFoundLabel?: string;
    hideWorkflowStatesInCustomerPdf: boolean;
  };
  sections: ReportSectionConfig[];
  photos?: PhotoSectionConfig;
  signatures?: SignatureSectionConfig;
};

export type RenderMetricCard = {
  label: string;
  value: string;
  tone: "pass" | "fail" | "warn" | "neutral";
};

export type RenderKeyValueRow = {
  label: string;
  value: string;
};

export type RenderTableColumn = {
  key: string;
  label: string;
  width?: string;
  align?: "left" | "center" | "right";
};

export type RenderTableCell = {
  text: string;
  lines?: string[];
};

export type RenderTableRow = Record<string, RenderTableCell>;

export type RenderChecklistItem = {
  label: string;
  result: string;
  tone: "pass" | "fail" | "warn" | "neutral";
};

export type RenderSection =
  | {
      key: string;
      title: string;
      description?: string;
      renderer: "keyValue";
      pageBreakBehavior?: "auto" | "avoid-inside" | "start-on-new-page";
      emptyMessage?: string;
      items: RenderKeyValueRow[];
    }
  | {
      key: string;
      title: string;
      description?: string;
      renderer: "compactMetrics";
      pageBreakBehavior?: "auto" | "avoid-inside" | "start-on-new-page";
      emptyMessage?: string;
      items: RenderMetricCard[];
    }
  | {
      key: string;
      title: string;
      description?: string;
      renderer: "table";
      pageBreakBehavior?: "auto" | "avoid-inside" | "start-on-new-page";
      emptyMessage?: string;
      columns: RenderTableColumn[];
      rows: RenderTableRow[];
      repeatHeader?: boolean;
    }
  | {
      key: string;
      title: string;
      description?: string;
      renderer: "checklist";
      pageBreakBehavior?: "auto" | "avoid-inside" | "start-on-new-page";
      emptyMessage?: string;
      items: RenderChecklistItem[];
    }
  | {
      key: string;
      title: string;
      description?: string;
      renderer: "findings";
      pageBreakBehavior?: "auto" | "avoid-inside" | "start-on-new-page";
      groups: Array<{
        title: string;
        tone: "pass" | "fail" | "warn" | "neutral";
        lines: string[];
      }>;
    }
  | {
      key: string;
      title: string;
      description?: string;
      renderer: "notes";
      pageBreakBehavior?: "auto" | "avoid-inside" | "start-on-new-page";
      body: string;
    }
  | {
      key: string;
      title: string;
      description?: string;
      renderer: "photos";
      pageBreakBehavior?: "auto" | "avoid-inside" | "start-on-new-page";
      photos: Array<{
        caption: string;
        sourceName: string;
        storageKey: string;
      }>;
      emptyMessage: string;
    }
  | {
      key: string;
      title: string;
      description?: string;
      renderer: "signatures";
      pageBreakBehavior?: "auto" | "avoid-inside" | "start-on-new-page";
      signatures: Array<{
        role: string;
        signerName: string;
        signedAt: string;
        imageDataUrl: string | null;
      }>;
    };

export type ReportRenderModelV2 = {
  version: {
    key: "v2";
    label: "Report PDF v2";
  };
  inspectionType: InspectionType;
  title: string;
  documentCategory: "inspection" | "service" | "deficiency";
  branding: {
    companyName: string;
    phone: string;
    email: string;
    website: string;
    address: string;
    primaryColor?: string | null;
    accentColor?: string | null;
    logoDataUrl?: string | null;
  };
  header: {
    reportId: string;
    serviceDate: string;
    companyName: string;
    reportTitle: string;
    contactLine: string;
    addressLine: string;
  };
  footer: {
    brandLabel: string;
    reportId: string;
    versionLabel: string;
    documentState: string;
  };
  identity: {
    title: string;
    customer: string;
    site: string;
    technician: string;
    serviceDate: string;
  };
  compliance: {
    title: string;
    description: string;
    codes: string[];
  };
  outcomeCards: RenderMetricCard[];
  primaryFacts: RenderKeyValueRow[];
  overviewFacts: RenderKeyValueRow[];
  systemSummary?: Extract<RenderSection, { renderer: "keyValue" | "compactMetrics" }>;
  sections: RenderSection[];
};
