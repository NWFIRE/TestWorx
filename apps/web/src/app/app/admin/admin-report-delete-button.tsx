"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removeInspectionTaskAdminAction } from "./actions";
import { useConfirmDialog } from "../confirm-dialog";

export function AdminReportDeleteButton(input: {
  inspectionId: string;
  inspectionTaskId: string;
  taskLabel: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { confirm, dialog } = useConfirmDialog();

  return (
    <div className="space-y-2">
      <button
        className="inline-flex min-h-11 items-center justify-center rounded-[1rem] border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
        disabled={pending}
        onClick={async () => {
          const confirmed = await confirm({
            eyebrow: "Report type",
            title: `Delete ${input.taskLabel}?`,
            description: "This permanently removes this report type from the current inspection, including any draft work, photos, signatures, deficiencies, and report data tied to it.",
            confirmLabel: "Delete report type",
            cancelLabel: "Cancel",
            variant: "danger"
          });
          if (!confirmed) {
            return;
          }

          startTransition(async () => {
            setMessage(null);
            const result = await removeInspectionTaskAdminAction(input.inspectionId, input.inspectionTaskId);
            setMessage(result.ok ? "Report type deleted." : result.error ?? "Unable to delete this report type.");
            if (result.ok) {
              router.refresh();
            }
          });
        }}
        type="button"
      >
        {pending ? "Deleting..." : "Delete report type"}
      </button>
      {dialog}
      {message ? <p className={`text-xs ${message === "Report type deleted." ? "text-emerald-600" : "text-rose-600"}`}>{message}</p> : null}
    </div>
  );
}
