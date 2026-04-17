import { isNullEquivalent, toCleanOptionalString } from "./empty";

export function cleanText(value: unknown): string | undefined {
  return toCleanOptionalString(value);
}

export function cleanTitleLikeText(value: unknown): string | undefined {
  const cleaned = toCleanOptionalString(value);
  if (!cleaned) {
    return undefined;
  }

  return cleaned
    .split(" ")
    .map((segment) => (segment.toUpperCase() === segment && segment.length > 4 ? segment.toLowerCase() : segment))
    .join(" ");
}

export function joinNonEmpty(parts: Array<unknown>, separator: string): string | undefined {
  const filtered = parts
    .map((part) => toCleanOptionalString(part))
    .filter((part): part is string => Boolean(part) && !isNullEquivalent(part));

  return filtered.length ? filtered.join(separator) : undefined;
}
