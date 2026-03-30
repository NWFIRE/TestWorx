"use client";

import { useActionState, useEffect } from "react";

const initialState = { error: null as string | null, success: null as string | null };

export function DeleteInspectionCard({
  action,
  inspectionId,
  disabled = false
}: {
  action: (_: { error: string | null; success: string | null }, formData: FormData) => Promise<{ error: string | null; success: string | null }>;
  inspectionId: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.success) {
      window.location.replace("/app/admin?inspection=deleted");
    }
  }, [state.success]);

  return (
    <form
      action={formAction}
      className="rounded-[2rem] border border-rose-200 bg-rose-50 p-6"
      onSubmit={(event) => {
        if (!window.confirm("Delete this inspection and all of its owned report records? This cannot be undone.")) {
          event.preventDefault();
        }
      }}
    >
      <input name="inspectionId" type="hidden" value={inspectionId} />
      <p className="text-sm uppercase tracking-[0.25em] text-rose-700">Danger zone</p>
      <h3 className="mt-2 text-2xl font-semibold text-ink">Delete inspection</h3>
      <p className="mt-3 text-sm text-rose-900">
        Admins can permanently delete inspections that are not tied to amendment history or invoicing/QuickBooks records. Owned
        reports, attachments, signatures, deficiencies, and inspection documents are removed with the inspection.
      </p>
      {state.error ? <p className="mt-4 rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700">{state.error}</p> : null}
      <button
        className="mt-5 inline-flex min-h-12 items-center justify-center rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled || pending}
        type="submit"
      >
        {pending ? "Deleting inspection..." : "Delete inspection"}
      </button>
    </form>
  );
}
