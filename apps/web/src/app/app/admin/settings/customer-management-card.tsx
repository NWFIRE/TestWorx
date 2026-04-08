"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { KeyboardEvent, ReactNode } from "react";

const initialState = { error: null as string | null, success: null as string | null };
const paymentTermsOptions = [
  { value: "due_on_receipt", label: "Due at time of service" },
  { value: "net_15", label: "Net 15" },
  { value: "net_30", label: "Net 30" },
  { value: "net_60", label: "Net 60" },
  { value: "custom", label: "Custom terms" }
] as const;
const LIVE_SEARCH_DEBOUNCE_MS = 250;

type CustomerRecord = {
  id: string;
  name: string;
  contactName: string | null;
  billingEmail: string | null;
  phone: string | null;
  isTaxExempt: boolean;
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

type CustomerPagination = {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  overallCount: number;
};

type CustomerFilters = {
  query: string;
};

type CustomerSearchResponse = {
  customers: CustomerRecord[];
  pagination: CustomerPagination;
  filters: CustomerFilters;
};

type CustomerManagementCardProps = {
  customers: CustomerRecord[];
  pagination: CustomerPagination;
  filters: CustomerFilters;
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
  isTaxExempt: boolean;
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
    isTaxExempt: customer?.isTaxExempt ?? false,
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
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${formIdPrefix}-isTaxExempt`}>Tax treatment</label>
            <label className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">
              <input className="h-4 w-4 rounded border-slate-300 text-slateblue focus:ring-slateblue" defaultChecked={initialValues.isTaxExempt} id={`${formIdPrefix}-isTaxExempt`} name="isTaxExempt" type="checkbox" />
              Customer is tax exempt
            </label>
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
  filters,
  createCustomerAction,
  updateCustomerAction,
  notice
}: CustomerManagementCardProps) {
  const [createState, createFormAction, createPending] = useActionState(createCustomerAction, initialState);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [queryInput, setQueryInput] = useState(filters.query);
  const [customerRows, setCustomerRows] = useState(customers);
  const [customerPagination, setCustomerPagination] = useState(pagination);
  const [activeQuery, setActiveQuery] = useState(filters.query);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const requestSequenceRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    setQueryInput(filters.query);
    setCustomerRows(customers);
    setCustomerPagination(pagination);
    setActiveQuery(filters.query);
    hydratedRef.current = true;
  }, [customers, filters.query, pagination]);

  const syncCustomersUrl = useCallback((page: number, query: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("customersOpen", "1");
    params.set("customersPage", String(page));
    if (query) {
      params.set("customersQuery", query);
    } else {
      params.delete("customersQuery");
    }

    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [pathname, searchParams]);

  const loadCustomers = useCallback(async (page: number, nextQuery: string) => {
    const trimmedQuery = nextQuery.trim();
    const sequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = sequence;
    const controller = new AbortController();
    activeAbortRef.current?.abort();
    activeAbortRef.current = controller;
    setIsLoadingResults(true);
    setSearchError(null);

    try {
      const url = new URL("/api/admin/settings/customers", window.location.origin);
      url.searchParams.set("page", String(page));
      if (trimmedQuery) {
        url.searchParams.set("query", trimmedQuery);
      }

      const response = await fetch(url.toString(), {
        method: "GET",
        signal: controller.signal,
        cache: "no-store"
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Unable to load customers.");
      }

      const payload = await response.json() as CustomerSearchResponse;
      if (requestSequenceRef.current !== sequence) {
        return;
      }

      setCustomerRows(payload.customers);
      setCustomerPagination(payload.pagination);
      setActiveQuery(payload.filters.query);
      syncCustomersUrl(payload.pagination.page, payload.filters.query);
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return;
      }
      if (requestSequenceRef.current === sequence) {
        setSearchError(error instanceof Error ? error.message : "Unable to load customers.");
      }
    } finally {
      if (requestSequenceRef.current === sequence) {
        setIsLoadingResults(false);
      }
    }
  }, [syncCustomersUrl]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }

    const normalizedQuery = queryInput.trim();
    if (normalizedQuery === activeQuery) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadCustomers(1, normalizedQuery);
    }, LIVE_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [activeQuery, loadCustomers, queryInput]);

  useEffect(() => () => {
    activeAbortRef.current?.abort();
  }, []);

  function clearSearch() {
    setQueryInput("");
    setSearchError(null);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  }

  const currentQuery = activeQuery;
  const currentPagination = customerPagination;
  const currentCustomers = customerRows;
  const hasSearch = Boolean(queryInput.trim());
  const summaryLabel = currentQuery
    ? `${currentPagination.totalCount} match${currentPagination.totalCount === 1 ? "" : "es"}`
    : `${currentPagination.totalCount} configured`;

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
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h4 className="text-lg font-semibold text-ink">{summaryLabel}</h4>
            {isLoadingResults ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Updating results...
              </span>
            ) : null}
          </div>
          {currentPagination.totalCount > 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              Showing {(currentPagination.page - 1) * currentPagination.limit + 1}-{Math.min(currentPagination.page * currentPagination.limit, currentPagination.totalCount)} of {currentPagination.totalCount}
              {currentQuery ? ` filtered result${currentPagination.totalCount === 1 ? "" : "s"} from ${currentPagination.overallCount} total customers` : ""}
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 rounded-[1.5rem] border border-slate-200 p-4 lg:grid-cols-[1.3fr_auto]">
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">Search</span>
            <input
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-20 pr-4 text-sm text-slate-900 outline-none transition focus:border-slateblue"
              onChange={(event) => setQueryInput(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search customer name, contact, billing email, or phone"
              value={queryInput}
            />
          </div>
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasSearch && !currentQuery}
            onClick={clearSearch}
            type="button"
          >
            Clear
          </button>
        </div>

        {searchError ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{searchError}</p>
        ) : null}

        {currentCustomers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
            {currentQuery
              ? "No customers match your search."
              : "No customers yet. Add your first customer company here or bring them over through the import flow."}
          </p>
        ) : (
          currentCustomers.map((customer) => (
            <div key={customer.id} className="rounded-[1.5rem] border border-slate-200 p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-ink">{customer.name}</p>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${customer.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {customer.isActive ? "Active" : "Inactive"}
                    </span>
                    {customer.isTaxExempt ? (
                      <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-800">
                        Tax exempt
                      </span>
                    ) : null}
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
                <input name="customersPage" type="hidden" value={String(currentPagination.page)} />
                <input name="customersQuery" type="hidden" value={currentQuery} />
                <CustomerProfileFields customer={customer} formIdPrefix={`customer-${customer.id}`} />
                <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
                  Save customer
                </button>
              </form>
            </div>
          ))
        )}

        {currentPagination.totalCount > 0 ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>Page {currentPagination.page} of {currentPagination.totalPages}</p>
            <div className="flex flex-wrap gap-3">
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue disabled:text-slate-300"
                disabled={currentPagination.page <= 1 || isLoadingResults}
                onClick={() => { void loadCustomers(currentPagination.page - 1, queryInput); }}
                type="button"
              >
                Previous
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue disabled:text-slate-300"
                disabled={currentPagination.page >= currentPagination.totalPages || isLoadingResults}
                onClick={() => { void loadCustomers(currentPagination.page + 1, queryInput); }}
                type="button"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
