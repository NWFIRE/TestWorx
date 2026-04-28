import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import {
  buildTenantBrandingCss,
  getPublicCustomerIntakeRequest,
  serviceSystemTypeLabels,
  serviceSystemTypes
} from "@testworx/lib/server/index";

import { submitCustomerIntakeAction } from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : "";
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  placeholder
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}{required ? " *" : ""}</span>
      <input
        className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base outline-none transition focus:border-[var(--tenant-primary)] focus:ring-4 focus:ring-[color:rgb(var(--tenant-primary-rgb)/0.14)]"
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
      />
    </label>
  );
}

function Section({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-7">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--tenant-primary)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

export default async function CustomerIntakePage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { token } = await params;
  const query = searchParams ? await searchParams : {};
  const request = await getPublicCustomerIntakeRequest(token);
  if (!request) {
    notFound();
  }

  const submitted = readParam(query, "submitted") === "1";
  const error = readParam(query, "error");
  const isOpen = request.status === "sent";

  return (
    <main
      className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgb(var(--tenant-primary-rgb)/0.12),transparent_34%),linear-gradient(180deg,#f8fafc,#eef3f8)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8"
      style={buildTenantBrandingCss(request.branding)}
    >
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="overflow-hidden rounded-[34px] border border-slate-200 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.08)]">
          <div className="bg-[linear-gradient(135deg,var(--tenant-primary),var(--tenant-accent))] p-6 text-white sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">Customer setup</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
                  Complete your customer setup
                </h1>
              </div>
              {request.branding.logoDataUrl ? (
                <Image
                  alt={request.branding.legalBusinessName}
                  className="h-auto max-h-14 w-auto max-w-44 rounded-xl bg-white/90 p-2"
                  height={56}
                  src={request.branding.logoDataUrl}
                  width={176}
                />
              ) : (
                <div className="text-lg font-semibold">{request.branding.legalBusinessName}</div>
              )}
            </div>
          </div>
          <div className="p-6 sm:p-8">
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              {request.branding.legalBusinessName} uses this secure form to set up customer, billing, service site, and service request details correctly before scheduling work.
            </p>
            <p className="mt-3 text-sm text-slate-500">
              This link expires {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(request.expiresAt)}.
            </p>
          </div>
        </header>

        {submitted ? (
          <section className="rounded-[30px] border border-emerald-200 bg-emerald-50 p-7 text-emerald-900 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <h2 className="text-2xl font-semibold tracking-[-0.04em]">Thank you.</h2>
            <p className="mt-3 text-base leading-7">Your information has been submitted. Our team will review it and follow up shortly.</p>
          </section>
        ) : !isOpen ? (
          <section className="rounded-[30px] border border-slate-200 bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <h2 className="text-2xl font-semibold tracking-[-0.04em]">This intake link is no longer active.</h2>
            <p className="mt-3 text-base leading-7 text-slate-600">
              The form may have already been submitted, approved, rejected, or expired. Please contact {request.branding.legalBusinessName} if you need a new link.
            </p>
            {request.branding.website ? (
              <Link className="mt-5 inline-flex font-semibold text-[var(--tenant-primary)]" href={request.branding.website}>
                Visit company website
              </Link>
            ) : null}
          </section>
        ) : (
          <form action={submitCustomerIntakeAction} className="space-y-6">
            <input name="token" type="hidden" value={token} />
            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                {error}
              </div>
            ) : null}

            <Section description="Tell us who we will be serving and who we should contact first." title="Company Information">
              <Field label="Company name" name="companyName" required />
              <Field label="Primary contact name" name="primaryContactName" required />
              <Field label="Primary contact email" name="primaryContactEmail" required type="email" />
              <Field label="Primary contact phone" name="primaryContactPhone" required type="tel" />
            </Section>

            <Section description="This helps us route invoices and account communication correctly." title="Billing Information">
              <Field label="Billing email" name="billingEmail" required type="email" />
              <Field label="Billing phone" name="billingPhone" type="tel" />
              <Field label="Billing address" name="billingAddressLine1" required />
              <Field label="Billing address line 2" name="billingAddressLine2" />
              <Field label="Billing city" name="billingCity" required />
              <Field label="Billing state" name="billingState" required />
              <Field label="Billing ZIP" name="billingPostalCode" required />
            </Section>

            <Section description="Enter the service location where work should be performed." title="Service Site Information">
              <Field label="Site name" name="siteName" placeholder="Optional, such as Main Building" />
              <Field label="Site address" name="siteAddressLine1" required />
              <Field label="Site address line 2" name="siteAddressLine2" />
              <Field label="Site city" name="siteCity" required />
              <Field label="Site state" name="siteState" required />
              <Field label="Site ZIP" name="sitePostalCode" required />
              <Field label="Site contact name" name="siteContactName" />
              <Field label="Site contact phone" name="siteContactPhone" type="tel" />
              <Field label="Site contact email" name="siteContactEmail" type="email" />
            </Section>

            <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--tenant-primary)]">Service Request</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">Give us enough context to route the request to the right team.</p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Requested service type" name="requestedServiceType" placeholder="Inspection, repair, install, emergency service..." required />
                <Field label="Preferred service date/time" name="preferredServiceWindow" placeholder="Optional" />
              </div>
              <div className="mt-5">
                <p className="mb-3 text-sm font-semibold text-slate-700">System type(s) *</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {serviceSystemTypes.map((type) => (
                    <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700" key={type}>
                      <input className="h-4 w-4" name="systemTypes" type="checkbox" value={type} />
                      <span>{serviceSystemTypeLabels[type]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="mt-5 block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Notes</span>
                <textarea
                  className="min-h-32 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none transition focus:border-[var(--tenant-primary)] focus:ring-4 focus:ring-[color:rgb(var(--tenant-primary-rgb)/0.14)]"
                  name="serviceNotes"
                  placeholder="Describe the service need, urgency, system details, or anything we should know before arriving."
                />
              </label>
            </section>

            <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:p-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--tenant-primary)]">Optional Uploads</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">Attach photos, documents, or prior inspection reports if they help explain the request.</p>
              <input
                className="mt-5 block w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600"
                multiple
                name="uploads"
                type="file"
              />
            </section>

            <div className="sticky bottom-4 z-10 rounded-[26px] border border-slate-200 bg-white/95 p-3 shadow-[0_18px_60px_rgba(15,23,42,0.16)] backdrop-blur">
              <button className="min-h-14 w-full rounded-2xl bg-[var(--tenant-primary)] px-5 text-base font-semibold text-[var(--tenant-primary-contrast)]" type="submit">
                Submit Customer Setup
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
