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
            `Remove ${input.taskLabel} from this inspection? This is only allowed when no technician work has been recorded.`
          );
          if (!confirmed) {
            return;
          }

          startTransition(async () => {
            setMessage(null);
            const result = await removeInspectionTaskAdminAction(input.inspectionId, input.inspectionTaskId);
            setMessage(result.ok ? "Report removed." : result.error ?? "Unable to remove this report.");
            if (result.ok) {
              router.refresh();
            }
          });
        }}
        type="button"
      >
        {pending ? "Removing..." : "Remove report"}
      </button>
      {message ? <p className={`text-xs ${message === "Report removed." ? "text-emerald-600" : "text-rose-600"}`}>{message}</p> : null}
    </div>
  );
}
