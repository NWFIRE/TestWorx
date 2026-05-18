export const DEFAULT_OKLAHOMA_SALES_TAX_RATE = 0.0825;
export const DEFAULT_QUICKBOOKS_TAX_CODE_ID = "TAX";
export const DEFAULT_QUICKBOOKS_NON_TAX_CODE_ID = "NON";

export type InvoiceTotals = {
  taxableSubtotal: number;
  nonTaxableSubtotal: number;
  subtotalBeforeTax: number;
  discountTotal: number;
  taxTotal: number;
  totalDue: number;
  taxRate: number;
  taxCodeId: string | null;
  calculationVersion: "invoice_totals_v1";
  calculatedAt: string;
  warnings: string[];
};

export type BillingTaxLineInput = {
  quantity: number;
  unitPrice?: number | null;
  amount?: number | null;
  lineSubtotal?: number | null;
  discountAmount?: number | null;
  taxable?: boolean | null;
  taxCodeId?: string | null;
  quickBooksTaxCodeRef?: string | null;
  taxRate?: number | null;
  taxAmount?: number | null;
  lineTotal?: number | null;
  metadata?: Record<string, unknown> | null;
};

type BillingTaxOptions = {
  defaultTaxRate?: number;
  defaultTaxCodeId?: string | null;
  taxExempt?: boolean;
  calculatedAt?: Date | string;
};

export function roundMoney(value: number) {
  return Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function calculateAmount(quantity: number, unitPrice?: number | null) {
  if (typeof quantity !== "number" || !Number.isFinite(quantity)) {
    return null;
  }
  if (typeof unitPrice !== "number" || !Number.isFinite(unitPrice)) {
    return null;
  }
  return roundMoney(quantity * unitPrice);
}

function readLineDiscountAmount(item: BillingTaxLineInput) {
  return Math.max(
    0,
    readNumber(item.discountAmount)
      ?? readNumber(item.metadata?.discountAmount)
      ?? readNumber(item.metadata?.lineDiscountAmount)
      ?? 0
  );
}

function readLineTaxRate(item: BillingTaxLineInput, defaultTaxRate: number) {
  const explicitRate =
    readNumber(item.taxRate)
      ?? readNumber(item.metadata?.taxRate)
      ?? readNumber(item.metadata?.invoiceTaxRate);

  if (explicitRate === null) {
    return defaultTaxRate;
  }

  const normalizedRate = explicitRate > 1 ? explicitRate / 100 : explicitRate;
  return normalizedRate > 0 ? normalizedRate : defaultTaxRate;
}

export function calculateLineSubtotal(item: BillingTaxLineInput) {
  const grossSubtotal = typeof item.unitPrice === "number"
    ? calculateAmount(item.quantity, item.unitPrice) ?? 0
    : readNumber(item.amount) ?? readNumber(item.lineSubtotal) ?? 0;
  return roundMoney(Math.max(0, grossSubtotal - readLineDiscountAmount(item)));
}

export function calculateInvoiceLineSnapshot(
  item: BillingTaxLineInput,
  input: BillingTaxOptions = {}
) {
  const lineSubtotal = calculateLineSubtotal(item);
  const discountAmount = readLineDiscountAmount(item);
  const taxable = item.taxable === true;
  const effectiveTaxable = taxable && input.taxExempt !== true;
  const taxRate = effectiveTaxable ? readLineTaxRate(item, input.defaultTaxRate ?? DEFAULT_OKLAHOMA_SALES_TAX_RATE) : 0;
  const existingTaxAmount = effectiveTaxable ? readNumber(item.taxAmount) : 0;
  const taxAmount = effectiveTaxable
    ? roundMoney(lineSubtotal * taxRate)
    : 0;
  const taxCodeId = effectiveTaxable
    ? (
        item.taxCodeId
        ?? item.quickBooksTaxCodeRef
        ?? (typeof item.metadata?.taxCodeId === "string" ? item.metadata.taxCodeId : null)
        ?? input.defaultTaxCodeId
        ?? DEFAULT_QUICKBOOKS_TAX_CODE_ID
      )
    : DEFAULT_QUICKBOOKS_NON_TAX_CODE_ID;

  return {
    lineSubtotal,
    discountAmount,
    taxable,
    effectiveTaxable,
    taxRate,
    taxCodeId,
    taxAmount: taxRate > 0 ? taxAmount : roundMoney(existingTaxAmount ?? 0),
    lineTotal: roundMoney(lineSubtotal + (taxRate > 0 ? taxAmount : existingTaxAmount ?? 0))
  };
}

export function calculateInvoiceTotalsFromItems(
  items: BillingTaxLineInput[],
  input: BillingTaxOptions = {}
): InvoiceTotals {
  const warnings = new Set<string>();
  let taxableSubtotal = 0;
  let nonTaxableSubtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;

  for (const item of items) {
    const line = calculateInvoiceLineSnapshot(item, input);
    discountTotal += line.discountAmount;
    taxTotal += line.taxAmount;

    if (line.taxable) {
      taxableSubtotal += line.lineSubtotal;
      if (line.effectiveTaxable && line.taxRate <= 0 && line.lineSubtotal > 0) {
        warnings.add("One or more taxable lines are missing a tax rate, so sales tax is currently $0.00 until a tax rate/code is configured.");
      }
      if (line.effectiveTaxable && !line.taxCodeId && line.lineSubtotal > 0) {
        warnings.add("One or more taxable lines are missing a tax code.");
      }
    } else {
      nonTaxableSubtotal += line.lineSubtotal;
    }

    if (item.taxable === null || item.taxable === undefined) {
      warnings.add("One or more billable lines are missing a taxable/non-taxable snapshot.");
    }
  }

  const roundedTaxableSubtotal = roundMoney(taxableSubtotal);
  const roundedNonTaxableSubtotal = roundMoney(nonTaxableSubtotal);
  const subtotalBeforeTax = roundMoney(roundedTaxableSubtotal + roundedNonTaxableSubtotal);
  const roundedDiscountTotal = roundMoney(discountTotal);
  const roundedTaxTotal = roundMoney(taxTotal);

  return {
    taxableSubtotal: roundedTaxableSubtotal,
    nonTaxableSubtotal: roundedNonTaxableSubtotal,
    subtotalBeforeTax,
    discountTotal: roundedDiscountTotal,
    taxTotal: roundedTaxTotal,
    totalDue: roundMoney(subtotalBeforeTax + roundedTaxTotal),
    taxRate: input.defaultTaxRate ?? DEFAULT_OKLAHOMA_SALES_TAX_RATE,
    taxCodeId: input.defaultTaxCodeId ?? DEFAULT_QUICKBOOKS_TAX_CODE_ID,
    calculationVersion: "invoice_totals_v1",
    calculatedAt: typeof input.calculatedAt === "string"
      ? input.calculatedAt
      : (input.calculatedAt ?? new Date()).toISOString(),
    warnings: [...warnings]
  };
}

export function snapshotInvoiceLines<T extends BillingTaxLineInput>(
  items: T[],
  input: BillingTaxOptions = {}
) {
  const calculatedAt = typeof input.calculatedAt === "string"
    ? input.calculatedAt
    : (input.calculatedAt ?? new Date()).toISOString();

  return items.map((item) => {
    const line = calculateInvoiceLineSnapshot(item, input);
    return {
      ...item,
      amount: line.lineSubtotal,
      lineSubtotal: line.lineSubtotal,
      discountAmount: line.discountAmount,
      taxable: line.taxable,
      taxCodeId: line.taxCodeId,
      taxRate: line.taxRate,
      taxAmount: line.taxAmount,
      lineTotal: line.lineTotal,
      metadata: {
        ...(item.metadata ?? {}),
        invoiceLineSnapshot: {
          lineSubtotal: line.lineSubtotal,
          discountAmount: line.discountAmount,
          taxable: line.taxable,
          effectiveTaxable: line.effectiveTaxable,
          taxCodeId: line.taxCodeId,
          taxRate: line.taxRate,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
          calculationVersion: "invoice_totals_v1",
          calculatedAt,
          taxExempt: input.taxExempt === true
        }
      }
    } satisfies T & {
      amount: number;
      lineSubtotal: number;
      discountAmount: number;
      taxable: boolean;
      taxCodeId: string | null;
      taxRate: number;
      taxAmount: number;
      lineTotal: number;
      metadata: Record<string, unknown>;
    };
  });
}
