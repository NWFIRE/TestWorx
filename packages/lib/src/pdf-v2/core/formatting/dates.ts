import { formatTenantDate, formatTenantDateTime } from "../../../timezone";

export function formatShortDate(value: unknown, timezone?: string | null): string | undefined {
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return undefined;
  }

  const calendarDate = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  return formatTenantDate(date, calendarDate ? "UTC" : timezone, "") || undefined;
}

export function formatDateTime(value: unknown, timezone?: string | null): string | undefined {
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return undefined;
  }

  return formatTenantDateTime(date, timezone, "") || undefined;
}
