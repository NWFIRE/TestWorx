import type { ReportPrimitiveValue } from "../report-config";

export const customerFacingFieldRules = {
  suppressValues: [null, undefined, "", "Unknown", "N/A", "--", "—"],
  addressFallback: "No service address on file",
  notesFallback: "No notes provided",
  findingsFallback: "No service findings recorded",
  deficienciesFallback: "No deficiencies recorded"
} as const;

export function cleanCustomerFacingText(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const normalized = String(value).replace(/\s+/g, " ").trim();
  if (!normalized || /^(undefined|null|unknown|n\/a|na|[-—]+)$/i.test(normalized)) {
    return "";
  }

  return normalized;
}

export function withFallback(value: string | null | undefined, fallback: string) {
  return cleanCustomerFacingText(value) || fallback;
}

export function joinPresentValues(values: Array<string | null | undefined>, separator: string) {
  return values.map((value) => cleanCustomerFacingText(value)).filter(Boolean).join(separator);
}

export function formatCityStatePostal(city?: string | null, state?: string | null, postalCode?: string | null) {
  const locality = joinPresentValues([city, state], ", ");
  return joinPresentValues([locality, postalCode ?? null], " ");
}

export function formatPdfAddress(input: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  fallback?: string;
}) {
  const address = joinPresentValues(
    [
      input.addressLine1 ?? null,
      input.addressLine2 ?? null,
      formatCityStatePostal(input.city, input.state, input.postalCode)
    ],
    ", "
  );

  return address || input.fallback || "";
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function humanizeText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (!/[_-]/.test(trimmed) && /[A-Z]/.test(trimmed) && /[a-z]/.test(trimmed)) {
    return trimmed;
  }
  return trimmed
    .replaceAll(/[_-]+/g, " ")
    .split(/\s+/)
    .map((token) => token ? `${token.slice(0, 1).toUpperCase()}${token.slice(1)}` : token)
    .join(" ");
}

export function normalizePrimitiveDisplayValue(value: ReportPrimitiveValue | undefined) {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (typeof value === "string") {
    return cleanCustomerFacingText(humanizeText(value));
  }
  return cleanCustomerFacingText(String(value));
}

export function formatFieldValue(value: unknown, format?: "text" | "date" | "datetime" | "boolean" | "number" | "address" | "badge" | "hours", fallback?: string) {
  let resolved = "";
  switch (format) {
    case "date":
      resolved = formatDate(value as Date | string | null | undefined);
      break;
    case "datetime":
      resolved = formatDateTime(value as Date | string | null | undefined);
      break;
    case "boolean":
      resolved = typeof value === "boolean" ? (value ? "Yes" : "No") : normalizePrimitiveDisplayValue(value as ReportPrimitiveValue | undefined);
      break;
    case "number":
      resolved = value === null || value === undefined || value === "" ? "" : cleanCustomerFacingText(String(value));
      break;
    case "address":
      resolved = typeof value === "string" ? cleanCustomerFacingText(value) : formatPdfAddress({ ...(typeof value === "object" && value ? value as Record<string, string> : {}), fallback });
      break;
    case "hours": {
      if (value === null || value === undefined || value === "") {
        resolved = "";
      } else {
        const numeric = Number(value);
        resolved = Number.isFinite(numeric) ? `${numeric} ${numeric === 1 ? "hour" : "hours"}` : cleanCustomerFacingText(String(value));
      }
      break;
    }
    default:
      resolved = normalizePrimitiveDisplayValue(value as ReportPrimitiveValue | undefined);
      break;
  }

  return resolved || fallback || "";
}

export function buildPhotoCaption(index: number, mode: "sequential" | "single-generic" | "none") {
  if (mode === "none") {
    return "";
  }
  if (mode === "single-generic") {
    return "Inspection photo";
  }
  return `Photo ${index + 1}`;
}
