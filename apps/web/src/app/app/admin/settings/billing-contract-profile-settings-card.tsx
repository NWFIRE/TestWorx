"use client";

import { useActionState } from "react";

const initialState = { error: null as string | null, success: null as string | null };

type BillingPayerOption = {
  id: string;
  name: string;
};

type BillingContractRecord = {
  id: string;
  payerAccountId: string | null;
  name: string;
  isActive: boolean;
  effectiveStartDate: Date | string;
  effectiveEndDate: Date | string | null;
  inspectionRules: { codeUnitPrices?: Record<string, number>; note?: string };
  serviceRules: { codeUnitPrices?: Record<string, number>; note?: string };
  emergencyRules: { codeUnitPrices?: Record<string, number>; note?: string };
  deficiencyRules: { codeUnitPrices?: Record<string, number>; note?: string };
  groupingRules: { mode?: "standard" | "group_by_site" | "group_by_inspection"; note?: string };
  attachmentRules: { requireFinalizedReport?: boolean; requireSignedDocument?: boolean; requiredDocumentLabels?: string[] };
  deliveryRules: { holdForManualReview?: boolean; deliveryMethod?: "payer_email" | "customer_email" | "manual"; recipientEmail?: string };
  referenceRules: { requirePo?: boolean; requireCustomerReference?: boolean; labels?: string[] };
};

type BillingContractProfileSettingsCardProps = {
  notice?: string | null;
  payerOptions: BillingPayerOption[];
  profiles: BillingContractRecord[];
  createAction: (
    _: { error: string | null; success: string | null },
    formData: FormData
  ) => Promise<{ error: string | null; success: string | null }>;
  updateAction: (formData: FormData) => Promise<void>;
};

function toDateInput(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function toCodePriceLines(value?: Record<string, number>) {
  return Object.entries(value ?? {})
    .map(([code, price]) => `${code}: ${price}`)
    .join("\n");
}

function ContractFields({
  prefix,
  payerOptions,
  profile
}: {
  prefix: string;
  payerOptions: BillingPayerOption[];
  profile?: BillingContractRecord;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-name`}>Contract profile name</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={profile?.name ?? ""} id={`${prefix}-name`} name="name" required />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-payerAccountId`}>Default payer</label>
        <select className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={profile?.payerAccountId ?? ""} id={`${prefix}-payerAccountId`} name="payerAccountId">
          <option value="">Any payer account</option>
          {payerOptions.map((payer) => (
            <option key={payer.id} value={payer.id}>{payer.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-effectiveStartDate`}>Effective start</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={toDateInput(profile?.effectiveStartDate)} id={`${prefix}-effectiveStartDate`} name="effectiveStartDate" required type="date" />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-effectiveEndDate`}>Effective end</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={toDateInput(profile?.effectiveEndDate)} id={`${prefix}-effectiveEndDate`} name="effectiveEndDate" type="date" />
      </div>
      <div className="md:col-span-2">
        <label className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">
          <input className="h-4 w-4 rounded border-slate-300 text-slateblue focus:ring-slateblue" defaultChecked={profile?.isActive ?? true} name="isActive" type="checkbox" />
          Active contract profile
        </label>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-inspectionCodeUnitPrices`}>Inspection price overrides</label>
        <textarea className="min-h-[100px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={toCodePriceLines(profile?.inspectionRules.codeUnitPrices)} id={`${prefix}-inspectionCodeUnitPrices`} name="inspectionCodeUnitPrices" placeholder="FA-ANNUAL: 250" />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-serviceCodeUnitPrices`}>Service price overrides</label>
        <textarea className="min-h-[100px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={toCodePriceLines(profile?.serviceRules.codeUnitPrices)} id={`${prefix}-serviceCodeUnitPrices`} name="serviceCodeUnitPrices" placeholder="SERVICE-CALL: 145" />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-emergencyCodeUnitPrices`}>Emergency overrides</label>
        <textarea className="min-h-[100px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={toCodePriceLines(profile?.emergencyRules.codeUnitPrices)} id={`${prefix}-emergencyCodeUnitPrices`} name="emergencyCodeUnitPrices" placeholder="EMERGENCY-CALL: 225" />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-deficiencyCodeUnitPrices`}>Deficiency overrides</label>
        <textarea className="min-h-[100px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={toCodePriceLines(profile?.deficiencyRules.codeUnitPrices)} id={`${prefix}-deficiencyCodeUnitPrices`} name="deficiencyCodeUnitPrices" placeholder="DEF-REPAIR: 95" />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-groupingMode`}>Grouping policy</label>
        <select className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={profile?.groupingRules.mode ?? "standard"} id={`${prefix}-groupingMode`} name="groupingMode">
          <option value="standard">Standard</option>
          <option value="group_by_site">Group by site</option>
          <option value="group_by_inspection">Group by inspection</option>
        </select>
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-deliveryMethod`}>Delivery method</label>
        <select className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={profile?.deliveryRules.deliveryMethod ?? "payer_email"} id={`${prefix}-deliveryMethod`} name="deliveryMethod">
          <option value="payer_email">Payer email</option>
          <option value="customer_email">Customer email</option>
          <option value="manual">Manual send</option>
        </select>
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-deliveryRecipientEmail`}>Delivery override email</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={profile?.deliveryRules.recipientEmail ?? ""} id={`${prefix}-deliveryRecipientEmail`} name="deliveryRecipientEmail" type="email" />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-referenceLabels`}>Reference labels</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={(profile?.referenceRules.labels ?? []).join(", ")} id={`${prefix}-referenceLabels`} name="referenceLabels" placeholder="PO, Job number, Store number" />
      </div>

      <div className="md:col-span-2 grid gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 md:grid-cols-2">
        <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
          <input className="h-4 w-4 rounded border-slate-300 text-slateblue focus:ring-slateblue" defaultChecked={profile?.deliveryRules.holdForManualReview ?? true} name="holdForManualReview" type="checkbox" />
          Hold for manual review
        </label>
        <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
          <input className="h-4 w-4 rounded border-slate-300 text-slateblue focus:ring-slateblue" defaultChecked={profile?.attachmentRules.requireFinalizedReport ?? false} name="requireFinalizedReport" type="checkbox" />
          Require finalized report
        </label>
        <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
          <input className="h-4 w-4 rounded border-slate-300 text-slateblue focus:ring-slateblue" defaultChecked={profile?.attachmentRules.requireSignedDocument ?? false} name="requireSignedDocument" type="checkbox" />
          Require signed document
        </label>
        <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
          <input className="h-4 w-4 rounded border-slate-300 text-slateblue focus:ring-slateblue" defaultChecked={profile?.referenceRules.requirePo ?? false} name="requirePo" type="checkbox" />
          Require PO
        </label>
        <label className="flex items-center gap-3 text-sm font-medium text-slate-700 md:col-span-2">
          <input className="h-4 w-4 rounded border-slate-300 text-slateblue focus:ring-slateblue" defaultChecked={profile?.referenceRules.requireCustomerReference ?? false} name="requireCustomerReference" type="checkbox" />
          Require customer reference
        </label>
      </div>

      <div className="md:col-span-2">
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`${prefix}-requiredDocumentLabels`}>Required attachment labels</label>
        <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" defaultValue={(profile?.attachmentRules.requiredDocumentLabels ?? []).join(", ")} id={`${prefix}-requiredDocumentLabels`} name="requiredDocumentLabels" placeholder="Signed report, Testing backup" />
      </div>
    </div>
  );
}

export function BillingContractProfileSettingsCard({
  notice,
  payerOptions,
  profiles,
  createAction,
  updateAction
}: BillingContractProfileSettingsCardProps) {
  const [state, formAction, pending] = useActionState(createAction, initialState);

  return (
    <div className="space-y-6 rounded-[2rem] bg-white p-6 shadow-panel">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Billing contract profiles</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">Effective-dated contract rules</h3>
        <p className="mt-2 text-sm text-slate-500">Keep phase 1 focused on routing, selected pricing overrides, delivery behavior, attachment requirements, and reference policy snapshots.</p>
      </div>

      <form action={formAction} className="space-y-4 rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
        <div>
          <p className="text-sm font-semibold text-ink">Add contract profile</p>
          <p className="mt-1 text-sm text-slate-500">Profiles can be reused across customers and evolve over time through effective dates instead of one-off customer exceptions.</p>
        </div>
        <ContractFields payerOptions={payerOptions} prefix="new-contract" />
        {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-emerald-600">{state.success}</p> : null}
        {notice ? <p className="text-sm text-slateblue">{notice}</p> : null}
        <button className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">
          {pending ? "Saving contract..." : "Add contract profile"}
        </button>
      </form>

      <div className="space-y-4">
        {profiles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No contract profiles configured yet.</p>
        ) : profiles.map((profile) => (
          <form action={updateAction} className="space-y-4 rounded-[1.5rem] border border-slate-200 p-4" key={profile.id}>
            <input name="contractProfileId" type="hidden" value={profile.id} />
            <div>
              <p className="text-lg font-semibold text-ink">{profile.name}</p>
              <p className="mt-1 text-sm text-slate-500">Update effective dates, targeted work-type overrides, and the review/delivery policy this profile contributes to billing snapshots.</p>
            </div>
            <ContractFields payerOptions={payerOptions} prefix={`contract-${profile.id}`} profile={profile} />
            <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
              Save contract profile
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
