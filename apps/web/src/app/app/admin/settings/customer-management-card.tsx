"use client";

import { useActionState } from "react";

const initialState = { error: null as string | null, success: null as string | null };

type CustomerManagementCardProps = {
  customers: Array<{
    id: string;
    name: string;
    contactName: string | null;
    billingEmail: string | null;
    phone: string | null;
    quickbooksCustomerId: string | null;
  }>;
  createCustomerAction: (_: { error: string | null; success: string | null }, formData: FormData) => Promise<{ error: string | null; success: string | null }>;
  updateCustomerAction: (formData: FormData) => Promise<void>;
  notice?: string | null;
};

export function CustomerManagementCard({
  customers,
  createCustomerAction,
  updateCustomerAction,
  notice
}: CustomerManagementCardProps) {
  const [createState, createFormAction, createPending] = useActionState(createCustomerAction, initialState);

  return (
    <div className="space-y-6 rounded-[2rem] bg-white p-6 shadow-panel">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Customer companies</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">Create and edit current customers</h3>
        <p className="mt-2 text-sm text-slate-500">Maintain the companies your team schedules, reports on, and invoices. When QuickBooks is connected, customer updates can sync there without replacing any existing records.</p>
      </div>

      <form action={createFormAction} className="rounded-[1.5rem] border border-slate-200 p-5">
        <div className="mb-4">
          <p className="text-sm uppercase tracking-[0.18em] text-slate-500">New customer</p>
          <h4 className="mt-1 text-lg font-semibold text-ink">Add a customer company</h4>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="customerName">Company name</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="customerName" name="name" placeholder="Acme Properties" required />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="customerContactName">Primary contact</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="customerContactName" name="contactName" placeholder="Jordan Lee" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="customerBillingEmail">Billing email</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="customerBillingEmail" name="billingEmail" placeholder="billing@example.com" type="email" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="customerPhone">Phone</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="customerPhone" name="phone" placeholder="580-555-0110" />
          </div>
        </div>
        {createState.error ? <p className="mt-3 text-sm text-rose-600">{createState.error}</p> : null}
        {createState.success ? <p className="mt-3 text-sm text-emerald-600">{createState.success}</p> : null}
        {notice ? <p className="mt-3 text-sm text-slateblue">{notice}</p> : null}
        <button className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={createPending} type="submit">
          {createPending ? "Saving customer..." : "Add customer"}
        </button>
      </form>

      <div className="space-y-4">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Current customers</p>
          <h4 className="mt-1 text-lg font-semibold text-ink">{customers.length} configured</h4>
        </div>
        {customers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No customers yet. Add your first customer company here or bring them over through the import flow.</p>
        ) : customers.map((customer) => (
          <div key={customer.id} className="rounded-[1.5rem] border border-slate-200 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-ink">{customer.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {customer.quickbooksCustomerId ? `QuickBooks linked (${customer.quickbooksCustomerId})` : "Not linked to QuickBooks yet"}
                </p>
              </div>
            </div>
            <form action={updateCustomerAction} className="space-y-4">
              <input name="customerCompanyId" type="hidden" value={customer.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">Company name</label>
                  <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={customer.name} name="name" required />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">Primary contact</label>
                  <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={customer.contactName ?? ""} name="contactName" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">Billing email</label>
                  <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={customer.billingEmail ?? ""} name="billingEmail" type="email" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">Phone</label>
                  <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={customer.phone ?? ""} name="phone" />
                </div>
              </div>
              <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
                Save customer
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
