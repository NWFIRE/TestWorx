import type { JsonValue } from "./json-types";
import type { BillableItem } from "./inspection-billing";

export function billingReviewFingerprint(items: BillableItem[]) {
  return JSON.stringify(items.map((item) => ({
    id: item.id, quantity: item.quantity, description: item.description, category: item.category,
    catalog: item.linkedCatalogItemId ?? null, taxable: item.taxable ?? null,
    sourceQuantity: item.metadata?.sourceQuantity ?? item.quantity,
    sourceMissing: item.metadata?.sourceMissing === true
  })).sort((a, b) => a.id.localeCompare(b.id)));
}

export function excludedBillingItemIds(snapshot: JsonValue | null | undefined): string[] {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [];
  const ids = snapshot.billingReviewExcludedItemIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

export function withExcludedBillingItems(snapshot: JsonValue | null | undefined, ids: string[]): JsonValue {
  const base = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot : {};
  return { ...base, billingReviewExcludedItemIds: [...new Set([...excludedBillingItemIds(snapshot), ...ids])] };
}

export function validateBillingLineEdit(quantity: number, description?: string, category?: string) {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Enter a quantity greater than zero.");
  if (description !== undefined && (!description.trim() || description.trim().length > 2000)) {
    throw new Error("Enter a description between 1 and 2,000 characters.");
  }
  if (category !== undefined && !["service", "material", "labor", "fee"].includes(category)) {
    throw new Error("Select a valid billing category.");
  }
}
