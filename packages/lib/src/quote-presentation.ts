type QuotePresentationLineItemInput = {
  title: string;
  description?: string | null;
  internalCode?: string | null;
  category?: string | null;
  quantity?: number;
  unitPrice?: number;
  total?: number;
  id?: string;
};

export type QuotePresentationLineItem = {
  id?: string;
  title: string;
  description: string | null;
  group: "Equipment" | "Labor" | "Permits / Design / Fees" | "Services";
  quantity?: number;
  unitPrice?: number;
  total?: number;
};

const internalDescriptionPatterns = [
  /^quickbooks\s+/i,
  /^noninventory$/i,
  /^inventory$/i,
  /^service$/i,
  /^sku\b/i,
  /^type\b/i
];

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isInternalFragment(value: string) {
  return internalDescriptionPatterns.some((pattern) => pattern.test(value.trim()));
}

export function getCustomerFacingQuoteDescription(description: string | null | undefined) {
  const normalized = normalizeOptionalText(description);
  if (!normalized) {
    return null;
  }

  const parts = normalized
    .split(/[•|]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !isInternalFragment(part));

  if (parts.length === 0) {
    return null;
  }

  const rebuilt = parts.join(" • ");
  return rebuilt.length > 0 ? rebuilt : null;
}

function inferLineGroup(line: QuotePresentationLineItemInput): QuotePresentationLineItem["group"] {
  const haystack = [line.title, line.description, line.internalCode, line.category].filter(Boolean).join(" ").toLowerCase();

  if (/(permit|design|submittal|plan review|compliance|reporting fee|fee|filing)/i.test(haystack)) {
    return "Permits / Design / Fees";
  }

  if (/(labor|installation|install|programming|startup|commissioning|training|demo|testing labor)/i.test(haystack)) {
    return "Labor";
  }

  if (/(panel|pull station|strobe|horn|detector|module|device|extinguisher|sprinkler|valve|pump|hood|suppression|battery|material|equipment|sign|light)/i.test(haystack)) {
    return "Equipment";
  }

  return "Services";
}

export function buildQuotePresentationLineItems(lineItems: QuotePresentationLineItemInput[]) {
  return lineItems.map((line) => ({
    id: line.id,
    title: normalizeOptionalText(line.title) ?? "Quoted service",
    description: getCustomerFacingQuoteDescription(line.description),
    group: inferLineGroup(line),
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    total: line.total
  }));
}

export function groupQuotePresentationLineItems(lineItems: QuotePresentationLineItem[]) {
  const groupOrder: QuotePresentationLineItem["group"][] = ["Equipment", "Labor", "Permits / Design / Fees", "Services"];
  return groupOrder
    .map((group) => ({
      title: group,
      items: lineItems.filter((item) => item.group === group)
    }))
    .filter((group) => group.items.length > 0);
}

function inferProposalDomain(lineItems: QuotePresentationLineItemInput[]) {
  const haystack = lineItems.map((line) => [line.title, line.description, line.internalCode].filter(Boolean).join(" ").toLowerCase()).join(" ");

  if (/(fire alarm|alarm)/i.test(haystack)) {
    return "Fire Alarm System";
  }
  if (/(sprinkler)/i.test(haystack)) {
    return "Fire Sprinkler System";
  }
  if (/(kitchen|hood|suppression)/i.test(haystack)) {
    return "Kitchen Suppression System";
  }
  if (/(extinguisher)/i.test(haystack)) {
    return "Fire Extinguisher Service";
  }

  return "Fire Protection System";
}

function inferProposalAction(lineItems: QuotePresentationLineItemInput[]) {
  const haystack = lineItems.map((line) => [line.title, line.description, line.internalCode].filter(Boolean).join(" ").toLowerCase()).join(" ");

  if (/(installation|install)/i.test(haystack)) {
    return "Installation";
  }
  if (/(repair|replacement|deficiency)/i.test(haystack)) {
    return "Repairs";
  }
  if (/(inspection|annual|semi-annual|test)/i.test(haystack)) {
    return "Inspection";
  }
  if (/(service|maintenance|recharge)/i.test(haystack)) {
    return "Service";
  }

  return "Proposal";
}

export function buildQuoteProjectSummary(lineItems: QuotePresentationLineItemInput[]) {
  const domain = inferProposalDomain(lineItems);
  const action = inferProposalAction(lineItems);
  return action === "Proposal" ? domain : `${domain} ${action}`;
}
