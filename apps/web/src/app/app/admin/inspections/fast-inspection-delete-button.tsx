"use client";

import { useState } from "react";
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
  hasRecurrence = false,
  redirectTo
}: {
  action: (
    _: { error: string | null; success: string | null; redirectTo: string | null },
    formData: FormData
  ) => Promise<{ error: string | null; success: string | null; redirectTo: string | null }>;
  customerLabel: string;
  inspectionId: string;
  hasRecurrence?: boolean;
  redirectTo: string;
}) {
  const [state, setState] = useState(initialState);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const { confirm, choose, dialog } = useConfirmDialog();

  const handleDelete = async () => {
    if (isDeleting) {
      return;
    }

    const deleteChoice = hasRecurrence
      ? await choose({
          eyebrow: "Recurring inspection",
          title: "How much should be deleted?",
          description: `Delete only this scheduled inspection for ${customerLabel}, or delete it together with all future inspections in the same recurrence. Past inspections will not be removed.`,
          confirmLabel: "Delete this and all future",
          alternateLabel: "Delete only this inspection",
          cancelLabel: "Cancel",
          variant: "danger"
        })
      : await confirm({
          eyebrow: "Danger zone",
          title: "Delete inspection?",
          description: `This permanently deletes the inspection for ${customerLabel}. Owned reports, attachments, signatures, deficiencies, and inspection documents are removed with it. This cannot be undone.`,
          confirmLabel: "Delete inspection",
          cancelLabel: "Cancel",
          variant: "danger"
        }).then((confirmed) => confirmed ? "alternate" as const : "cancel" as const);

    if (deleteChoice === "cancel") {
      return;
    }

    setIsDeleting(true);
    setState(initialState);

    try {
      const formData = new FormData();
      formData.set("inspectionId", inspectionId);
      formData.set("redirectTo", redirectTo);
      formData.set("deleteScope", deleteChoice === "confirm" ? "future" : "single");

      const result = await action(initialState, formData);
      setState(result);

      if (result.success) {
        const target = result.redirectTo || redirectTo;
        if (target && target !== window.location.pathname + window.location.search) {
          router.replace(target);
        } else {
          router.refresh();
        }
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <button
        className="inline-flex min-h-10 items-center rounded-2xl border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isDeleting}
        onClick={handleDelete}
        type="button"
      >
        {isDeleting ? "Deleting..." : "Delete"}
      </button>
      {state.error ? (
        <p className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 lg:col-span-8">
          {state.error}
        </p>
      ) : null}
      {dialog}
    </>
  );
}
