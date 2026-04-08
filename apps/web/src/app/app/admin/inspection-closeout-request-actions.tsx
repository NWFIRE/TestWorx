"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { approveInspectionCloseoutRequestAction, dismissInspectionCloseoutRequestAction } from "./actions";

export function InspectionCloseoutRequestActions({ inspectionId, canApprove }: { inspectionId: string; canApprove: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
            {pending ? "Saving..." : "Approve and create inspection"}
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
