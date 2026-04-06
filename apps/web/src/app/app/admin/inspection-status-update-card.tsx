"use client";

import { useActionState, useMemo, useState } from "react";

import {
  editableInspectionStatuses,
  formatInspectionStatusLabel,
  getInspectionStatusTone
} from "@testworx/lib";

import { StatusBadge } from "./operations-ui";

const initialState = {
  error: null as string | null,
  success: null as string | null
};

type InspectionStatus = (typeof editableInspectionStatuses)[number];

function getConfirmationMessage(currentStatus: InspectionStatus, nextStatus: InspectionStatus) {
  if (currentStatus === nextStatus) {
    return null;
  }

  if (currentStatus === "invoiced" && nextStatus !== "invoiced") {
    return "Move this inspection out of Invoiced? Confirm that billing has been corrected before continuing.";
  }

  if (nextStatus === "completed") {
    return "Mark this inspection completed? This can change which queues it appears in and may trigger follow-up scheduling.";
  }

  if (nextStatus === "invoiced") {
    return "Move this inspection to Invoiced? Use this only when billing is already finalized or you are correcting the record.";
  }

  if (nextStatus === "cancelled") {
    return "Cancel this inspection? It will be removed from active operational queues.";
  }

  return null;
}

export function InspectionStatusUpdateCard({
  action,
  inspectionId,
  currentStatus
}: {
  action: (
    _: { error: string | null; success: string | null },
    formData: FormData
  ) => Promise<{ error: string | null; success: string | null }>;
  inspectionId: string;
  currentStatus: InspectionStatus;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [selectedStatus, setSelectedStatus] = useState<InspectionStatus>(currentStatus);
  const [note, setNote] = useState("");

  const confirmationMessage = useMemo(
    () => getConfirmationMessage(currentStatus, selectedStatus),
    [currentStatus, selectedStatus]
  );

  return (
    <form
      action={formAction}
      className="rounded-[2rem] bg-white p-6 shadow-panel"
      onSubmit={(event) => {
        if (selectedStatus === currentStatus) {
          event.preventDefault();
          return;
        }

        if (confirmationMessage && !window.confirm(confirmationMessage)) {
          event.preventDefault();
        }
      }}
    >
      <input name="inspectionId" type="hidden" value={inspectionId} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Status correction</p>
          <h3 className="mt-2 text-2xl font-semibold text-ink">Update inspection status</h3>
          <p className="mt-2 text-sm text-slate-500">
            Office staff can correct the inspection status here without changing the normal technician workflow.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current status</p>
          <div className="mt-2">
            <StatusBadge
              label={formatInspectionStatusLabel(currentStatus)}
              tone={getInspectionStatusTone(currentStatus)}
            />
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">New status</span>
          <select
            className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-[#1f4678] focus:ring-4 focus:ring-[#1f4678]/10"
            name="status"
            onChange={(event) => setSelectedStatus(event.target.value as InspectionStatus)}
            value={selectedStatus}
          >
            {editableInspectionStatuses.map((status) => (
              <option key={status} value={status}>
                {formatInspectionStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Correction note (optional)</span>
          <textarea
            className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-[#1f4678] focus:ring-4 focus:ring-[#1f4678]/10"
            name="note"
            onChange={(event) => setNote(event.target.value)}
            placeholder="Example: Technician completed work but missed the final status update."
            value={note}
          />
        </label>
      </div>
      {confirmationMessage ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {confirmationMessage}
        </p>
      ) : null}
      {state.error ? (
        <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#1f4678] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending || selectedStatus === currentStatus}
          type="submit"
        >
          {pending ? "Saving status..." : "Save status"}
        </button>
        <p className="text-sm text-slate-500">
          Changes are audited and will update queue visibility after refresh.
        </p>
      </div>
    </form>
  );
}
