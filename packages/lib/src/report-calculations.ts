import type { ReportPrimitiveValue } from "./report-config";

export type ReportCalculationKey =
  | "nextHydroFromLastHydro"
  | "nextSixYearFromLastSixYear"
  | "inspectionIntervalFromServiceType"
  | "extinguisherUlRatingFromType"
  | "nextHydroYearFromExtinguisher"
  | "assetCountFromRepeater"
  | "allRowsEqual"
  | "sumNumberFieldFromRepeater"
  | "passFailFromNumberThreshold"
  | "countRowsMatchingAnyValues"
  | "countFieldsMatchingValues"
  | "sumFields"
  | "booleanFromNumberThreshold"
  | "firstNonEmptyValue"
  | "kitchenSuppressionInspectionCodeFromManufacturer";

export type ReportCalculationContext = {
  sourceValue?: ReportPrimitiveValue;
  sourceRows?: Array<Record<string, ReportPrimitiveValue>>;
  sourceValues?: ReportPrimitiveValue[];
  rowFieldId?: string;
  rowFieldIds?: string[];
  equals?: ReportPrimitiveValue;
  emptyValue?: ReportPrimitiveValue;
  values?: ReportPrimitiveValue[];
  passAtOrAbove?: number;
  attentionAtOrAbove?: number;
  atOrAbove?: number;
};

function formatIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addYears(sourceValue: ReportPrimitiveValue, years: number) {
  if (typeof sourceValue !== "string" || !sourceValue) {
    return "";
  }

  const parsed = new Date(sourceValue);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  parsed.setUTCFullYear(parsed.getUTCFullYear() + years);
  return formatIsoDate(parsed);
}

function coerceString(value: ReportPrimitiveValue | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKitchenSuppressionManufacturer(value: ReportPrimitiveValue | undefined) {
  return coerceString(value).toLowerCase();
}

export function normalizeTwoDigitYear(value: ReportPrimitiveValue | undefined) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  const raw = String(value).trim();
  const fourDigitYear = raw.match(/\b(19|20)\d{2}\b/);
  if (fourDigitYear) {
    return fourDigitYear[0].slice(-2);
  }

  const digits = raw.match(/\d+/g)?.join("") ?? "";
  if (!digits) {
    return "";
  }

  return digits.slice(-2);
}

export function isValidTwoDigitYear(value: ReportPrimitiveValue | undefined) {
  return /^\d{2}$/.test(normalizeTwoDigitYear(value));
}

export function twoDigitYearToFullYear(value: ReportPrimitiveValue | undefined) {
  const normalized = normalizeTwoDigitYear(value);
  if (!/^\d{2}$/.test(normalized)) {
    return null;
  }

  const year = Number.parseInt(normalized, 10);
  return year >= 70 ? 1900 + year : 2000 + year;
}

export function fullYearToTwoDigitYear(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }

  return String(Math.trunc(value)).slice(-2).padStart(2, "0");
}

function normalizeExtinguisherType(value: ReportPrimitiveValue | undefined) {
  return coerceString(value).toLowerCase();
}

export function getExtinguisherUlRating(value: ReportPrimitiveValue | undefined) {
  switch (normalizeExtinguisherType(value)) {
    case "2.5 lb abc":
      return "1-A:10-B:C";
    case "5 lb abc":
      return "3-A:40-B:C";
    case "10 lb abc":
      return "4-A:80-B:C";
    case "20 lb abc":
      return "10-A:120-B:C";
    case "5 lb co2":
      return "5-B:C";
    case "10 lb co2":
    case "15 lb co2":
      return "10-B:C";
    case "20 lb co2":
      return "20-B:C";
    case "1.5 gal water":
    case "2.5 gal water":
      return "2-A";
    case "6l wet chemical":
    case "class k":
      return "K";
    default:
      return "";
  }
}

export function getHydroIntervalYearsForExtinguisherType(value: ReportPrimitiveValue | undefined) {
  const normalized = normalizeExtinguisherType(value);

  if (normalized.includes("co2") || normalized.includes("water") || normalized.includes("wet chemical") || normalized.includes("class k")) {
    return 5;
  }

  return 12;
}

export function calculateNextHydroYear(lastHydro: ReportPrimitiveValue | undefined, extinguisherType: ReportPrimitiveValue | undefined) {
  const lastHydroYear = twoDigitYearToFullYear(lastHydro);
  if (lastHydroYear === null) {
    return "";
  }

  return fullYearToTwoDigitYear(lastHydroYear + getHydroIntervalYearsForExtinguisherType(extinguisherType));
}

export const reportCalculationHelpers = {
  nextHydroFromLastHydro: ({ sourceValue }: ReportCalculationContext) => addYears(sourceValue ?? "", 12),
  nextSixYearFromLastSixYear: ({ sourceValue }: ReportCalculationContext) => addYears(sourceValue ?? "", 6),
  inspectionIntervalFromServiceType: ({ sourceValue }: ReportCalculationContext) => {
    switch (sourceValue) {
      case "hydro":
        return "12 years";
      case "six_year":
        return "6 years";
      case "maintenance":
        return "Annual";
      default:
        return "Monthly";
    }
  },
  extinguisherUlRatingFromType: ({ sourceValues }: ReportCalculationContext) => {
    const [extinguisherType, existingUlRating] = sourceValues ?? [];
    return getExtinguisherUlRating(extinguisherType) || coerceString(existingUlRating);
  },
  nextHydroYearFromExtinguisher: ({ sourceValues }: ReportCalculationContext) => {
    const [lastHydro, extinguisherType, existingNextHydro] = sourceValues ?? [];
    return calculateNextHydroYear(lastHydro, extinguisherType) || normalizeTwoDigitYear(existingNextHydro);
  },
  assetCountFromRepeater: ({ sourceRows }: ReportCalculationContext) => sourceRows?.length ?? 0,
  allRowsEqual: ({ sourceRows, rowFieldId, equals, emptyValue }: ReportCalculationContext) => {
    if (!sourceRows || sourceRows.length === 0 || !rowFieldId) {
      return emptyValue ?? false;
    }

    return sourceRows.every((row) => row[rowFieldId] === equals);
  },
  sumNumberFieldFromRepeater: ({ sourceRows, rowFieldId }: ReportCalculationContext) => {
    if (!sourceRows || sourceRows.length === 0 || !rowFieldId) {
      return 0;
    }

    return sourceRows.reduce((total, row) => {
      const value = row[rowFieldId];
      return typeof value === "number" ? total + value : total;
    }, 0);
  },
  passFailFromNumberThreshold: ({ sourceValue, passAtOrAbove, attentionAtOrAbove }: ReportCalculationContext) => {
    if (typeof sourceValue !== "number") {
      return "";
    }

    if (typeof passAtOrAbove === "number" && sourceValue >= passAtOrAbove) {
      return "pass";
    }

    if (typeof attentionAtOrAbove === "number" && sourceValue >= attentionAtOrAbove) {
      return "attention";
    }

    return "fail";
  },
  countRowsMatchingAnyValues: ({ sourceRows, rowFieldIds, values }: ReportCalculationContext) => {
    if (!sourceRows || sourceRows.length === 0 || !rowFieldIds || rowFieldIds.length === 0 || !values || values.length === 0) {
      return 0;
    }

    return sourceRows.reduce((count, row) => {
      const matches = rowFieldIds.some((rowFieldId) => values.includes(row[rowFieldId] ?? null));
      return matches ? count + 1 : count;
    }, 0);
  },
  countFieldsMatchingValues: ({ sourceValues, values }: ReportCalculationContext) => {
    if (!sourceValues || sourceValues.length === 0 || !values || values.length === 0) {
      return 0;
    }

    return sourceValues.reduce<number>((count, value) => (values.includes(value) ? count + 1 : count), 0);
  },
  sumFields: ({ sourceValues }: ReportCalculationContext) => {
    if (!sourceValues || sourceValues.length === 0) {
      return 0;
    }

    return sourceValues.reduce<number>((total, value) => (typeof value === "number" ? total + value : total), 0);
  },
  booleanFromNumberThreshold: ({ sourceValue, atOrAbove }: ReportCalculationContext) => {
    if (typeof sourceValue !== "number" || typeof atOrAbove !== "number") {
      return false;
    }

    return sourceValue >= atOrAbove;
  },
  firstNonEmptyValue: ({ sourceValues }: ReportCalculationContext) => {
    if (!sourceValues || sourceValues.length === 0) {
      return "";
    }

    for (const value of sourceValues) {
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }

    return "";
  },
  kitchenSuppressionInspectionCodeFromManufacturer: ({ sourceValues }: ReportCalculationContext) => {
    const [manufacturer, manufacturerOther] = sourceValues ?? [];
    const normalized = normalizeKitchenSuppressionManufacturer(manufacturerOther) || normalizeKitchenSuppressionManufacturer(manufacturer);

    if (["guardian", "denlar"].includes(normalized)) {
      return "KS-INSPECTION-GUARDIAN/DENLAR";
    }

    if (normalized === "captiveaire") {
      return "KS-INSPECTION-CAPTIVEAIRE";
    }

    return "KS-INSPECTION";
  }
} satisfies Record<ReportCalculationKey, (input: ReportCalculationContext) => ReportPrimitiveValue>;

export function runCalculation(key: ReportCalculationKey, input: ReportCalculationContext) {
  return reportCalculationHelpers[key](input);
}
