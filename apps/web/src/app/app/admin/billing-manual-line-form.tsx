"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ActionButton } from "@/app/action-button";
import { SearchSelect, type SearchSelectOption } from "@/app/search-select";
import { useToast } from "@/app/toast-provider";

type CatalogItem = {
  id: string;
  quickbooksItemId: string;
  name: string;
  sku: string | null;
  itemType: string;
  description: string | null;
  unitPrice: number | null;
  taxable: boolean;
};

function formatItemType(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function buildCatalogSecondaryLabel(item: CatalogItem) {
  return [
    formatItemType(item.itemType),
    item.description,
    item.sku ? `SKU ${item.sku}` : null,
    item.taxable ? "Taxable" : "Non-taxable",
    item.quickbooksItemId ? `QB ${item.quickbooksItemId}` : null,
    item.quickbooksItemId ? "QuickBooks mapped" : "No QuickBooks mapping"
  ].filter(Boolean).join(" | ");
}

function formatQuantityInputValue(quantity: number) {
  if (quantity <= 0) {
    return "";
  }

  return Number.isInteger(quantity) ? String(quantity) : String(Number(quantity.toFixed(2)));
}

function parseQuantityInputValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0.01, Number(parsed.toFixed(2))) : 1;
}

export function BillingManualLineForm({
  action,
  catalogItems,
  disabled,
  inspectionId,
  summaryId
}: {
  action: (formData: FormData) => Promise<{ ok: boolean; error: string | null }>;
  catalogItems: CatalogItem[];
  disabled: boolean;
  inspectionId: string;
  summaryId: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [catalogItemId, setCatalogItemId] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState("");
  const selectedCatalogItem = catalogItems.find((item) => item.id === catalogItemId) ?? null;
  const catalogOptions = useMemo<SearchSelectOption[]>(
    () => catalogItems.map((item) => ({
      value: item.id,
      label: item.name,
      secondaryLabel: buildCatalogSecondaryLabel(item),
      badge: item.quickbooksItemId ? "QB mapped" : "Unmapped"
    })),
    [catalogItems]
  );

  function applyCatalogSelection(nextCatalogItemId: string) {
    const item = catalogItems.find((candidate) => candidate.id === nextCatalogItemId) ?? null;
    setCatalogItemId(nextCatalogItemId);
    setDescription(item?.name ?? "");
    setUnitPrice(typeof item?.unitPrice === "number" ? item.unitPrice.toFixed(2) : "");
  }

  return (
    <section className="rounded-[2rem] bg-white p-6 shadow-panel">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Additional line items</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Add billing work not tied to a report</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Add parts, labor, services, or fees directly to this inspection invoice. These lines use the products/services catalog and let QuickBooks apply final pricing when synced.
          </p>
        </div>
      </div>

      <form
        className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_1fr_0.4fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled) {
            return;
          }

          const formData = new FormData(event.currentTarget);
          startTransition(async () => {
            const result = await action(formData);
            if (result.ok) {
              setCatalogItemId("");
              setDescription("");
              setQuantity(1);
              setUnitPrice("");
              router.refresh();
              showToast({ title: "Line item added.", tone: "success" });
            } else {
              showToast({ title: result.error ?? "Unable to add line item.", tone: "error" });
            }
          });
        }}
      >
        <input name="summaryId" type="hidden" value={summaryId} />
        <input name="inspectionId" type="hidden" value={inspectionId} />
        <input name="catalogItemId" type="hidden" value={catalogItemId} />
        <input name="unitPrice" type="hidden" value={unitPrice} />

        <SearchSelect
          customValue={selectedCatalogItem?.name ?? ""}
          disabled={disabled}
          emptyText="No active products or services matched that search."
          label="Product / service"
          onChange={applyCatalogSelection}
          options={catalogOptions}
          placeholder="Search catalog"
          value={catalogItemId}
        />

        <label className="block text-sm text-slate-600">
          Description
          <input
            className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3 disabled:bg-slate-50"
            disabled={disabled}
            name="description"
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Invoice line description"
            value={description}
          />
        </label>

        <label className="block text-sm text-slate-600">
          Quantity
          <input
            className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3 disabled:bg-slate-50"
            disabled={disabled}
            inputMode="decimal"
            min="0.01"
            name="quantity"
            onChange={(event) => setQuantity(parseQuantityInputValue(event.target.value))}
            placeholder="1"
            step="0.01"
            type="number"
            value={formatQuantityInputValue(quantity)}
          />
        </label>

        <div className="flex items-end">
          <ActionButton
            className="w-full"
            disabled={disabled || !catalogItemId}
            pending={pending}
            pendingLabel="Adding"
            tone="primary"
            type="submit"
          >
            Add line
          </ActionButton>
        </div>
      </form>
    </section>
  );
}
