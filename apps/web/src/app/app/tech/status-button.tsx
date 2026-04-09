"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateInspectionStatusAction } from "./actions";

type InspectionStatus = Parameters<typeof updateInspectionStatusAction>[1];

export function StatusButton({ inspectionId, status, label }: { inspectionId: string; status: InspectionStatus; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        className="pressable min-h-12 w-full rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-ink shadow-sm disabled:opacity-60"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const result = await updateInspectionStatusAction(inspectionId, status);
          setError(result.error);
          if (result.ok) {
            router.refresh();
          }
        })}
        type="button"
      >
        {pending ? "Saving..." : label}
      </button>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
