"use client";

import { useState, useTransition } from "react";

import { removeInspectionTaskAction } from "./actions";

export function RemoveReportTypeButton(input: {
  inspectionId: string;
  inspectionTaskId: string;
  taskLabel: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <button
        className="pressable inline-flex min-h-11 items-center justify-center rounded-[1rem] border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
        disabled={isPending}
        onClick={() => {
          const confirmed = window.confirm(`Remove ${input.taskLabel} from this inspection? Any draft content for this added report type will be deleted.`);
          if (!confirmed) {
            return;
          }

          startTransition(async () => {
            setMessage(null);
            const result = await removeInspectionTaskAction(input.inspectionId, input.inspectionTaskId);
            setMessage(result.ok ? "Report type removed." : result.error ?? "Unable to remove this report type.");
          });
        }}
        type="button"
      >
        {isPending ? "Removing..." : "Remove added report"}
      </button>
      {message ? <p className={`text-xs ${message === "Report type removed." ? "text-emerald-600" : "text-rose-600"}`}>{message}</p> : null}
    </div>
  );
}
