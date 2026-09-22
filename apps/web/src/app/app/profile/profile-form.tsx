"use client";

import { useActionState } from "react";

type State = { error: string | null; success: string | null };
export function ProfileForm({ name, action }: { name: string; action: (state: State, data: FormData) => Promise<State> }) {
  const [state, formAction, pending] = useActionState(action, { error: null, success: null });
  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="profile-name" className="mb-2 block text-sm font-medium text-slate-700">Display name</label>
        <input id="profile-name" name="name" autoComplete="name" defaultValue={name} required maxLength={100} disabled={pending}
          aria-describedby="profile-name-help" className="min-h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 sm:text-sm" />
        <p id="profile-name-help" className="mt-2 text-xs leading-5 text-slate-500">The name your team sees throughout TradeWorx.</p>
      </div>
      {state.error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p> : null}
      {state.success ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{state.success}</p> : null}
      <div className="flex justify-end border-t border-slate-100 pt-4">
        <button type="submit" disabled={pending} className="btn-brand-primary min-h-11 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60">{pending ? "Saving..." : "Save changes"}</button>
      </div>
    </form>
  );
}
