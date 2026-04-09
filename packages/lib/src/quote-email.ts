function normalizeOptionalText(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeGreetingName(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return null;
  }

  const lower = normalized.toLowerCase();
  if (lower === "customer" || lower === "archived customer") {
    return null;
  }

  return normalized;
}

export function buildQuoteEmailSubject(input: { companyName?: string | null; quoteNumber: string }) {
  const quoteNumber = input.quoteNumber.trim();
  const companyName = normalizeOptionalText(input.companyName);
  return companyName ? `${companyName} Proposal Ready: ${quoteNumber}` : `Proposal Ready: ${quoteNumber}`;
}

export function buildQuoteEmailDefaultMessage() {
  return "Please use the link below to review the project scope, pricing, and details. Once reviewed, you can approve the proposal online.";
}

export function buildQuoteEmailGreeting(recipientName?: string | null) {
  const greetingName = normalizeGreetingName(recipientName);
  return greetingName ? `Hello ${greetingName},` : "Hello,";
}
