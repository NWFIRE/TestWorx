"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteLocalReportDraft, listLocalReportDrafts, listSyncQueueEntries } from "./offline/offline-db";

import { removeInspectionTaskAction } from "./actions";
import { useConfirmDialog } from "../confirm-dialog";

export function RemoveReportTypeButton(input: {
  inspectionId: string;
  inspectionTaskId: string;
  taskLabel: string;
}) {
  const router = useRouter();
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
            description: "Remove this report from the current visit? Its draft answers, photos, and deficiencies will be deleted. Other reports and future service schedules are not changed. Signed or completed reports cannot be removed.",
            confirmLabel: "Remove report",
            cancelLabel: "Cancel",
            variant: "danger"
          });
          if (!confirmed) {
            return;
          }

          startTransition(async () => {
            setMessage(null);
            try {
              if (!navigator.onLine) throw new Error("Connect to the internet before removing a report.");
              const drafts = (await listLocalReportDrafts()).filter((draft) => draft.inspectionId === input.inspectionId && draft.taskId === input.inspectionTaskId);
              const queue = await listSyncQueueEntries(["pending", "syncing", "failed", "conflict"]);
              if (drafts.some((draft) => draft.syncStatus !== "synced" || draft.pendingFinalize || queue.some((entry) => entry.entityId === draft.reportId))) {
                throw new Error("Wait for this report to sync before removing it. Resolve any sync errors first.");
              }
              const result = await removeInspectionTaskAction(input.inspectionId, input.inspectionTaskId);
              if (!result.ok) throw new Error(result.error ?? "Unable to remove this report type.");
              await Promise.allSettled(drafts.map((draft) => deleteLocalReportDraft(draft.reportId)));
              setMessage("Report type removed.");
              // Do not leave the user on an editor whose report no longer exists.
              router.replace("/app/tech/work");
              router.refresh();
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Unable to remove this report type.");
            }
          });
        }}
        type="button"
      >
        {isPending ? "Removing..." : "Remove report"}
      </button>
      {dialog}
      {message ? <p className={`text-xs ${message === "Report type removed." ? "text-emerald-600" : "text-rose-600"}`}>{message}</p> : null}
    </div>
  );
}
