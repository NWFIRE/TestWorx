"use client";

import { useState, useTransition } from "react";
import type { InspectionType } from "@prisma/client";

import { inspectionTypeRegistry } from "@testworx/lib";

import { addInspectionTaskAction } from "./actions";

export function AddReportTypeControl({ inspectionId }: { inspectionId: string }) {
  const [selectedType, setSelectedType] = useState<InspectionType>("fire_extinguisher");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-ink">Add report type</p>
      <p className="mt-1 text-sm text-slate-500">Add another report to this assigned inspection, including another copy of the same type if needed.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <select
          className="min-h-12 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
          disabled={isPending}
          onChange={(event) => setSelectedType(event.target.value as InspectionType)}
          value={selectedType}
        >
          {(Object.keys(inspectionTypeRegistry) as InspectionType[]).map((inspectionType) => (
            <option key={inspectionType} value={inspectionType}>
              {inspectionTypeRegistry[inspectionType].label}
            </option>
          ))}
        </select>
        <button
          className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slateblue disabled:opacity-60"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              setMessage(null);
              const result = await addInspectionTaskAction(inspectionId, selectedType);
              setMessage(result.ok ? "Report type added." : result.error ?? "Unable to add report type.");
            });
          }}
          type="button"
        >
          {isPending ? "Adding..." : "Add report type"}
        </button>
      </div>
      {message ? <p className={`mt-2 text-sm ${message === "Report type added." ? "text-emerald-600" : "text-rose-600"}`}>{message}</p> : null}
    </div>
  );
}
