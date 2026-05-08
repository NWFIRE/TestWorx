"use client";

import { useState, useTransition } from "react";

import { removeInspectionTaskAction } from "./actions";
import { useConfirmDialog } from "../confirm-dialog";

export function RemoveReportTypeButton(input: {
  inspectionId: string;
  inspectionTaskId: string;
  taskLabel: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { confirm, dialog } = useConfirmDialog();

  return (
    <div className="space-y-2">
      <button
        className="pressable inline-flex min-h-11 items-center justify-center rounded-[1rem] border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
        disabled={isPending}
        onClick={async () => {
          const confirmed = await confirm({
            eyebrow: "Remove report type",
            title: `Remove ${input.taskLabel}?`,
            description: "Any draft content for this added report type will be deleted from this inspection.",
            confirmLabel: "Remove report",
            cancelLabel: "Cancel",
            variant: "danger"
          });
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
      {dialog}
      {message ? <p className={`text-xs ${message === "Report type removed." ? "text-emerald-600" : "text-rose-600"}`}>{message}</p> : null}
    </div>
  );
}
