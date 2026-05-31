"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { useConfirmDialog } from "../../confirm-dialog";

const initialState = {
  error: null as string | null,
  success: null as string | null,
  redirectTo: null as string | null
};

export function DeleteCustomerCard({
  action,
  customerCompanyId,
  customerName,
  redirectTo,
  disabled = false
}: {
  action: (
    _: { error: string | null; success: string | null; redirectTo: string | null },
    formData: FormData
  ) => Promise<{ error: string | null; success: string | null; redirectTo: string | null }>;
  customerCompanyId: string;
  customerName: string;
  redirectTo?: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement | null>(null);
  const confirmedSubmitRef = useRef(false);
  const { confirm, dialog } = useConfirmDialog();

  useEffect(() => {
    if (state.success && state.redirectTo) {
      router.replace(state.redirectTo);
    }
  }, [router, state.redirectTo, state.success]);

  return (
    <form
      action={formAction}
      className="rounded-[28px] border border-rose-200 bg-rose-50 p-5 lg:p-6"
      id="delete-customer"
      ref={formRef}
      onSubmit={async (event) => {
        if (!confirmedSubmitRef.current) {
          event.preventDefault();
          const confirmed = await confirm({
            eyebrow: "Danger zone",
            title: `Delete ${customerName}?`,
            description: "This permanently removes the customer record when no linked history remains. TradeWorx will block deletion if linked users, sites, inspections, quotes, or billing history still exist.",
            confirmLabel: "Delete customer",
            cancelLabel: "Cancel",
            variant: "danger"
          });
          if (confirmed) {
            confirmedSubmitRef.current = true;
            formRef.current?.requestSubmit();
          }
          return;
        }
        confirmedSubmitRef.current = false;
      }}
    >
      <input name="customerCompanyId" type="hidden" value={customerCompanyId} />
      <input name="redirectTo" type="hidden" value={redirectTo ?? ""} />
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-700">Danger zone</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">Delete customer</h2>
      <p className="mt-2 text-sm leading-6 text-rose-900">
        TradeWorx only deletes customers that do not have linked users, sites, inspections, quotes, or billing history. Lightweight reminder logs and customer-specific service fee rules are cleaned up automatically.
      </p>
      {state.error ? (
        <p className="mt-4 rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700">{state.error}</p>
      ) : null}
      <button
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled || pending}
        type="submit"
      >
        {pending ? "Deleting customer..." : "Delete customer"}
      </button>
      {dialog}
    </form>
  );
}
