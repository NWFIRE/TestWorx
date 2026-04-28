export const DEFAULT_TENANT_TIMEZONE = "America/Chicago";

export const tenantTimezoneOptions = [
  { value: "America/New_York", label: "Eastern Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Phoenix", label: "Arizona Time" },
  { value: "America/Los_Angeles", label: "Pacific Time" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
  { value: "UTC", label: "UTC" }
] as const;

export function normalizeTenantTimezone(value: string | null | undefined) {
  const timezone = value?.trim() || DEFAULT_TENANT_TIMEZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_TENANT_TIMEZONE;
  }
}

function parseDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatTenantDate(
  value: Date | string | null | undefined,
  timezone?: string | null,
  fallback = "—"
) {
  const parsed = parseDate(value);
  if (!parsed) {
    return fallback;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: normalizeTenantTimezone(timezone)
  }).format(parsed);
}

export function formatTenantDateTime(
  value: Date | string | null | undefined,
  timezone?: string | null,
  fallback = "—"
) {
  const parsed = parseDate(value);
  if (!parsed) {
    return fallback;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: normalizeTenantTimezone(timezone)
  }).format(parsed);
}
