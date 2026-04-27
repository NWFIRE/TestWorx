import { inspectionTypeRegistry, type BrowserInspectionType } from "./inspection-types-shared";

export const inspectionClassificationValues = [
  "standard",
  "call_in",
  "follow_up",
  "emergency"
] as const;

export const editableInspectionStatuses = [
  "to_be_completed",
  "scheduled",
  "in_progress",
  "completed",
  "invoiced",
  "cancelled",
  "follow_up_required"
] as const;

export const inspectionTaskSchedulingStatuses = [
  "due_now",
  "scheduled_now",
  "scheduled_future",
  "not_scheduled",
  "completed",
  "deferred"
] as const;

export const genericInspectionSiteOptionValue = "__generic_site__";
export const genericInspectionSiteName = "General / No Fixed Site";
export const noFixedInspectionSiteLabel = "No site needed";
export const customInspectionSiteOptionValue = "__custom_site__";
export const customInspectionSiteName = "Create one-time site";

const nonDisplayableSiteLabels = new Set([
  genericInspectionSiteName.toLowerCase(),
  "no fixed service address",
  "no fixed service address on file"
]);

export function isUserFacingSiteLabel(siteName: string | null | undefined) {
  const normalized = (siteName ?? "").trim();
  return Boolean(normalized && !nonDisplayableSiteLabels.has(normalized.toLowerCase()));
}

export function getCustomerFacingSiteLabel(siteName: string | null | undefined) {
  const normalized = (siteName ?? "").trim();
  return isUserFacingSiteLabel(normalized) ? normalized : null;
}

export const inspectionStatusLabels = {
  to_be_completed: "To Be Completed",
  scheduled: "To Be Completed",
  in_progress: "In Progress",
  completed: "Completed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
  follow_up_required: "Follow-Up Required",
  past_due: "Past Due"
} as const;

const inspectionClassificationLabels = {
  standard: "Standard",
  call_in: "Call-In",
  follow_up: "Follow-Up",
  emergency: "Emergency"
} as const;

export function defaultScheduledStartForMonth(monthValue: string, existingValue?: string | null) {
  const [yearText, monthText] = monthValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return existingValue ?? "";
  }

  const timePortion = existingValue?.includes("T") ? existingValue.split("T")[1] : "09:00";
  const safeTime = timePortion && timePortion.length >= 5 ? timePortion.slice(0, 5) : "09:00";
  return `${yearText}-${monthText}-01T${safeTime}`;
}

export function formatInspectionTaskTypeLabel(inspectionType: BrowserInspectionType) {
  return inspectionTypeRegistry[inspectionType].label;
}

export function formatInspectionTaskSchedulingStatusLabel(status: (typeof inspectionTaskSchedulingStatuses)[number]) {
  switch (status) {
    case "due_now":
      return "Due now";
    case "scheduled_now":
      return "Schedule for this visit";
    case "scheduled_future":
      return "Scheduled for future";
    case "not_scheduled":
      return "Track for later";
    case "completed":
      return "Completed";
    case "deferred":
      return "Deferred";
    default:
      return String(status).replaceAll("_", " ");
  }
}

export function formatInspectionClassificationLabel(classification: (typeof inspectionClassificationValues)[number]) {
  return inspectionClassificationLabels[classification];
}

export function formatInspectionStatusLabel(status: keyof typeof inspectionStatusLabels) {
  return inspectionStatusLabels[status];
}

export function getInspectionStatusTone(status: keyof typeof inspectionStatusLabels) {
  switch (status) {
    case "completed":
    case "invoiced":
      return "emerald" as const;
    case "follow_up_required":
    case "past_due":
      return "amber" as const;
    case "cancelled":
      return "rose" as const;
    case "scheduled":
    case "in_progress":
      return "blue" as const;
    case "to_be_completed":
    default:
      return "slate" as const;
  }
}
