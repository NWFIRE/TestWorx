type QuotePresentationLineItemInput = {
  title: string;
  description?: string | null;
  internalCode?: string | null;
  category?: string | null;
  quantity?: number;
  unitPrice?: number;
  total?: number;
  id?: string;
  itemType?: string | null;
};

const quoteProposalTypeLabels = {
  fire_alarm: "Fire Alarm System",
  fire_sprinkler: "Fire Sprinkler System",
  kitchen_suppression: "Kitchen Suppression System",
  fire_extinguisher: "Fire Extinguisher Service",
  industrial_suppression: "Industrial Suppression System",
  emergency_exit_lighting: "Emergency and Exit Lighting",
  general_fire_protection: "General Fire Protection"
} as const;

export type QuotePresentationLineItem = {
  id?: string;
  title: string;
  description: string | null;
  group: "Materials / Equipment" | "Labor" | "Permits / Design / Fees" | "Services";
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

function normalizeQuoteCategory(value: string | null | undefined) {
  return normalizeOptionalText(value)?.toLowerCase().replace(/[\s-]+/g, "_") ?? null;
}

export function resolveQuoteLineItemCategory(line: QuotePresentationLineItemInput) {
  const category = normalizeQuoteCategory(line.category);
  const haystack = [line.title, line.description, line.internalCode, line.itemType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(permit|design|submittal|plan review|compliance|reporting fee|service fee|filing|\bfee\b)/i.test(haystack)) {
    return "fee" as const;
  }

  if (/(labor|technician|hourly|man ?hour|installation|\binstall\b|programming|startup|commissioning|training|\bdemo\b)/i.test(haystack)) {
    return "labor" as const;
  }

  const isInspectionService = /\binspection\b/i.test(haystack)
    && !/(inspection\s+(tag|label|sticker|kit)|(?:tag|label|sticker|kit)\s+for\s+inspection)/i.test(haystack);
  if (isInspectionService || /\b(service call|preventive maintenance|annual testing|system testing|certification|hood cleaning|exhaust cleaning)\b/i.test(haystack)) {
    return "service" as const;
  }

  if (/(fusible\s+link|pull station|sprinkler head|strobe|horn|detector|module|device|panel|valve|pump|extinguisher|battery|cylinder|cartridge|nozzle|equipment|replacement part|material|\bsign\b|\blight\b)/i.test(haystack)) {
    return "material" as const;
  }

  if (["fee", "service_fee", "permit", "design", "submittal"].includes(category ?? "")) {
    return "fee" as const;
  }
  if (category === "labor") {
    return "labor" as const;
  }
  if (["material", "materials", "part", "parts", "inventory", "equipment", "replacement"].includes(category ?? "")) {
    return "material" as const;
  }
  if (["inspection", "service", "repair", "maintenance", "noninventory", "other"].includes(category ?? "")) {
    return "service" as const;
  }

  const itemType = normalizeQuoteCategory(line.itemType);
  if (itemType === "inventory") {
    return "material" as const;
  }

  return "service" as const;
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
  const category = resolveQuoteLineItemCategory(line);
  if (category === "fee") {
    return "Permits / Design / Fees";
  }
  if (category === "labor") {
    return "Labor";
  }
  if (category === "material") {
    return "Materials / Equipment";
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
  const groupOrder: QuotePresentationLineItem["group"][] = ["Services", "Materials / Equipment", "Labor", "Permits / Design / Fees"];
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

function resolveProposalDomain(
  lineItems: QuotePresentationLineItemInput[],
  proposalType?: string | null
) {
  const explicit = proposalType ? quoteProposalTypeLabels[proposalType as keyof typeof quoteProposalTypeLabels] : null;
  return explicit ?? inferProposalDomain(lineItems);
}

export function buildQuoteProjectSummary(
  lineItems: QuotePresentationLineItemInput[],
  proposalType?: string | null
) {
  const domain = resolveProposalDomain(lineItems, proposalType);
  const action = inferProposalAction(lineItems);
  return action === "Proposal" ? domain : `${domain} ${action}`;
}
