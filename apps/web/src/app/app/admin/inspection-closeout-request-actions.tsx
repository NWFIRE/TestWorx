"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { approveInspectionCloseoutRequestAction, dismissInspectionCloseoutRequestAction } from "./actions";

type RequestType = "new_inspection" | "follow_up_inspection" | "customer_refused" | "wrong_due_month";

export function InspectionCloseoutRequestActions({
  inspectionId,
  canApprove,
  requestType
}: {
  inspectionId: string;
  canApprove: boolean;
  requestType?: RequestType;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const createsInspection = requestType === "new_inspection" || requestType === "follow_up_inspection";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        {canApprove ? (
          <button
            className="min-h-11 rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            disabled={pending}
            onClick={() => startTransition(async () => {
              const result = await approveInspectionCloseoutRequestAction(inspectionId);
              setError(result.error);
              if (result.ok) {
                router.refresh();
              }
            })}
            type="button"
          >
            {pending ? "Saving..." : createsInspection ? "Approve and create inspection" : "Mark reviewed"}
          </button>
        ) : null}
        <button
          className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60"
          disabled={pending}
          onClick={() => startTransition(async () => {
            const result = await dismissInspectionCloseoutRequestAction(inspectionId);
            setError(result.error);
            if (result.ok) {
              router.refresh();
            }
          })}
          type="button"
        >
          {pending ? "Saving..." : "Dismiss request"}
        </button>
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
