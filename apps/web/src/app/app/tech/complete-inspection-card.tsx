"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { completeInspectionWithCloseoutRequestAction } from "./actions";

type RequestType = "none" | "follow_up_inspection" | "new_inspection";

const requestOptions: Array<{ value: RequestType; label: string; description: string }> = [
  {
    value: "none",
    label: "No additional inspection needed",
    description: "Close out the visit normally."
  },
  {
    value: "follow_up_inspection",
    label: "Request follow-up inspection",
    description: "Ask office staff to schedule a follow-up visit for this site."
  },
  {
    value: "new_inspection",
    label: "Request new inspection",
    description: "Ask office staff to create a separate new inspection."
  }
];

export function CompleteInspectionCard({ inspectionId }: { inspectionId: string }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [requestType, setRequestType] = useState<RequestType>("none");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <button
        className="pressable min-h-12 w-full rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-ink shadow-sm disabled:opacity-60"
        disabled={pending}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        {isOpen ? "Close completion options" : "Mark completed"}
      </button>
      {isOpen ? (
        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-sm font-semibold text-ink">Inspection closeout</p>
          <p className="mt-1 text-sm text-slate-500">
            Finish this inspection now, and optionally ask office staff to create the next visit.
          </p>
          <div className="mt-4 space-y-2">
            {requestOptions.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3">
                <input
                  checked={requestType === option.value}
                  className="mt-1 h-4 w-4 border-slate-300 text-slateblue"
                  name={`closeout-request-${inspectionId}`}
                  onChange={() => setRequestType(option.value)}
                  type="radio"
                  value={option.value}
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">{option.label}</span>
                  <span className="mt-1 block text-sm text-slate-500">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
          {requestType !== "none" ? (
            <div className="mt-4">
              <label className="text-sm font-semibold text-ink" htmlFor={`closeout-note-${inspectionId}`}>
                Request note
              </label>
              <textarea
                className="mt-2 min-h-28 w-full resize-none overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-slateblue focus:ring-2 focus:ring-slateblue/10"
                data-auto-grow="on"
                id={`closeout-note-${inspectionId}`}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Explain what needs to happen next so office staff can review and schedule correctly."
                value={note}
              />
            </div>
          ) : null}
          <p className="mt-4 text-xs uppercase tracking-[0.18em] text-slate-500">
            Complete the inspection first. Office staff will review any request before creating the next visit.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              className="pressable pressable-filled btn-brand-primary min-h-12 flex-1 rounded-[1.25rem] border border-transparent px-4 py-3 text-sm font-semibold disabled:opacity-60"
              disabled={pending}
              onClick={() => startTransition(async () => {
                const result = await completeInspectionWithCloseoutRequestAction(inspectionId, {
                  requestType,
                  note
                });
                setError(result.error);
                if (result.ok) {
                  setIsOpen(false);
                  setNote("");
                  setRequestType("none");
                  router.refresh();
                }
              })}
              type="button"
            >
              {pending ? "Saving..." : "Complete inspection"}
            </button>
            <button
              className="pressable min-h-12 rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60"
              disabled={pending}
              onClick={() => {
                setIsOpen(false);
                setError(null);
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
