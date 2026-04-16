"use client";

import { useActionState } from "react";

const initialState = { error: null as string | null, success: null as string | null };

type BillingPayerRecord = {
  id: string;
  name: string;
  contactName: string | null;
  billingEmail: string | null;
  phone: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPostalCode: string | null;
  billingCountry: string | null;
  invoiceDeliverySettings: {
    method: "payer_email" | "customer_email" | "manual";
    recipientEmail?: string;
    label?: string;
  };
  quickbooksCustomerId: string | null;
  externalAccountCode: string | null;
  externalReference: string | null;
  isActive: boolean;
};

type BillingPayerSettingsCardProps = {
  notice?: string | null;
  payers: BillingPayerRecord[];
  createAction: (
    _: { error: string | null; success: string | null },
    formData: FormData
  ) => Promise<{ error: string | null; success: string | null }>;
  updateAction: (formData: FormData) => Promise<void>;
};

function PayerFields({
  prefix,
  payer
}: {
  prefix: string;
  payer?: BillingPayerRecord;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-name`}>Payer account name</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={payer?.name ?? ""} id={`${prefix}-name`} name="name" required />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-contactName`}>Contact name</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={payer?.contactName ?? ""} id={`${prefix}-contactName`} name="contactName" />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-billingEmail`}>Billing email</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={payer?.billingEmail ?? ""} id={`${prefix}-billingEmail`} name="billingEmail" type="email" />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-phone`}>Phone</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={payer?.phone ?? ""} id={`${prefix}-phone`} name="phone" />
      </div>
      <div className="md:col-span-2">
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-billingAddressLine1`}>Billing address line 1</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={payer?.billingAddressLine1 ?? ""} id={`${prefix}-billingAddressLine1`} name="billingAddressLine1" />
      </div>
      <div className="md:col-span-2">
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-billingAddressLine2`}>Billing address line 2</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={payer?.billingAddressLine2 ?? ""} id={`${prefix}-billingAddressLine2`} name="billingAddressLine2" />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-billingCity`}>City</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={payer?.billingCity ?? ""} id={`${prefix}-billingCity`} name="billingCity" />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-billingState`}>State</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={payer?.billingState ?? ""} id={`${prefix}-billingState`} name="billingState" />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-billingPostalCode`}>Postal code</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={payer?.billingPostalCode ?? ""} id={`${prefix}-billingPostalCode`} name="billingPostalCode" />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-billingCountry`}>Country</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={payer?.billingCountry ?? ""} id={`${prefix}-billingCountry`} name="billingCountry" />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-invoiceDeliveryMethod`}>Default delivery method</label>
        <select className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={payer?.invoiceDeliverySettings.method ?? "payer_email"} id={`${prefix}-invoiceDeliveryMethod`} name="invoiceDeliveryMethod">
          <option value="payer_email">Payer email</option>
          <option value="customer_email">Customer email</option>
          <option value="manual">Manual send</option>
        </select>
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-invoiceDeliveryRecipientEmail`}>Override recipient</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={payer?.invoiceDeliverySettings.recipientEmail ?? ""} id={`${prefix}-invoiceDeliveryRecipientEmail`} name="invoiceDeliveryRecipientEmail" type="email" />
      </div>
      <div className="md:col-span-2">
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-invoiceDeliveryLabel`}>Delivery label</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={payer?.invoiceDeliverySettings.label ?? ""} id={`${prefix}-invoiceDeliveryLabel`} name="invoiceDeliveryLabel" placeholder="Corporate AP" />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-quickbooksCustomerId`}>QuickBooks customer id</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={payer?.quickbooksCustomerId ?? ""} id={`${prefix}-quickbooksCustomerId`} name="quickbooksCustomerId" />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-externalAccountCode`}>External account code</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={payer?.externalAccountCode ?? ""} id={`${prefix}-externalAccountCode`} name="externalAccountCode" />
      </div>
      <div className="md:col-span-2">
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-externalReference`}>External reference</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={payer?.externalReference ?? ""} id={`${prefix}-externalReference`} name="externalReference" />
      </div>
      <div className="md:col-span-2">
        <label className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">
          <input className="h-4 w-4 rounded border-slate-300 text-slateblue focus:ring-slateblue" defaultChecked={payer?.isActive ?? true} name="isActive" type="checkbox" />
          Active payer account
        </label>
      </div>
    </div>
  );
}

export function BillingPayerSettingsCard({ notice, payers, createAction, updateAction }: BillingPayerSettingsCardProps) {
  const [state, formAction, pending] = useActionState(createAction, initialState);

  return (
    <div className="space-y-6 rounded-[2rem] bg-white p-6 shadow-panel">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Bill-to payer accounts</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">External payer routing</h3>
        <p className="mt-2 text-sm text-slate-500">Maintain third-party payer entities separately from serviced customers so invoice routing stays contract-driven and tenant-safe.</p>
      </div>

      <form action={formAction} className="space-y-4 rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
        <div>
          <p className="text-sm font-semibold text-ink">Add payer account</p>
          <p className="mt-1 text-sm text-slate-500">Use payer accounts for companies like Commercial Fire or Academy Fire without hardcoding customer-name branches.</p>
        </div>
        <PayerFields prefix="new-payer" />
        {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-emerald-600">{state.success}</p> : null}
        {notice ? <p className="text-sm text-slateblue">{notice}</p> : null}
        <button className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">
          {pending ? "Saving payer..." : "Add payer account"}
        </button>
      </form>

      <div className="space-y-4">
        {payers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No payer accounts configured yet.</p>
        ) : payers.map((payer) => (
          <form action={updateAction} className="space-y-4 rounded-[1.5rem] border border-slate-200 p-4" key={payer.id}>
            <input name="payerAccountId" type="hidden" value={payer.id} />
            <div>
              <p className="text-lg font-semibold text-ink">{payer.name}</p>
              <p className="mt-1 text-sm text-slate-500">Update routing, delivery defaults, and QuickBooks linkage for this bill-to payer.</p>
            </div>
            <PayerFields payer={payer} prefix={`payer-${payer.id}`} />
            <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
              Save payer
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
