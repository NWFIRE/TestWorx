"use client";

import { useMemo, useState, useTransition } from "react";

import { ActionButton } from "@/app/action-button";
import { SearchInput } from "@/app/search-input";
import { useToast } from "@/app/toast-provider";

type QuoteCatalogItem = {
  code: string;
  title: string;
  description: string;
  category: string;
  inspectionType: string | null;
  inspectionTypeLabel: string | null;
  source?: "internal" | "quickbooks";
  quickbooksItemId?: string;
  quickbooksItemType?: string;
  unitPrice?: number | null;
};

type CustomerOption = {
  id: string;
  name: string;
  contactName: string | null;
  billingEmail: string | null;
};

type SiteOption = {
  id: string;
  name: string;
  city: string;
  customerCompanyId: string;
};

type QuoteProposalTypeOption = {
  value: string;
  label: string;
};

type QuoteLineValue = {
  id?: string;
  internalCode: string;
  title: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxable: boolean;
  inspectionType: string | null;
  category: string | null;
};

type QuoteFormValue = {
  customerCompanyId: string;
  siteId: string;
  contactName: string;
  recipientEmail: string;
  proposalType: string;
  issuedAt: string;
  expiresAt: string;
  internalNotes: string;
  customerNotes: string;
  taxAmount: number;
  lineItems: QuoteLineValue[];
};

function emptyLine(): QuoteLineValue {
  return {
    internalCode: "",
    title: "",
    description: "",
    quantity: 1,
    unitPrice: 0,
    discountAmount: 0,
    taxable: false,
    inspectionType: null,
    category: null
  };
}

function toCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

function formatCatalogOptionLabel(item: QuoteCatalogItem) {
  if (item.source === "quickbooks") {
    const typeLabel = item.quickbooksItemType ? ` · ${item.quickbooksItemType}` : "";
    const priceLabel = item.unitPrice !== null && item.unitPrice !== undefined ? ` · $${item.unitPrice.toFixed(2)}` : "";
    return `${item.title}${typeLabel}${priceLabel}`;
  }

  return `${item.title} (${item.code})`;
}

export function QuoteEditorForm({
  action,
  submitLabel,
  submitPendingLabel,
  customers,
  sites,
  catalog,
  proposalTypes,
  initialValue,
  quoteId,
  onResult
}: {
  action: (formData: FormData) => Promise<unknown>;
  submitLabel: string;
  submitPendingLabel?: string;
  customers: CustomerOption[];
  sites: SiteOption[];
  catalog: QuoteCatalogItem[];
  proposalTypes: QuoteProposalTypeOption[];
  initialValue: QuoteFormValue;
  quoteId?: string;
  onResult?: (result: unknown) => void;
}) {
  const [value, setValue] = useState<QuoteFormValue>(initialValue);
  const [catalogQueries, setCatalogQueries] = useState<string[]>(() =>
    initialValue.lineItems.map((line) => {
      const matchedCatalogItem = catalog.find((item) => item.code === line.internalCode);
      return matchedCatalogItem ? formatCatalogOptionLabel(matchedCatalogItem) : line.title;
    })
  );
  const [activeCatalogIndex, setActiveCatalogIndex] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();

  const availableSites = useMemo(
    () => sites.filter((site) => !value.customerCompanyId || site.customerCompanyId === value.customerCompanyId),
    [sites, value.customerCompanyId]
  );

  const subtotal = useMemo(
    () =>
      value.lineItems.reduce(
        (sum, line) => sum + Math.max(0, line.quantity * line.unitPrice - line.discountAmount),
        0
      ),
    [value.lineItems]
  );
  const total = subtotal + (value.taxAmount || 0);

  function updateLine(index: number, patch: Partial<QuoteLineValue>) {
    setValue((current) => ({
      ...current,
      lineItems: current.lineItems.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              ...patch
            }
          : line
      )
    }));
  }

  function setCatalogQuery(index: number, query: string) {
    setCatalogQueries((current) => current.map((value, queryIndex) => (queryIndex === index ? query : value)));
  }

  function appendLine() {
    setValue((current) => ({ ...current, lineItems: [...current.lineItems, emptyLine()] }));
    setCatalogQueries((current) => [...current, ""]);
    setActiveCatalogIndex(value.lineItems.length);
  }

  function removeLine(index: number) {
    setValue((current) => ({
      ...current,
      lineItems: current.lineItems.filter((_, lineIndex) => lineIndex !== index)
    }));
    setCatalogQueries((current) => current.filter((_, queryIndex) => queryIndex !== index));
    setActiveCatalogIndex((current) => {
      if (current === null) {
        return null;
      }
      if (current === index) {
        return null;
      }
      return current > index ? current - 1 : current;
    });
  }

  function moveLine(index: number, direction: -1 | 1) {
    setValue((current) => {
      const swapIndex = index + direction;
      const next = [...current.lineItems];
      const currentLine = next[index];
      const adjacentLine = next[swapIndex];
      if (!currentLine || !adjacentLine) {
        return current;
      }
      next[index] = adjacentLine;
      next[swapIndex] = currentLine;
      return { ...current, lineItems: next };
    });
    setCatalogQueries((current) => {
      const swapIndex = index + direction;
      const next = [...current];
      const currentQuery = next[index];
      const adjacentQuery = next[swapIndex];
      if (currentQuery === undefined || adjacentQuery === undefined) {
        return current;
      }
      next[index] = adjacentQuery;
      next[swapIndex] = currentQuery;
      return next;
    });
    setActiveCatalogIndex((current) => {
      if (current === index) {
        return index + direction;
      }
      if (current === index + direction) {
        return index;
      }
      return current;
    });
  }

  function applyCatalogSelection(index: number, code: string) {
    const match = catalog.find((item) => item.code === code);
    setCatalogQuery(index, match ? formatCatalogOptionLabel(match) : "");
    updateLine(index, {
      internalCode: code,
      title: match?.title ?? "",
      description: match?.description ?? "",
      unitPrice: typeof match?.unitPrice === "number" ? match.unitPrice : 0,
      inspectionType: match?.inspectionType ?? null,
      category: match?.category ?? null
    });
    setActiveCatalogIndex(null);
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await action(formData);
          if (result && typeof result === "object" && "ok" in result) {
            const actionResult = result as { ok?: boolean; message?: string | null; error?: string | null };
            if (actionResult.ok) {
              showToast({ title: actionResult.message ?? "Quote updated", tone: "success" });
            } else if (actionResult.error) {
              showToast({ title: actionResult.error, tone: "error" });
            }
          }
          onResult?.(result);
        });
      }}
    >
      {quoteId ? <input name="quoteId" type="hidden" value={quoteId} /> : null}
      <input name="lineItemsJson" type="hidden" value={JSON.stringify(value.lineItems)} />

      <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Customer</span>
              <select
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                name="customerCompanyId"
                onChange={(event) => {
                  const customer = customers.find((item) => item.id === event.target.value);
                  setValue((current) => ({
                    ...current,
                    customerCompanyId: event.target.value,
                    siteId: "",
                    contactName: customer?.contactName ?? current.contactName,
                    recipientEmail: customer?.billingEmail ?? current.recipientEmail
                  }));
                }}
                value={value.customerCompanyId}
              >
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Site</span>
              <select
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                name="siteId"
                onChange={(event) => setValue((current) => ({ ...current, siteId: event.target.value }))}
                value={value.siteId}
              >
                <option value="">No site selected</option>
                {availableSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}{site.city ? ` - ${site.city}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Customer contact</span>
              <input
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                name="contactName"
                onChange={(event) => setValue((current) => ({ ...current, contactName: event.target.value }))}
                value={value.contactName}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Recipient email</span>
              <input
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                name="recipientEmail"
                onChange={(event) => setValue((current) => ({ ...current, recipientEmail: event.target.value }))}
                type="email"
                value={value.recipientEmail}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Quote type</span>
              <select
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                name="proposalType"
                onChange={(event) => setValue((current) => ({ ...current, proposalType: event.target.value }))}
                value={value.proposalType}
              >
                <option value="">Auto-detect from line items</option>
                {proposalTypes.map((proposalType) => (
                  <option key={proposalType.value} value={proposalType.value}>
                    {proposalType.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Issue date</span>
              <input
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                name="issuedAt"
                onChange={(event) => setValue((current) => ({ ...current, issuedAt: event.target.value }))}
                type="date"
                value={value.issuedAt}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Expiry date</span>
              <input
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                name="expiresAt"
                onChange={(event) => setValue((current) => ({ ...current, expiresAt: event.target.value }))}
                type="date"
                value={value.expiresAt}
              />
            </label>
          </div>
      </section>

      <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
          <div className="mb-4">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Line items</h2>
            <p className="mt-1 text-sm text-slate-500">Type to search TradeWorx services and imported QuickBooks products, then refine description, pricing, and quantity.</p>
          </div>

          <div className="space-y-4">
            {value.lineItems.map((line, index) => {
              const lineTotal = Math.max(0, line.quantity * line.unitPrice - line.discountAmount);
              const normalizedQuery = (catalogQueries[index] ?? "").trim().toLowerCase();
              const filteredCatalog = normalizedQuery.length === 0
                ? catalog.slice(0, 8)
                : catalog.filter((item) => {
                    const haystack = [
                      item.title,
                      item.code,
                      item.description,
                      item.quickbooksItemType,
                      item.quickbooksItemId,
                      item.category,
                      item.inspectionTypeLabel
                    ]
                      .filter(Boolean)
                      .join(" ")
                      .toLowerCase();
                    return haystack.includes(normalizedQuery);
                  }).slice(0, 8);
              const showCatalogResults = activeCatalogIndex === index && filteredCatalog.length > 0;

              return (
                <div key={line.id ?? `${line.internalCode}-${index}`} className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
                  <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_0.7fr_0.7fr_auto]">
                    <div className="relative">
                      <label className="block">
                        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Item search</span>
                        <SearchInput
                          clearable={false}
                          onBlur={() => {
                            window.setTimeout(() => setActiveCatalogIndex((current) => (current === index ? null : current)), 120);
                          }}
                          onChange={(event) => {
                            const nextQuery = event.target.value;
                            setCatalogQuery(index, nextQuery);
                            setActiveCatalogIndex(index);

                            if (!nextQuery.trim()) {
                              updateLine(index, {
                                internalCode: "",
                                inspectionType: null,
                                category: null
                              });
                            }
                          }}
                          onFocus={() => setActiveCatalogIndex(index)}
                          placeholder="Type to search products and services"
                          value={catalogQueries[index] ?? ""}
                        />
                      </label>
                      {showCatalogResults ? (
                        <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,0.14)]">
                          {filteredCatalog.map((item) => (
                            <button
                              key={item.code}
                              className="flex w-full items-start justify-between gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-slate-50"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                applyCatalogSelection(index, item.code);
                              }}
                              type="button"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                                <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                  {item.source === "quickbooks"
                                    ? `${item.quickbooksItemType ?? "QuickBooks item"}${item.description ? ` · ${item.description}` : ""}`
                                    : `${item.code}${item.description ? ` · ${item.description}` : ""}`}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                  {item.source === "quickbooks" ? "QuickBooks" : "TradeWorx"}
                                </p>
                                {item.unitPrice !== null && item.unitPrice !== undefined ? (
                                  <p className="mt-1 text-sm font-semibold text-slate-700">{toCurrency(item.unitPrice)}</p>
                                ) : null}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Title</span>
                      <input
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                        onChange={(event) => updateLine(index, { title: event.target.value })}
                        value={line.title}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Quantity</span>
                      <input
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                        onChange={(event) => updateLine(index, { quantity: Number(event.target.value || "0") })}
                        step="0.01"
                        type="number"
                        value={line.quantity}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Unit price</span>
                      <input
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                        onChange={(event) => updateLine(index, { unitPrice: Number(event.target.value || "0") })}
                        step="0.01"
                        type="number"
                        value={line.unitPrice}
                      />
                    </label>

                    <div className="flex items-end">
                      <button
                        className="inline-flex min-h-11 items-center rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                        onClick={(event) => {
                          event.preventDefault();
                          removeLine(index);
                        }}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_0.55fr_0.65fr_auto_auto]">
                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Description</span>
                      <textarea
                        className="min-h-40 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-900"
                        onChange={(event) => updateLine(index, { description: event.target.value })}
                        rows={5}
                        value={line.description}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Discount</span>
                      <input
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                        onChange={(event) => updateLine(index, { discountAmount: Number(event.target.value || "0") })}
                        step="0.01"
                        type="number"
                        value={line.discountAmount}
                      />
                    </label>

                    <label className="flex items-center gap-2 pt-8 text-sm text-slate-600">
                      <input
                        checked={line.taxable}
                        onChange={(event) => updateLine(index, { taxable: event.target.checked })}
                        type="checkbox"
                      />
                      Taxable
                    </label>

                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Line total</p>
                      <p className="mt-1 text-lg font-semibold text-slate-950">{toCurrency(lineTotal)}</p>
                    </div>

                    <div className="flex gap-2 pt-8">
                      <button
                        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                        disabled={index === 0}
                        onClick={(event) => {
                          event.preventDefault();
                          moveLine(index, -1);
                        }}
                        type="button"
                      >
                        ↑
                      </button>
                      <button
                        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                        disabled={index === value.lineItems.length - 1}
                        onClick={(event) => {
                          event.preventDefault();
                          moveLine(index, 1);
                        }}
                        type="button"
                      >
                        ↓
                      </button>
                    </div>
                  </div>

                  {line.inspectionType ? (
                    <p className="mt-3 text-sm text-slate-500">
                      Converts into operational work as <span className="font-medium text-slate-700">{catalog.find((item) => item.code === line.internalCode)?.inspectionTypeLabel ?? line.inspectionType}</span>.
                    </p>
                  ) : null}

                  {index === value.lineItems.length - 1 ? (
                    <div className="mt-4 flex justify-start">
                      <button
                        className="inline-flex min-h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        onClick={(event) => {
                          event.preventDefault();
                          appendLine();
                        }}
                        type="button"
                      >
                        Add line item
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
      </section>

      <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Customer-facing notes</span>
              <textarea
                className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                name="customerNotes"
                onChange={(event) => setValue((current) => ({ ...current, customerNotes: event.target.value }))}
                value={value.customerNotes}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Internal notes</span>
              <textarea
                className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                name="internalNotes"
                onChange={(event) => setValue((current) => ({ ...current, internalNotes: event.target.value }))}
                value={value.internalNotes}
              />
            </label>
          </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Totals</p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <span className="font-semibold text-slate-950">{toCurrency(subtotal)}</span>
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Tax amount</span>
              <input
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                name="taxAmount"
                onChange={(event) => setValue((current) => ({ ...current, taxAmount: Number(event.target.value || "0") }))}
                step="0.01"
                type="number"
                value={value.taxAmount}
              />
            </label>
            <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-950">
              <span>Total</span>
              <span>{toCurrency(total)}</span>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200/80 bg-[#0f172a] p-6 text-white shadow-[0_16px_44px_rgba(15,23,42,0.14)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/60">Quote workflow</p>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Keep services structured from day one.</h3>
          <p className="mt-3 text-sm leading-7 text-white/75">
            Line items use stable internal codes so sending, QuickBooks sync, and operational conversion stay aligned.
          </p>
          <ActionButton className="mt-6 min-h-12 w-full bg-white text-slate-950 hover:bg-slate-100" pending={pending} pendingLabel={submitPendingLabel ?? "Saving..."} type="submit">
            {submitLabel}
          </ActionButton>
        </section>
      </div>
    </form>
  );
}
