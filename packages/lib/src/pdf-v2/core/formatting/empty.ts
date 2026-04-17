const NULL_EQUIVALENTS = new Set(["", "-", "—", "na", "n/a", "unknown", "unknown unknown"]);

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

  return String(value).trim().replace(/\s+/g, " ") || undefined;
}
