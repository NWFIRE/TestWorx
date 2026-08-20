"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { useConfirmDialog } from "../../confirm-dialog";

const initialState = {
  error: null as string | null,
  success: null as string | null,
  redirectTo: null as string | null
};

export function FastInspectionDeleteButton({
  action,
  customerLabel,
  inspectionId,
  redirectTo
}: {
  action: (
    _: { error: string | null; success: string | null; redirectTo: string | null },
    formData: FormData
  ) => Promise<{ error: string | null; success: string | null; redirectTo: string | null }>;
  customerLabel: string;
  inspectionId: string;
  redirectTo: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const confirmedSubmitRef = useRef(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();

  useEffect(() => {
    if (state.success) {
      router.replace(state.redirectTo || redirectTo);
      router.refresh();
    }
  }, [redirectTo, router, state.redirectTo, state.success]);

  return (
    <>
      <form
        action={formAction}
        ref={formRef}
        onSubmit={async (event) => {
          if (!confirmedSubmitRef.current) {
            event.preventDefault();
            const confirmed = await confirm({
              eyebrow: "Danger zone",
              title: "Delete inspection?",
              description: `This permanently deletes the inspection for ${customerLabel}. Owned reports, attachments, signatures, deficiencies, and inspection documents are removed with it. This cannot be undone.`,
              confirmLabel: "Delete inspection",
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
        <input name="inspectionId" type="hidden" value={inspectionId} />
        <input name="redirectTo" type="hidden" value={redirectTo} />
        <button
          className="inline-flex min-h-10 items-center rounded-2xl border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Deleting..." : "Delete"}
        </button>
      </form>
      {state.error ? (
        <p className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 lg:col-span-8">
          {state.error}
        </p>
      ) : null}
      {dialog}
    </>
  );
}
