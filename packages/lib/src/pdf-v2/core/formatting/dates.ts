import { format } from "date-fns";

export function formatShortDate(value: unknown): string | undefined {
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return undefined;
  }

  return format(date, "MMM d, yyyy");
}

export function formatDateTime(value: unknown): string | undefined {
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return undefined;
  }

  return format(date, "MMM d, yyyy, h:mm a");
}
