"use client";

import { useMemo, useState } from "react";

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

export function QuoteEditorForm({
  action,
  submitLabel,
  customers,
  sites,
  catalog,
  initialValue,
  quoteId
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  customers: CustomerOption[];
  sites: SiteOption[];
  catalog: QuoteCatalogItem[];
  initialValue: QuoteFormValue;
  quoteId?: string;
}) {
  const [value, setValue] = useState<QuoteFormValue>(initialValue);

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

  function applyCatalogSelection(index: number, code: string) {
    const match = catalog.find((item) => item.code === code);
    updateLine(index, {
      internalCode: code,
      title: match?.title ?? "",
      description: match?.description ?? "",
      unitPrice: typeof match?.unitPrice === "number" ? match.unitPrice : 0,
      inspectionType: match?.inspectionType ?? null,
      category: match?.category ?? null
    });
  }

  return (
    <form action={action} className="grid gap-6 xl:grid-cols-[1.45fr_0.75fr]">
      {quoteId ? <input name="quoteId" type="hidden" value={quoteId} /> : null}
      <input name="lineItemsJson" type="hidden" value={JSON.stringify(value.lineItems)} />

      <div className="space-y-6">
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
                    {site.name}{site.city ? ` — ${site.city}` : ""}
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
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Line items</h2>
              <p className="mt-1 text-sm text-slate-500">Choose from internal services or imported QuickBooks products and services, then refine description, pricing, and quantity.</p>
            </div>
            <button
              className="inline-flex min-h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              onClick={(event) => {
                event.preventDefault();
                setValue((current) => ({ ...current, lineItems: [...current.lineItems, emptyLine()] }));
              }}
              type="button"
            >
              Add line item
            </button>
          </div>

          <div className="space-y-4">
            {value.lineItems.map((line, index) => {
              const lineTotal = Math.max(0, line.quantity * line.unitPrice - line.discountAmount);
              return (
                <div key={line.id ?? `${line.internalCode}-${index}`} className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
                  <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_0.7fr_0.7fr_auto]">
                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Service code</span>
                      <select
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                        onChange={(event) => applyCatalogSelection(index, event.target.value)}
                        value={line.internalCode}
                      >
                        <option value="">Select service</option>
                        <optgroup label="TradeWorx services">
                          {catalog.filter((item) => item.source !== "quickbooks").map((item) => (
                            <option key={item.code} value={item.code}>
                              {item.title} ({item.code})
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="QuickBooks products and services">
                          {catalog.filter((item) => item.source === "quickbooks").map((item) => (
                            <option key={item.code} value={item.code}>
                              {item.title}
                              {item.quickbooksItemType ? ` (${item.quickbooksItemType}` : ""}
                              {item.unitPrice !== null && item.unitPrice !== undefined ? ` • $${item.unitPrice.toFixed(2)}` : ""}
                              {item.quickbooksItemType ? ")" : ""}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </label>

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
                          setValue((current) => ({
                            ...current,
                            lineItems: current.lineItems.filter((_, lineIndex) => lineIndex !== index)
                          }));
                        }}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_0.6fr_0.8fr_auto_auto]">
                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Description</span>
                      <textarea
                        className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                        onChange={(event) => updateLine(index, { description: event.target.value })}
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
                          setValue((current) => {
                            const next = [...current.lineItems];
                            const currentLine = next[index];
                            const previousLine = next[index - 1];
                            if (!currentLine || !previousLine) {
                              return current;
                            }
                            next[index - 1] = currentLine;
                            next[index] = previousLine;
                            return { ...current, lineItems: next };
                          });
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
                          setValue((current) => {
                            const next = [...current.lineItems];
                            const currentLine = next[index];
                            const nextLine = next[index + 1];
                            if (!currentLine || !nextLine) {
                              return current;
                            }
                            next[index] = nextLine;
                            next[index + 1] = currentLine;
                            return { ...current, lineItems: next };
                          });
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
      </div>

      <aside className="space-y-6">
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
          <button className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100" type="submit">
            {submitLabel}
          </button>
        </section>
      </aside>
    </form>
  );
}
