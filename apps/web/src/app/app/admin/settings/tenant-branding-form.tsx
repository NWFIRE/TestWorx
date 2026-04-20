"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const initialState = { error: null as string | null, success: null as string | null };

type BrandingValues = {
  logoDataUrl: string;
  primaryColor: string;
  accentColor: string;
  legalBusinessName: string;
  phone: string;
  email: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  billingEmail: string;
};

export function TenantBrandingForm({
  values
}: {
  values: BrandingValues;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState(initialState);

    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(() => {
      void (async () => {
        try {
          const response = await fetch("/api/admin/settings/branding", {
            method: "POST",
            body: formData
          });
          const payload = (await response.json()) as { error?: string; success?: string };

          if (!response.ok) {
            throw new Error(payload.error ?? "Unable to update branding.");
          }

          setState({ error: null, success: payload.success ?? "Branding updated." });
          router.refresh();
        } catch (submitError) {
          setState({
            error: submitError instanceof Error ? submitError.message : "Unable to update branding.",
            success: null
          });
        }
      })();
    });
  }

  return (
    <form className="space-y-5 rounded-[2rem] bg-white p-6 shadow-panel" onSubmit={handleSubmit}>
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Tenant branding</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">Brand and business details</h3>
        <p className="mt-2 text-sm text-slate-500">These values are used in the customer portal and generated inspection PDFs.</p>
      </div>
      {values.logoDataUrl ? <Image alt="Tenant logo preview" className="h-16 w-auto rounded-2xl border border-slate-200 bg-white p-2" height={64} src={values.logoDataUrl} unoptimized width={160} /> : null}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="logo">Logo</label>
        <input accept="image/png,image/jpeg,image/webp" className="block w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" id="logo" name="logo" type="file" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="primaryColor">Primary color</label>
          <input className="h-12 w-full rounded-2xl border border-slate-200 px-4 py-2" defaultValue={values.primaryColor} id="primaryColor" name="primaryColor" type="color" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="accentColor">Accent color</label>
          <input className="h-12 w-full rounded-2xl border border-slate-200 px-4 py-2" defaultValue={values.accentColor} id="accentColor" name="accentColor" type="color" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="legalBusinessName">Business name</label>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values.legalBusinessName} id="legalBusinessName" name="legalBusinessName" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="billingEmail">Billing email</label>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values.billingEmail} id="billingEmail" name="billingEmail" type="email" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="phone">Phone</label>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values.phone} id="phone" name="phone" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="email">Public email</label>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values.email} id="email" name="email" type="email" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="website">Website</label>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values.website} id="website" name="website" />
        </div>
      </div>
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="addressLine1">Address line 1</label>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values.addressLine1} id="addressLine1" name="addressLine1" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="addressLine2">Address line 2</label>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values.addressLine2} id="addressLine2" name="addressLine2" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="city">City</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values.city} id="city" name="city" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="state">State</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values.state} id="state" name="state" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="postalCode">Postal code</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values.postalCode} id="postalCode" name="postalCode" />
          </div>
        </div>
      </div>
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-600">{state.success}</p> : null}
      <button className="w-full rounded-2xl bg-slateblue px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Saving branding..." : "Save branding"}
      </button>
    </form>
  );
}
