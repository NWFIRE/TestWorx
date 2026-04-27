"use client";

import { useMemo, useState, useTransition } from "react";

import { ActionButton } from "@/app/action-button";
import { useToast } from "@/app/toast-provider";

type CustomerOption = {
  id: string;
  name: string;
  contactName: string | null;
  billingEmail: string | null;
  phone: string | null;
};

type CatalogOption = {
  id: string;
  quickbooksItemId: string;
  name: string;
  sku: string | null;
  itemType: string;
  taxable: boolean;
  unitPrice: number | null;
};

type InvoiceLineValue = {
  id: string;
  catalogItemId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxable: boolean;
};

type ProposalTypeOption = {
  value: string;
  label: string;
};

type DirectInvoiceFormValue = {
  customerCompanyId: string;
  walkInMode: boolean;
  walkInCustomerName: string;
  walkInCustomerEmail: string;
  walkInCustomerPhone: string;
  siteLabel: string;
  proposalType: string;
  issueDate: string;
  dueDate: string;
  memo: string;
  sendEmail: boolean;
  lineItems: InvoiceLineValue[];
};

type DirectInvoiceResult = {
  invoiceId: string;
  invoiceNumber: string | null;
  invoiceUrl: string;
  customerName: string;
  sendStatus: string;
  sendError: string | null;
  sentTo: string | null;
};

function toCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

function formatQuantityInputValue(quantity: number) {
  return quantity > 0 ? String(Math.trunc(quantity)) : "";
}

function parseQuantityInputValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function buildEmptyLine(): InvoiceLineValue {
  return {
    id: crypto.randomUUID(),
    catalogItemId: "",
    description: "",
    quantity: 1,
    unitPrice: 0,
    taxable: false
  };
}

export function DirectInvoiceForm({
  action,
  customers,
  catalogItems,
  proposalTypes,
  initialValue
}: {
  action: (formData: FormData) => Promise<{
    ok: boolean;
    error: string | null;
    message: string | null;
    invoice: DirectInvoiceResult | null;
  }>;
  customers: CustomerOption[];
  catalogItems: CatalogOption[];
  proposalTypes: ProposalTypeOption[];
  initialValue: DirectInvoiceFormValue;
}) {
  const [value, setValue] = useState(initialValue);
  const [createdInvoice, setCreatedInvoice] = useState<DirectInvoiceResult | null>(null);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();

  const subtotal = useMemo(
    () => value.lineItems.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [value.lineItems]
  );

  function updateLine(index: number, patch: Partial<InvoiceLineValue>) {
    setValue((current) => ({
      ...current,
      lineItems: current.lineItems.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line)
    }));
  }

  function applyCatalogSelection(index: number, catalogItemId: string) {
    const catalogItem = catalogItems.find((item) => item.id === catalogItemId);
    updateLine(index, {
      catalogItemId,
      description: catalogItem?.name ?? "",
      unitPrice: typeof catalogItem?.unitPrice === "number" ? catalogItem.unitPrice : 0,
      taxable: catalogItem?.taxable ?? false
    });
  }

  const isSelectedCustomerWalkIn = Boolean(value.customerCompanyId) && value.walkInMode;
  const isWalkIn = !value.customerCompanyId;
  const shouldSkipAutomaticFees = isWalkIn || isSelectedCustomerWalkIn;

  return (
    <form
      className="grid gap-6 xl:grid-cols-[1.45fr_0.75fr]"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        formData.set("lineItemsJson", JSON.stringify(value.lineItems));

        startTransition(async () => {
          const result = await action(formData);
          if (result.ok) {
            setCreatedInvoice(result.invoice);
            showToast({ title: result.message ?? "Invoice created", tone: "success" });
          } else if (result.error) {
            showToast({ title: result.error, tone: "error" });
          }
        });
      }}
    >
      <input name="lineItemsJson" type="hidden" value={JSON.stringify(value.lineItems)} />

      <div className="space-y-6">
        <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Customer</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Invoice recipient</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-700">Existing customer</span>
              <select
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                name="customerCompanyId"
                onChange={(event) => {
                  const selected = customers.find((item) => item.id === event.target.value);
                  setValue((current) => ({
                    ...current,
                    customerCompanyId: event.target.value,
                    walkInMode: event.target.value ? current.walkInMode : false,
                    walkInCustomerName: event.target.value ? "" : current.walkInCustomerName,
                    walkInCustomerEmail: event.target.value ? "" : current.walkInCustomerEmail,
                    walkInCustomerPhone: event.target.value ? "" : current.walkInCustomerPhone,
                    siteLabel: current.siteLabel,
                    memo: current.memo,
                    sendEmail: current.sendEmail,
                    dueDate: current.dueDate
                  }));
                  if (selected?.billingEmail) {
                    setValue((current) => ({ ...current, sendEmail: true }));
                  }
                }}
                value={value.customerCompanyId}
              >
                <option value="">Walk-in / one-time customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>

            {value.customerCompanyId ? (
              <>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Invoice type</span>
                  <select
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                    name="proposalType"
                    onChange={(event) => setValue((current) => ({ ...current, proposalType: event.target.value }))}
                    value={value.proposalType}
                  >
                    <option value="">Select invoice type</option>
                    {proposalTypes.map((proposalType) => (
                      <option key={proposalType.value} value={proposalType.value}>
                        {proposalType.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Used to apply the correct automatic compliance reporting fee when this invoice is tied to a customer.
                  </p>
                </label>

                <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <input
                    checked={value.walkInMode}
                    name="walkInMode"
                    onChange={(event) => setValue((current) => ({ ...current, walkInMode: event.target.checked }))}
                    type="checkbox"
                  />
                  Treat this invoice as Walk-In and skip automatic service and compliance fees
                </label>
              </>
            ) : null}

            {isWalkIn ? (
              <>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Walk-in customer name</span>
                  <input
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                    name="walkInCustomerName"
                    onChange={(event) => setValue((current) => ({ ...current, walkInCustomerName: event.target.value }))}
                    value={value.walkInCustomerName}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Billing email</span>
                  <input
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                    name="walkInCustomerEmail"
                    onChange={(event) => setValue((current) => ({ ...current, walkInCustomerEmail: event.target.value }))}
                    type="email"
                    value={value.walkInCustomerEmail}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Phone</span>
                  <input
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                    name="walkInCustomerPhone"
                    onChange={(event) => setValue((current) => ({ ...current, walkInCustomerPhone: event.target.value }))}
                    value={value.walkInCustomerPhone}
                  />
                </label>
              </>
            ) : null}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Project or site label</span>
              <input
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                name="siteLabel"
                onChange={(event) => setValue((current) => ({ ...current, siteLabel: event.target.value }))}
                placeholder="Walk-in service, counter sale, or site name"
                value={value.siteLabel}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Issue date</span>
              <input
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                name="issueDate"
                onChange={(event) => setValue((current) => ({ ...current, issueDate: event.target.value }))}
                type="date"
                value={value.issueDate}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Due date</span>
              <input
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                name="dueDate"
                onChange={(event) => setValue((current) => ({ ...current, dueDate: event.target.value }))}
                type="date"
                value={value.dueDate}
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-700">Customer memo</span>
              <textarea
                className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                name="memo"
                onChange={(event) => setValue((current) => ({ ...current, memo: event.target.value }))}
                placeholder="Optional message shown on the invoice"
                value={value.memo}
              />
            </label>

            <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 md:col-span-2">
              <input
                checked={value.sendEmail}
                name="sendEmail"
                onChange={(event) => setValue((current) => ({ ...current, sendEmail: event.target.checked }))}
                type="checkbox"
              />
              Email the invoice from QuickBooks immediately after creation when a billing email exists
            </label>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Invoice line items</h2>
              <p className="mt-1 text-sm text-slate-500">Select from the synced QuickBooks parts and services catalog and adjust pricing only when needed.</p>
            </div>
            <button
              className="pressable inline-flex min-h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              onClick={(event) => {
                event.preventDefault();
                setValue((current) => ({ ...current, lineItems: [...current.lineItems, buildEmptyLine()] }));
              }}
              type="button"
            >
              Add line item
            </button>
          </div>

          <div className="space-y-4">
            {value.lineItems.map((line, index) => (
              <div key={line.id} className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
                <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr_0.7fr_0.7fr_auto]">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Part or service</span>
                    <select
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                      onChange={(event) => applyCatalogSelection(index, event.target.value)}
                      value={line.catalogItemId}
                    >
                      <option value="">Select item</option>
                      {catalogItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                          {item.sku ? ` (${item.sku})` : ""}
                          {item.unitPrice !== null ? ` • $${item.unitPrice.toFixed(2)}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Description</span>
                    <input
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                      onChange={(event) => updateLine(index, { description: event.target.value })}
                      value={line.description}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Quantity</span>
                    <input
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
                      inputMode="numeric"
                      min="1"
                      onChange={(event) => updateLine(index, { quantity: parseQuantityInputValue(event.target.value) })}
                      placeholder="1"
                      step="1"
                      type="number"
                      value={formatQuantityInputValue(line.quantity)}
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
                      className="pressable inline-flex min-h-11 items-center rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
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

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      checked={line.taxable}
                      onChange={(event) => updateLine(index, { taxable: event.target.checked })}
                      type="checkbox"
                    />
                    Taxable
                  </label>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Line total</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">{toCurrency(line.quantity * line.unitPrice)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Invoice total</p>
          <p className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-slate-950">{toCurrency(subtotal)}</p>
          <p className="mt-3 text-sm text-slate-500">
            {shouldSkipAutomaticFees
              ? "Walk-in invoices skip automatic service and compliance fee rules."
              : "Customer invoices apply service-fee and compliance rules during creation when they match the selected customer and invoice type."}
          </p>
          <p className="mt-3 text-sm text-slate-500">TradeWorx assigns the live invoice number at creation time using the yearly TW format, then syncs that number to QuickBooks.</p>
        </section>

        {createdInvoice ? (
          <section className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-6 text-emerald-900 shadow-[0_12px_36px_rgba(16,185,129,0.08)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">TradeWorx invoice number</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
              {createdInvoice.invoiceNumber ?? "Assigned by TradeWorx"}
            </h3>
            <p className="mt-3 text-sm">
              Created in QuickBooks for {createdInvoice.customerName}.
              {createdInvoice.sendStatus === "sent" && createdInvoice.sentTo ? ` Sent to ${createdInvoice.sentTo}.` : ""}
              {createdInvoice.sendError ? ` ${createdInvoice.sendError}` : ""}
            </p>
            <a
              className="pressable mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl border border-emerald-300 bg-white px-4 py-3 text-sm font-semibold text-emerald-800"
              href={createdInvoice.invoiceUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open in QuickBooks
            </a>
          </section>
        ) : null}

        <section className="rounded-[28px] border border-slate-200/80 bg-[#0f172a] p-6 text-white shadow-[0_16px_44px_rgba(15,23,42,0.14)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/60">Direct invoicing</p>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Create QuickBooks invoices without an inspection summary.</h3>
          <p className="mt-3 text-sm leading-7 text-white/75">
            Use this for walk-in sales, direct billable work, or any customer invoice that should start in accounting instead of the inspection workflow.
          </p>
          <ActionButton className="mt-6 min-h-12 w-full bg-white text-slate-950 hover:bg-slate-100" pending={pending} pendingLabel="Creating invoice..." type="submit">
            Create invoice
          </ActionButton>
        </section>
      </aside>
    </form>
  );
}
