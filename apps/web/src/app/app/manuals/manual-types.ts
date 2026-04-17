export type ManualListItem = {
  id: string;
  title: string;
  manufacturer: string;
  systemCategory: "wet_chemical" | "industrial_dry_chemical";
  productFamily: string | null;
  model: string | null;
  documentType:
    | "installation"
    | "inspection"
    | "service"
    | "owners_manual"
    | "parts"
    | "tech_data"
    | "troubleshooting"
    | "catalog"
    | "other";
  revisionLabel: string | null;
  revisionDate: Date | null;
  description: string | null;
  tags: string[];
  fileName: string;
  mimeType: string;
  fileSizeBytes: number | null;
  pageCount: number | null;
  isActive: boolean;
  isOfflineEligible: boolean;
  source: string | null;
  searchableTextStatus: "pending" | "ready" | "failed" | "not_requested";
  isFavorite: boolean;
  lastViewedAt: Date | null;
  savedOfflineAt: Date | null;
};

export type ManualDetailData = ManualListItem & {
  notes: string | null;
  searchableText: string | null;
  applicability: Array<{
    id: string;
    manufacturer: string;
    productFamily: string | null;
    model: string | null;
    notes: string | null;
  }>;
  supersedesManual: {
    id: string;
    title: string;
    revisionLabel: string | null;
  } | null;
  supersededManuals: Array<{
    id: string;
    title: string;
    revisionLabel: string | null;
  }>;
};
