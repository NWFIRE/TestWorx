import { cleanText } from "./text";

export type ApplianceDisplayMode = {
  showAudible: boolean;
  showVisible: boolean;
};

export function resolveNotificationApplianceDisplayMode(applianceType: unknown): ApplianceDisplayMode {
  const normalized = cleanText(applianceType)?.toLowerCase().replace(/[\s-]+/g, "_") ?? "";

  if (normalized.includes("strobe") && !normalized.includes("horn")) {
    return { showAudible: false, showVisible: true };
  }

  if (normalized.includes("horn") && !normalized.includes("strobe")) {
    return { showAudible: true, showVisible: false };
  }

  if (normalized.includes("horn") && normalized.includes("strobe")) {
    return { showAudible: true, showVisible: true };
  }

  return { showAudible: true, showVisible: true };
}
