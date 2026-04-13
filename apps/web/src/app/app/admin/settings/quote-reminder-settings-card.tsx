"use client";

import { useActionState } from "react";

type QuoteReminderSettingsValues = {
  enabled: boolean;
  sentNotViewedFirstBusinessDays: number;
  sentNotViewedSecondBusinessDays: number;
  viewedPendingFirstBusinessDays: number;
  viewedPendingSecondBusinessDays: number;
  expiringSoonDays: number;
  expiredFollowUpEnabled: boolean;
  expiredFollowUpDays: number;
  maxAutoReminders: number;
  templates: {
    sentNotViewed: { subject: string; body: string };
    viewedPending: { subject: string; body: string };
    expiringSoon: { subject: string; body: string };
    expired: { subject: string; body: string };
  };
};

const initialState = { error: null as string | null, success: null as string | null };
const templateSections = [
  ["sentNotViewed", "Sent but not viewed"],
  ["viewedPending", "Viewed but pending"],
  ["expiringSoon", "Expiring soon"],
  ["expired", "Expired"]
] as const satisfies ReadonlyArray<[keyof QuoteReminderSettingsValues["templates"], string]>;

export function QuoteReminderSettingsCard({
  values,
  action,
  embedded = false
}: {
  values: QuoteReminderSettingsValues;
  action: (_: { error: string | null; success: string | null }, formData: FormData) => Promise<{ error: string | null; success: string | null }>;
  embedded?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const containerClass = embedded ? "space-y-5" : "space-y-5 rounded-[2rem] bg-white p-6 shadow-panel";

  return (
    <form action={formAction} className={containerClass}>
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Quote reminders</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">Automated follow-up</h3>
        <p className="mt-2 text-sm text-slate-500">Automatically follow up on quotes that were sent, viewed, or are nearing expiration without changing the existing quote lifecycle.</p>
      </div>

      <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
        <input className="mt-1 h-4 w-4 rounded border-slate-300" defaultChecked={values.enabled} name="enabled" type="checkbox" />
        <span>
          <span className="block text-sm font-semibold text-slate-900">Enable automatic quote reminders</span>
          <span className="mt-1 block text-sm text-slate-500">TradeWorx will evaluate sent and viewed quotes server-side and send reminders only when the quote is still actionable.</span>
        </span>
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="sentNotViewedFirstBusinessDays">Sent, not viewed: first reminder</label>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values.sentNotViewedFirstBusinessDays} id="sentNotViewedFirstBusinessDays" min={1} name="sentNotViewedFirstBusinessDays" type="number" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="sentNotViewedSecondBusinessDays">Sent, not viewed: second reminder</label>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values.sentNotViewedSecondBusinessDays} id="sentNotViewedSecondBusinessDays" min={1} name="sentNotViewedSecondBusinessDays" type="number" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="viewedPendingFirstBusinessDays">Viewed, pending: first reminder</label>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values.viewedPendingFirstBusinessDays} id="viewedPendingFirstBusinessDays" min={1} name="viewedPendingFirstBusinessDays" type="number" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="viewedPendingSecondBusinessDays">Viewed, pending: second reminder</label>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values.viewedPendingSecondBusinessDays} id="viewedPendingSecondBusinessDays" min={1} name="viewedPendingSecondBusinessDays" type="number" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="expiringSoonDays">Expiring soon reminder</label>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values.expiringSoonDays} id="expiringSoonDays" min={1} name="expiringSoonDays" type="number" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="maxAutoReminders">Max automatic reminders</label>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values.maxAutoReminders} id="maxAutoReminders" max={6} min={1} name="maxAutoReminders" type="number" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-end">
        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
          <input className="mt-1 h-4 w-4 rounded border-slate-300" defaultChecked={values.expiredFollowUpEnabled} name="expiredFollowUpEnabled" type="checkbox" />
          <span>
            <span className="block text-sm font-semibold text-slate-900">Send expired quote follow-up</span>
            <span className="mt-1 block text-sm text-slate-500">Send one final customer-friendly notice after a quote expires.</span>
          </span>
        </label>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="expiredFollowUpDays">Days after expiry</label>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values.expiredFollowUpDays} id="expiredFollowUpDays" min={1} name="expiredFollowUpDays" type="number" />
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Reminder templates</p>
          <p className="mt-1 text-sm text-slate-500">
            Use <code>{"{{quoteNumber}}"}</code>, <code>{"{{customerName}}"}</code>, and <code>{"{{total}}"}</code> in subjects or body copy.
          </p>
        </div>

        {templateSections.map(([key, label]) => {
          const template = values.templates[key];
          return (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4" key={key}>
              <p className="text-sm font-semibold text-slate-900">{label}</p>
              <div className="mt-3 space-y-3">
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                  defaultValue={template.subject}
                  name={`template${key.charAt(0).toUpperCase()}${key.slice(1)}Subject`}
                />
                <textarea
                  className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                  defaultValue={template.body}
                  name={`template${key.charAt(0).toUpperCase()}${key.slice(1)}Body`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-600">{state.success}</p> : null}

      <button className="w-full rounded-2xl bg-slateblue px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Saving reminder settings..." : "Save reminder settings"}
      </button>
    </form>
  );
}
