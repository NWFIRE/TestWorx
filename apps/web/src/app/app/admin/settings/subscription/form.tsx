"use client";
import { useActionState } from "react";
import { subscriptionAction } from "./actions";
export function SubscriptionForm({ connected, enabled, managed, canSubscribe }: { connected: boolean; enabled: boolean; managed: boolean; canSubscribe: boolean }) {
  const [state, action, pending] = useActionState(subscriptionAction, { error: "" });
  return <form action={action} className="space-y-4">
    {canSubscribe && managed ? <label className="block text-sm">Plan<select name="plan" className="ml-3 rounded-xl border p-3"><option value="starter">Starter</option><option value="professional">Professional</option></select></label> : null}
    <div className="flex flex-wrap gap-3">{connected ? <button name="action" value="portal" disabled={pending || !enabled} className="min-h-11 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{pending ? "Opening..." : "Manage subscription"}</button> : null}
    {canSubscribe ? <button name="action" value="checkout" disabled={pending || !enabled || !managed} className="min-h-11 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{pending ? "Opening..." : connected ? "Reactivate subscription" : "Subscribe"}</button> : null}</div>
    <p className="text-sm text-slate-500">Payment details, subscription invoices, and cancellation are managed securely in the billing portal.</p>
    {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
  </form>;
}
