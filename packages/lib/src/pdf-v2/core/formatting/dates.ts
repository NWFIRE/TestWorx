import { formatTenantDate, formatTenantDateTime } from "../../../timezone";

export function formatShortDate(value: unknown, timezone?: string | null): string | undefined {
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return undefined;
  }

  return formatTenantDate(date, timezone, "") || undefined;
}

export function formatDateTime(value: unknown, timezone?: string | null): string | undefined {
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return undefined;
  }

  return formatTenantDateTime(date, timezone, "") || undefined;
}
