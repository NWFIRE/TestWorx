"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removeInspectionTaskAdminAction } from "./actions";

export function AdminReportDeleteButton(input: {
  inspectionId: string;
  inspectionTaskId: string;
  taskLabel: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <button
        className="inline-flex min-h-11 items-center justify-center rounded-[1rem] border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
        disabled={pending}
        onClick={() => {
          const confirmed = window.confirm(
            `Delete ${input.taskLabel} from this inspection? This permanently deletes the report, signatures, photos, deficiencies, and generated PDFs tied to it.`
          );
          if (!confirmed) {
            return;
          }

          startTransition(async () => {
            setMessage(null);
            const result = await removeInspectionTaskAdminAction(input.inspectionId, input.inspectionTaskId);
            setMessage(result.ok ? "Report deleted." : result.error ?? "Unable to delete this report.");
            if (result.ok) {
              router.refresh();
            }
          });
        }}
        type="button"
      >
        {pending ? "Deleting..." : "Delete report"}
      </button>
      {message ? <p className={`text-xs ${message === "Report deleted." ? "text-emerald-600" : "text-rose-600"}`}>{message}</p> : null}
    </div>
  );
}
