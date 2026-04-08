"use client";

import { useActionState, useEffect } from "react";

const initialState = {
  error: null as string | null,
  success: null as string | null,
  redirectTo: null as string | null
};

export function DeleteQuoteCard({
  action,
  quoteId,
  redirectTo,
  disabled = false
}: {
  action: (
    _: { error: string | null; success: string | null; redirectTo: string | null },
    formData: FormData
  ) => Promise<{ error: string | null; success: string | null; redirectTo: string | null }>;
  quoteId: string;
  redirectTo?: string | null;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.success && state.redirectTo) {
      window.location.replace(state.redirectTo);
    }
  }, [state.redirectTo, state.success]);

  return (
    <form
      action={formAction}
      className="rounded-[28px] border border-rose-200 bg-rose-50 p-5 lg:p-6"
      onSubmit={(event) => {
        if (!window.confirm("Delete this quote? This permanently removes the quote and its hosted approval history inside TradeWorx.")) {
          event.preventDefault();
        }
      }}
    >
      <input name="quoteId" type="hidden" value={quoteId} />
      <input name="redirectTo" type="hidden" value={redirectTo ?? ""} />
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-700">Danger zone</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">Delete quote</h2>
      <p className="mt-2 text-sm leading-6 text-rose-900">
        Admins can permanently delete quotes that have not been converted into work or synced to QuickBooks. Quote line items,
        hosted-link access, and reminder dispatch history are removed with the quote.
      </p>
      {state.error ? (
        <p className="mt-4 rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700">{state.error}</p>
      ) : null}
      <button
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled || pending}
        type="submit"
      >
        {pending ? "Deleting quote..." : "Delete quote"}
      </button>
    </form>
  );
}
