"use client";

import { useActionState } from "react";

const initialState = {
  error: null as string | null,
  success: null as string | null
};

export function InspectionScheduleDateCard({
  action,
  currentScheduledLabel,
  inspectionId,
  scheduledEnd,
  scheduledStart
}: {
  action: (
    _: { error: string | null; success: string | null },
    formData: FormData
  ) => Promise<{ error: string | null; success: string | null }>;
  currentScheduledLabel: string;
  inspectionId: string;
  scheduledEnd: string;
  scheduledStart: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="rounded-[2rem] bg-white p-6 shadow-panel">
      <input name="inspectionId" type="hidden" value={inspectionId} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Schedule</p>
          <h3 className="mt-2 text-2xl font-semibold text-ink">Change scheduled date</h3>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current</p>
          <p className="mt-2 text-sm font-semibold text-slate-950">{currentScheduledLabel}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Scheduled start</span>
          <input
            className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-slateblue focus:ring-4 focus:ring-slateblue/10"
            defaultValue={scheduledStart}
            name="scheduledStart"
            required
            type="datetime-local"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Scheduled end</span>
          <input
            className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-slateblue focus:ring-4 focus:ring-slateblue/10"
            defaultValue={scheduledEnd}
            name="scheduledEnd"
            type="datetime-local"
          />
        </label>
      </div>
      <p className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Saving updates this existing visit, its service due month, and linked recurrence schedule. No new visit is created.
      </p>
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
      <button
        className="mt-5 inline-flex min-h-12 items-center justify-center rounded-2xl bg-slateblue px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving schedule..." : "Save schedule"}
      </button>
    </form>
  );
}
