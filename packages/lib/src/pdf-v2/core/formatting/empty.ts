const NULL_EQUIVALENTS = new Set(["", "-", "—", "unknown", "unknown unknown"]);

export function isNullEquivalent(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === "string") {
    return NULL_EQUIVALENTS.has(value.trim().toLowerCase());
  }

  return false;
}

export function toCleanOptionalString(value: unknown): string | undefined {
  if (isNullEquivalent(value)) {
    return undefined;
  }

  const text = String(value).trim().replace(/\s+/g, " ");
  return /^(na|n\/a)$/i.test(text) ? "N/A" : text || undefined;
}
