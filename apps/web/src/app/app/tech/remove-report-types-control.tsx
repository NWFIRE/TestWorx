"use client";

import { useId, useState } from "react";
import type { TechnicianMobileTaskWorkspaceSummary } from "./mobile-inspection-workspace";
import { RemoveReportTypeButton } from "./remove-report-type-button";

export function RemoveReportTypesControl({ inspectionId, tasks }: {
  inspectionId: string;
  tasks: TechnicianMobileTaskWorkspaceSummary[];
}) {
  const id = useId();
  const [selectedId, setSelectedId] = useState("");
  const candidates = tasks.filter((task) => task.isAvailableInTechnicianApp !== false && (!task.reportStatus || task.reportStatus === "draft"));
  const selected = candidates.find((task) => task.id === selectedId);
  if (tasks.length < 2 || candidates.length === 0) return null;
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <summary className="cursor-pointer font-medium text-slate-600">Remove unneeded report</summary>
      <div className="mt-3 space-y-3">
        <label className="block text-slate-600" htmlFor={id}>Report for this visit</label>
        <select className="min-h-11 w-full min-w-0 rounded-xl border border-slate-200 px-3" id={id} value={selected?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="">Select report</option>
          {candidates.map((task) => <option key={task.id} value={task.id}>{task.displayLabel}</option>)}
        </select>
        {selected ? <RemoveReportTypeButton key={selected.id} inspectionId={inspectionId} inspectionTaskId={selected.id} taskLabel={selected.displayLabel} /> : null}
      </div>
    </details>
  );
}
