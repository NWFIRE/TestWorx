"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { buildSettingsHref } from "./settings-query";

const initialState = { error: null as string | null, success: null as string | null };
const paymentTermsOptions = [
  { value: "due_on_receipt", label: "Due at time of service" },
  { value: "net_15", label: "Net 15" },
  { value: "net_30", label: "Net 30" },
  { value: "net_60", label: "Net 60" },
  { value: "custom", label: "Custom terms" }
] as const;

type CustomerRecord = {
  id: string;
  name: string;
  contactName: string | null;
  billingEmail: string | null;
  phone: string | null;
  serviceAddressLine1: string | null;
  serviceAddressLine2: string | null;
  serviceCity: string | null;
  serviceState: string | null;
  servicePostalCode: string | null;
  serviceCountry: string | null;
  billingAddressSameAsService: boolean;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPostalCode: string | null;
  billingCountry: string | null;
  notes: string | null;
  isActive: boolean;
  paymentTermsCode: string;
  customPaymentTermsLabel: string | null;
  customPaymentTermsDays: number | null;
  quickbooksCustomerId: string | null;
};

type CustomerManagementCardProps = {
  customers: CustomerRecord[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  createCustomerAction: (
    _: { error: string | null; success: string | null },
    formData: FormData
  ) => Promise<{ error: string | null; success: string | null }>;
  updateCustomerAction: (formData: FormData) => Promise<void>;
  notice?: string | null;
};

type CustomerFormValues = {
  name: string;
  contactName: string;
  billingEmail: string;
  phone: string;
  serviceAddressLine1: string;
  serviceAddressLine2: string;
  serviceCity: string;
  serviceState: string;
  servicePostalCode: string;
  serviceCountry: string;
  billingAddressSameAsService: boolean;
  billingAddressLine1: string;
  billingAddressLine2: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  billingCountry: string;
  notes: string;
  isActive: boolean;
  paymentTermsCode: string;
  customPaymentTermsLabel: string;
  customPaymentTermsDays: string;
};

function toFormValues(customer?: CustomerRecord): CustomerFormValues {
  return {
    name: customer?.name ?? "",
    contactName: customer?.contactName ?? "",
    billingEmail: customer?.billingEmail ?? "",
    phone: customer?.phone ?? "",
    serviceAddressLine1: customer?.serviceAddressLine1 ?? "",
    serviceAddressLine2: customer?.serviceAddressLine2 ?? "",
    serviceCity: customer?.serviceCity ?? "",
    serviceState: customer?.serviceState ?? "",
    servicePostalCode: customer?.servicePostalCode ?? "",
    serviceCountry: customer?.serviceCountry ?? "",
    billingAddressSameAsService: customer?.billingAddressSameAsService ?? true,
    billingAddressLine1: customer?.billingAddressLine1 ?? "",
    billingAddressLine2: customer?.billingAddressLine2 ?? "",
    billingCity: customer?.billingCity ?? "",
    billingState: customer?.billingState ?? "",
    billingPostalCode: customer?.billingPostalCode ?? "",
    billingCountry: customer?.billingCountry ?? "",
    notes: customer?.notes ?? "",
    isActive: customer?.isActive ?? true,
    paymentTermsCode: customer?.paymentTermsCode ?? "due_on_receipt",
    customPaymentTermsLabel: customer?.customPaymentTermsLabel ?? "",
    customPaymentTermsDays: customer?.customPaymentTermsDays ? String(customer.customPaymentTermsDays) : ""
  };
}

function CustomerFieldGroup({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.25rem] border border-slate-200/80 bg-slate-50/70 p-4">
      <div className="mb-4">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function CustomerProfileFields({
  customer,
  formIdPrefix
}: {
  customer?: CustomerRecord;
  formIdPrefix: string;
}) {
  const [billingAddressSameAsService, setBillingAddressSameAsService] = useState(
    customer?.billingAddressSameAsService ?? true
  );
  const [paymentTermsCode, setPaymentTermsCode] = useState(customer?.paymentTermsCode ?? "due_on_receipt");
  const initialValues = useMemo(() => toFormValues(customer), [customer]);
  const showCustomTerms = paymentTermsCode === "custom";

  return (
    <div className="space-y-4">
      <CustomerFieldGroup
        title="Contact information"
        description="Core company and contact details used in scheduling, billing, and the customer portal."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-name`}>Company name</label>
            <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={initialValues.name} id={`${formIdPrefix}-name`} name="name" required />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-contactName`}>Primary contact name</label>
            <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={initialValues.contactName} id={`${formIdPrefix}-contactName`} name="contactName" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-billingEmail`}>Billing email</label>
            <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={initialValues.billingEmail} id={`${formIdPrefix}-billingEmail`} name="billingEmail" type="email" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-phone`}>Phone</label>
            <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={initialValues.phone} id={`${formIdPrefix}-phone`} name="phone" />
          </div>
        </div>
      </CustomerFieldGroup>

      <CustomerFieldGroup
        title="Service address"
        description="This is the operational location technicians and schedulers should see first."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-serviceAddressLine1`}>Service address line 1</label>
            <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={initialValues.serviceAddressLine1} id={`${formIdPrefix}-serviceAddressLine1`} name="serviceAddressLine1" />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-serviceAddressLine2`}>Service address line 2</label>
            <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={initialValues.serviceAddressLine2} id={`${formIdPrefix}-serviceAddressLine2`} name="serviceAddressLine2" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-serviceCity`}>City</label>
            <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={initialValues.serviceCity} id={`${formIdPrefix}-serviceCity`} name="serviceCity" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-serviceState`}>State / region</label>
            <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={initialValues.serviceState} id={`${formIdPrefix}-serviceState`} name="serviceState" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-servicePostalCode`}>Postal code</label>
            <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={initialValues.servicePostalCode} id={`${formIdPrefix}-servicePostalCode`} name="servicePostalCode" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-serviceCountry`}>Country</label>
            <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={initialValues.serviceCountry} id={`${formIdPrefix}-serviceCountry`} name="serviceCountry" />
          </div>
        </div>
      </CustomerFieldGroup>

      <CustomerFieldGroup
        title="Billing address"
        description="Use a separate billing address when invoices need to route somewhere other than the service location."
      >
        <label className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">
          <input
            className="h-4 w-4 rounded border-slate-300 text-slateblue focus:ring-slateblue"
            defaultChecked={billingAddressSameAsService}
            name="billingAddressSameAsService"
            onChange={(event) => setBillingAddressSameAsService(event.target.checked)}
            type="checkbox"
          />
          Billing address same as service address
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-billingAddressLine1`}>Billing address line 1</label>
            <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 disabled:bg-slate-100 disabled:text-slate-400" defaultValue={initialValues.billingAddressLine1} disabled={billingAddressSameAsService} id={`${formIdPrefix}-billingAddressLine1`} name="billingAddressLine1" />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-billingAddressLine2`}>Billing address line 2</label>
            <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 disabled:bg-slate-100 disabled:text-slate-400" defaultValue={initialValues.billingAddressLine2} disabled={billingAddressSameAsService} id={`${formIdPrefix}-billingAddressLine2`} name="billingAddressLine2" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-billingCity`}>Billing city</label>
            <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 disabled:bg-slate-100 disabled:text-slate-400" defaultValue={initialValues.billingCity} disabled={billingAddressSameAsService} id={`${formIdPrefix}-billingCity`} name="billingCity" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-billingState`}>Billing state / region</label>
            <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 disabled:bg-slate-100 disabled:text-slate-400" defaultValue={initialValues.billingState} disabled={billingAddressSameAsService} id={`${formIdPrefix}-billingState`} name="billingState" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-billingPostalCode`}>Billing postal code</label>
            <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 disabled:bg-slate-100 disabled:text-slate-400" defaultValue={initialValues.billingPostalCode} disabled={billingAddressSameAsService} id={`${formIdPrefix}-billingPostalCode`} name="billingPostalCode" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-billingCountry`}>Billing country</label>
            <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 disabled:bg-slate-100 disabled:text-slate-400" defaultValue={initialValues.billingCountry} disabled={billingAddressSameAsService} id={`${formIdPrefix}-billingCountry`} name="billingCountry" />
          </div>
        </div>
      </CustomerFieldGroup>

      <CustomerFieldGroup
        title="Billing and payment settings"
        description="Capture the payment terms technicians and the office team need during scheduling, collection, and invoicing."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-paymentTermsCode`}>Payment terms</label>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              defaultValue={initialValues.paymentTermsCode}
              id={`${formIdPrefix}-paymentTermsCode`}
              name="paymentTermsCode"
              onChange={(event) => setPaymentTermsCode(event.target.value)}
              required
            >
              {paymentTermsOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-status`}>Customer status</label>
            <label className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">
              <input className="h-4 w-4 rounded border-slate-300 text-slateblue focus:ring-slateblue" defaultChecked={initialValues.isActive} name="isActive" type="checkbox" />
              Active customer
            </label>
          </div>
          {showCustomTerms ? (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-customPaymentTermsLabel`}>Custom terms label</label>
                <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={initialValues.customPaymentTermsLabel} id={`${formIdPrefix}-customPaymentTermsLabel`} name="customPaymentTermsLabel" placeholder="Due before next scheduled visit" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-customPaymentTermsDays`}>Custom term days</label>
                <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={initialValues.customPaymentTermsDays} id={`${formIdPrefix}-customPaymentTermsDays`} min={1} name="customPaymentTermsDays" placeholder="45" type="number" />
              </div>
            </>
          ) : (
            <>
              <input name="customPaymentTermsLabel" type="hidden" value="" />
              <input name="customPaymentTermsDays" type="hidden" value="" />
            </>
          )}
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-notes`}>Notes / internal customer notes</label>
            <textarea className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={initialValues.notes} id={`${formIdPrefix}-notes`} name="notes" placeholder="Access notes, technician reminders, special billing instructions, or internal account context." />
          </div>
        </div>
      </CustomerFieldGroup>
    </div>
  );
}

export function CustomerManagementCard({
  customers,
  pagination,
  createCustomerAction,
  updateCustomerAction,
  notice
}: CustomerManagementCardProps) {
  const [createState, createFormAction, createPending] = useActionState(createCustomerAction, initialState);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const previousPageHref = buildSettingsHref(pathname, searchParams, {
    customersOpen: 1,
    customersPage: Math.max(pagination.page - 1, 1)
  });
  const nextPageHref = buildSettingsHref(pathname, searchParams, {
    customersOpen: 1,
    customersPage: Math.min(pagination.page + 1, pagination.totalPages)
  });

  return (
    <div className="space-y-6 rounded-[2rem] bg-white p-6 shadow-panel">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Customer companies</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">Create and edit current customers</h3>
        <p className="mt-2 text-sm text-slate-500">Maintain complete customer records for scheduling, field operations, billing, and QuickBooks sync without replacing any existing tenant data.</p>
      </div>

      <form action={createFormAction} className="space-y-4 rounded-[1.5rem] border border-slate-200 p-5">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-slate-500">New customer</p>
          <h4 className="mt-1 text-lg font-semibold text-ink">Add a customer company</h4>
        </div>
        <CustomerProfileFields formIdPrefix="create-customer" />
        {createState.error ? <p className="text-sm text-rose-600">{createState.error}</p> : null}
        {createState.success ? <p className="text-sm text-emerald-600">{createState.success}</p> : null}
        {notice ? <p className="text-sm text-slateblue">{notice}</p> : null}
        <button className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={createPending} type="submit">
          {createPending ? "Saving customer..." : "Add customer"}
        </button>
      </form>

      <div className="space-y-4">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Current customers</p>
          <h4 className="mt-1 text-lg font-semibold text-ink">{pagination.totalCount} configured</h4>
          {pagination.totalCount > 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              Showing {(pagination.page - 1) * pagination.limit + 1}-{Math.min(pagination.page * pagination.limit, pagination.totalCount)} of {pagination.totalCount}
            </p>
          ) : null}
        </div>
        {customers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No customers yet. Add your first customer company here or bring them over through the import flow.</p>
        ) : (
          customers.map((customer) => (
            <div key={customer.id} className="rounded-[1.5rem] border border-slate-200 p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-ink">{customer.name}</p>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${customer.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {customer.isActive ? "Active" : "Inactive"}
                    </span>
                    {customer.paymentTermsCode === "due_on_receipt" ? (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
                        Due on site
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {customer.quickbooksCustomerId ? `QuickBooks linked (${customer.quickbooksCustomerId})` : "Not linked to QuickBooks yet"}
                  </p>
                </div>
              </div>
              <form action={updateCustomerAction} className="space-y-4">
                <input name="customerCompanyId" type="hidden" value={customer.id} />
                <input name="customersOpen" type="hidden" value="1" />
                <input name="customersPage" type="hidden" value={String(pagination.page)} />
                <CustomerProfileFields customer={customer} formIdPrefix={`customer-${customer.id}`} />
                <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
                  Save customer
                </button>
              </form>
            </div>
          ))
        )}
        {pagination.totalCount > 0 ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>Page {pagination.page} of {pagination.totalPages}</p>
            <div className="flex flex-wrap gap-3">
              {pagination.page > 1 ? (
                <Link className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={previousPageHref}>
                  Previous
                </Link>
              ) : (
                <span className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-300">
                  Previous
                </span>
              )}
              {pagination.page < pagination.totalPages ? (
                <Link className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={nextPageHref}>
                  Next
                </Link>
              ) : (
                <span className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-300">
                  Next
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
