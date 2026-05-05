export const internalAllowanceKeys = [
  "accountAdmin",
  "schedulingAccess",
  "workOrderAccess",
  "quoteAccess",
  "billingAccess",
  "productsServicesAccess",
  "settingsAccess",
  "reportReviewAccess",
  "deficiencyAccess",
  "amendmentAccess",
  "customerPortalAdmin"
] as const;

export const customerAllowanceKeys = [
  "reportDownload",
  "documentDownload",
  "deficiencyVisibility",
  "portalAdmin"
] as const;

export const allowanceKeys = [...internalAllowanceKeys, ...customerAllowanceKeys] as const;

export type TeamAllowanceKey = (typeof allowanceKeys)[number];
export type TeamAllowanceMap = Record<TeamAllowanceKey, boolean>;

export const allowanceLabelMap: Record<TeamAllowanceKey, string> = {
  accountAdmin: "Team admin",
  schedulingAccess: "Scheduling",
  workOrderAccess: "Work orders",
  quoteAccess: "Quotes",
  billingAccess: "Billing review",
  productsServicesAccess: "Products & services",
  settingsAccess: "Settings",
  reportReviewAccess: "Report review",
  deficiencyAccess: "Deficiencies",
  amendmentAccess: "Inspection review",
  customerPortalAdmin: "Portal access admin",
  reportDownload: "Report download",
  documentDownload: "Document download",
  deficiencyVisibility: "Deficiency visibility",
  portalAdmin: "Portal contact admin"
};
