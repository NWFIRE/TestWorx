"use client";

import { useState, useTransition } from "react";

import { inspectionTypeRegistry } from "@testworx/lib";

import { addInspectionTaskAction } from "./actions";

type InspectionType = keyof typeof inspectionTypeRegistry;

export function AddReportTypeControl({ inspectionId }: { inspectionId: string }) {
  const [selectedType, setSelectedType] = useState<InspectionType>("fire_extinguisher");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inspectionTypeOptions = Object.entries(inspectionTypeRegistry) as Array<
    [InspectionType, (typeof inspectionTypeRegistry)[InspectionType]]
  >;

  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-ink">Add report type</p>
      <p className="mt-1 text-sm text-slate-500">Add another report to this assigned inspection, including another copy of the same type if needed.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <div className="flex-1 space-y-3">
          <div className="sm:hidden">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {inspectionTypeRegistry[selectedType].label}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {inspectionTypeOptions.map(([inspectionType, inspectionConfig]) => {
                const isActive = inspectionType === selectedType;
                return (
                  <button
                    key={inspectionType}
                    className={`min-h-12 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                      isActive
                        ? "border-slateblue bg-slateblue text-white"
                        : "border-slate-200 bg-white text-slate-700"
                    } disabled:opacity-60`}
                    disabled={isPending}
                    onClick={() => setSelectedType(inspectionType)}
                    type="button"
                  >
                    {inspectionConfig.label}
                  </button>
                );
              })}
            </div>
          </div>
          <select
            className="hidden min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm sm:block"
            disabled={isPending}
            onChange={(event) => setSelectedType(event.target.value as InspectionType)}
            value={selectedType}
          >
            {inspectionTypeOptions.map(([inspectionType, inspectionConfig]) => (
              <option key={inspectionType} value={inspectionType}>
                {inspectionConfig.label}
              </option>
            ))}
          </select>
        </div>
        <button
          className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slateblue disabled:opacity-60"
          disabled={isPending}
          onClick={() => {
            const selectedLabel = inspectionTypeRegistry[selectedType].label;
            const confirmed = window.confirm(`Add ${selectedLabel} to this inspection? This creates another report task for the current visit.`);
            if (!confirmed) {
              return;
            }

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
