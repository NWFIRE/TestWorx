import { cleanCustomerFacingText, humanizeText } from "./formatters";

function isPassLike(value: string) {
  return ["pass", "yes", "good", "normal", "ok", "present", "functional", "charged"].includes(value);
}

function isFailLike(value: string) {
  return ["fail", "deficiency", "damaged", "bad", "needs_repair", "open"].includes(value);
}

function formatIndicatorResult(value: unknown) {
  const normalized = cleanCustomerFacingText(value).toLowerCase();
  if (!normalized) {
    return "";
  }
  if (isPassLike(normalized)) {
    return "Pass";
  }
  if (isFailLike(normalized)) {
    return "Fail";
  }
  if (normalized === "na" || normalized === "n a") {
    return "N/A";
  }
  return humanizeText(normalized);
}

function notificationSupportsAudible(applianceType: string) {
  const normalized = applianceType.toLowerCase();
  if (!normalized) {
    return true;
  }
  if (normalized.includes("horn") || normalized.includes("speaker") || normalized.includes("bell") || normalized.includes("chime")) {
    return true;
  }
  if (normalized.includes("strobe")) {
    return false;
  }
  return true;
}

function notificationSupportsVisible(applianceType: string) {
  const normalized = applianceType.toLowerCase();
  if (!normalized) {
    return true;
  }
  return normalized.includes("strobe") || normalized.includes("visible");
}

export function buildIndicatorLines(input: {
  inspectionType: string;
  dataset: string;
  row: Record<string, unknown>;
}) {
  const lines: string[] = [];

  if (input.inspectionType === "fire_alarm" && input.dataset === "notificationAppliances") {
    const applianceType = cleanCustomerFacingText(input.row.applianceType ?? input.row.type);
    const audible = formatIndicatorResult(input.row.audibleOperation);
    const visible = formatIndicatorResult(input.row.visualOperation);

    if (notificationSupportsAudible(applianceType) && audible) {
      lines.push(`Audible operation: ${audible}`);
    }
    if (notificationSupportsVisible(applianceType) && visible) {
      lines.push(`Visible operation: ${visible}`);
    }

    return lines;
  }

  const genericMappings: Array<[string, string]> = [
    ["functionalTestResult", "Functional test"],
    ["physicalCondition", "Physical condition"],
    ["sensitivityOrOperationResult", "Sensitivity / operation"],
    ["audibleOperation", "Audible operation"],
    ["visualOperation", "Visible operation"],
    ["gaugeStatus", "Gauge status"],
    ["mountingSecure", "Mounting secure"],
    ["serviceStatus", "Service status"],
    ["physicalStatus", "Physical status"],
    ["tankCondition", "Tank condition"],
    ["sealIntact", "Seal intact"],
    ["nozzleCondition", "Nozzle condition"],
    ["inspectionResult", "Inspection result"]
  ];

  for (const [key, label] of genericMappings) {
    const formatted = formatIndicatorResult(input.row[key]);
    if (formatted) {
      lines.push(`${label}: ${formatted}`);
    }
  }

  return lines;
}
