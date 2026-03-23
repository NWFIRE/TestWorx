"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { claimInspectionAction } from "./actions";

export function ClaimButton({ inspectionId }: { inspectionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        className="min-h-14 w-full rounded-[1.25rem] bg-slateblue px-5 py-4 text-base font-semibold text-white shadow-sm disabled:opacity-60"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const result = await claimInspectionAction(inspectionId);
          setError(result.error);
          if (result.ok) {
            router.refresh();
          }
        })}
        type="button"
      >
        {pending ? "Claiming..." : "Claim inspection"}
      </button>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
