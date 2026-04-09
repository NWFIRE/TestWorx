import { addDays } from "date-fns";

export const DEFAULT_QUOTE_EXPIRATION_DAYS = 30;

export type QuoteTermsSection = {
  title: string;
  body?: string[];
  bullets?: string[];
};

export type QuoteTermsContent = {
  title: string;
  intro?: string;
  emphasisTitle: string;
  emphasisBody: string;
  sections: QuoteTermsSection[];
};

const defaultQuoteTerms: QuoteTermsContent = {
  title: "Project Terms",
  intro: "This proposal outlines the included work, scope boundaries, and coordination expectations for the fire alarm, fire sprinkler, and/or kitchen suppression work described in this quote.",
  emphasisTitle: "Deposit Requirement",
  emphasisBody:
    "To begin planning, engineering, or design submittals, a 30% deposit is required. Work will not begin and materials will not be ordered until the required deposit has been received.",
  sections: [
    {
      title: "Scope of Work",
      body: [
        "This proposal includes only the labor, materials, and services specifically listed in this quote for the fire alarm, fire sprinkler, and/or kitchen suppression work described."
      ]
    },
    {
      title: "Not Included Unless Specifically Stated",
      bullets: [
        "Painting or finish work",
        "Drywall installation, repair, or patching",
        "Ceiling tile replacement",
        "Core drilling or structural modifications",
        "Electrical work beyond system-specific connections",
        "Architectural or general construction work",
        "Permits, fees, or third-party inspections unless listed in this quote",
        "Fire watch services",
        "Any work outside the explicitly defined scope"
      ]
    },
    {
      title: "Customer Responsibilities",
      body: [
        "Customer is responsible for providing safe and reasonable access to work areas, required utilities, and coordination with other trades or building representatives as needed."
      ]
    },
    {
      title: "General Conditions",
      body: [
        "If additional work is required due to site conditions, code requirements, coordination issues, or requested changes, it will be quoted separately and must be approved before that work proceeds.",
        "This proposal is based on visible and known conditions at the time of quoting. Hidden conditions, field changes, code-required revisions, or unforeseen site conditions may result in additional work and pricing adjustments.",
        "Approval of this quote confirms acceptance of the scope, terms, and exclusions described above."
      ]
    }
  ]
};

export function getDefaultQuoteExpirationDate(issuedAt: Date) {
  return addDays(issuedAt, DEFAULT_QUOTE_EXPIRATION_DAYS);
}

export function getQuoteTermsContent() {
  return defaultQuoteTerms;
}
