import type { ReactNode } from "react";

export type PdfShellProps = {
  children: ReactNode;
  pageNumber?: number;
  totalPages?: number;
  footer?: ReactNode;
  header?: ReactNode;
  className?: string;
};

export type ReportHeaderProps = {
  company: {
    name: string;
    logoUrl?: string;
    phone?: string;
    email?: string;
    website?: string;
    address?: string;
  };
  report: {
    title: string;
    reportId: string;
    inspectionDate: string;
  };
};

export type OutcomeHeroProps = {
  result: "Pass" | "Fail" | "Partial";
  deficiencyCount?: number;
  completionPercent?: number;
  narrative: string;
};

export type ComplianceBlockProps = {
  codes: string[];
};

export type IdentityBandProps = {
  customerName: string;
  siteName?: string;
  inspectionDate: string;
  completionTimestamp?: string;
  technicianName?: string;
  billingContact?: string;
  cleanAddress?: string;
};

export type MetadataGridItem = {
  label: string;
  value: string;
};

export type MetadataGridProps = {
  items: MetadataGridItem[];
  columns?: 2 | 3 | 4;
};

export type MetricGridItem = {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning" | "danger";
};

export type MetricGridProps = {
  items: MetricGridItem[];
  columns?: 2 | 3 | 4;
};

export type SectionHeaderProps = {
  title: string;
  subtitle?: string;
};

export type SummaryStripItem = {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning" | "danger";
};

export type SummaryStripProps = {
  items: SummaryStripItem[];
};

export type BadgeProps = {
  children: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "muted";
};

export type DataTableColumn<T> = {
  key: string;
  header: string;
  width?: string;
  align?: "left" | "center" | "right";
  render: (row: T) => ReactNode;
  isEmpty?: (row: T) => boolean;
  hideIfAllRowsEmpty?: boolean;
};

export type DataTableProps<T> = {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  density?: "compact" | "normal";
};

export type EmptyStateProps = {
  message: string;
};

export type PhotoItem = {
  url: string;
  caption: string;
};

export type PhotoGridProps = {
  photos: PhotoItem[];
};

export type SignatureCardProps = {
  role: string;
  name: string;
  signedAt?: string;
  imageUrl: string;
};

export type DividerProps = {
  subtle?: boolean;
};
