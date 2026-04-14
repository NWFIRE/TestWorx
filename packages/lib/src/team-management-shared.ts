export const internalAllowanceKeys = [
  "accountAdmin",
  "schedulingAccess",
  "quoteAccess",
  "billingAccess",
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
  quoteAccess: "Quotes",
  billingAccess: "Billing review",
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
