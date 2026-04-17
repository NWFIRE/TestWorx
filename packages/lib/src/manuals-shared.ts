import { z } from "zod";

export const manualSystemCategories = ["wet_chemical", "industrial_dry_chemical"] as const;
export type ManualSystemCategory = (typeof manualSystemCategories)[number];

export const manualDocumentTypes = [
  "installation",
  "inspection",
  "service",
  "owners_manual",
  "parts",
  "tech_data",
  "troubleshooting",
  "catalog",
  "other"
] as const;
export type ManualDocumentType = (typeof manualDocumentTypes)[number];

export const manualSearchableTextStatuses = ["pending", "ready", "failed", "not_requested"] as const;
export type ManualSearchableTextStatus = (typeof manualSearchableTextStatuses)[number];

export const manualSystemCategoryLabels: Record<ManualSystemCategory, string> = {
  wet_chemical: "Wet Chemical",
  industrial_dry_chemical: "Industrial Dry Chemical"
};

export const manualDocumentTypeLabels: Record<ManualDocumentType, string> = {
  installation: "Installation",
  inspection: "Inspection",
  service: "Service",
  owners_manual: "Owner's Manual",
  parts: "Parts",
  tech_data: "Tech Data",
  troubleshooting: "Troubleshooting",
  catalog: "Catalog",
  other: "Other"
};

export const manualQuickLookupLabels = {
  inspection: "Inspection",
  service: "Service",
  recharge: "Recharge",
  nozzle_chart: "Nozzle Chart",
  troubleshooting: "Troubleshooting",
  parts: "Parts",
  maintenance: "Maintenance"
} as const;

function sanitizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export const createManualInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required."),
  manufacturer: z.string().trim().min(1, "Manufacturer is required."),
  systemCategory: z.enum(manualSystemCategories),
  productFamily: z.string().trim().optional().transform(sanitizeOptionalString),
  model: z.string().trim().optional().transform(sanitizeOptionalString),
  documentType: z.enum(manualDocumentTypes),
  revisionLabel: z.string().trim().optional().transform(sanitizeOptionalString),
  revisionDate: z.string().trim().optional().transform(sanitizeOptionalString),
  description: z.string().trim().optional().transform(sanitizeOptionalString),
  notes: z.string().trim().optional().transform(sanitizeOptionalString),
  tags: z.array(z.string().trim().min(1)).optional().default([]),
  fileId: z.string().trim().min(1, "A manual file is required."),
  source: z.string().trim().optional().transform(sanitizeOptionalString),
  isActive: z.boolean().optional().default(true),
  isOfflineEligible: z.boolean().optional().default(false),
  searchableTextStatus: z.enum(manualSearchableTextStatuses).optional(),
  searchableText: z.string().trim().optional().transform(sanitizeOptionalString),
  pageCount: z.number().int().positive().optional(),
  supersedesManualId: z.string().trim().optional().transform(sanitizeOptionalString)
});

export const updateManualInputSchema = createManualInputSchema.partial().extend({
  title: z.string().trim().min(1, "Title is required.").optional(),
  manufacturer: z.string().trim().min(1, "Manufacturer is required.").optional(),
  systemCategory: z.enum(manualSystemCategories).optional(),
  documentType: z.enum(manualDocumentTypes).optional(),
  fileId: z.string().trim().min(1, "A manual file is required.").optional()
});

export const listManualsInputSchema = z.object({
  query: z.string().trim().optional().transform(sanitizeOptionalString),
  systemCategory: z.enum(manualSystemCategories).optional(),
  manufacturer: z.string().trim().optional().transform(sanitizeOptionalString),
  model: z.string().trim().optional().transform(sanitizeOptionalString),
  documentType: z.enum(manualDocumentTypes).optional(),
  favoritesOnly: z.boolean().optional().default(false),
  recentOnly: z.boolean().optional().default(false),
  isActive: z.boolean().optional(),
  limit: z.number().int().positive().max(100).optional()
});

export type CreateManualInput = z.infer<typeof createManualInputSchema>;
export type UpdateManualInput = z.infer<typeof updateManualInputSchema>;
export type ListManualsInput = z.infer<typeof listManualsInputSchema>;

export function formatManualSystemCategory(value: ManualSystemCategory) {
  return manualSystemCategoryLabels[value] ?? value;
}

export function formatManualDocumentType(value: ManualDocumentType) {
  return manualDocumentTypeLabels[value] ?? value;
}

export function parseManualTags(input: string | null | undefined) {
  return (input ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function formatManualTags(tags: string[]) {
  return tags.join(", ");
}
