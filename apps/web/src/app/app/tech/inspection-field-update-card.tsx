"use client";

import { useState, useTransition } from "react";

import { submitInspectionFieldUpdateAction } from "./actions";

type FieldUpdateType = "customer_refused" | "wrong_due_month";

function getCurrentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function InspectionFieldUpdateCard({ inspectionId }: { inspectionId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [requestType, setRequestType] = useState<FieldUpdateType>("customer_refused");
  const [requestedDueMonth, setRequestedDueMonth] = useState(getCurrentMonthValue());
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-4 rounded-[1.45rem] border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-950">Something changed at the site?</p>
          <p className="mt-1 text-sm text-amber-900">Tell the office if the customer refused or this visit belongs in a different month.</p>
        </div>
        <button
          className="min-h-11 rounded-2xl border border-amber-300 bg-white px-4 py-3 text-sm font-semibold text-amber-950 shadow-sm disabled:opacity-60"
          disabled={pending}
          onClick={() => {
            setIsOpen((current) => !current);
            setError(null);
            setMessage(null);
          }}
          type="button"
        >
          {isOpen ? "Close" : "Field update"}
        </button>
      </div>

      {isOpen ? (
        <div className="mt-4 space-y-4 border-t border-amber-200 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              className={`min-h-16 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                requestType === "customer_refused"
                  ? "border-amber-500 bg-white text-amber-950 shadow-sm"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
              onClick={() => setRequestType("customer_refused")}
              type="button"
            >
              Customer refused inspection
            </button>
            <button
              className={`min-h-16 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                requestType === "wrong_due_month"
                  ? "border-amber-500 bg-white text-amber-950 shadow-sm"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
              onClick={() => setRequestType("wrong_due_month")}
              type="button"
            >
              Due in a different month
            </button>
          </div>

          {requestType === "wrong_due_month" ? (
            <div>
              <label className="text-sm font-semibold text-amber-950" htmlFor={`requested-due-month-${inspectionId}`}>
                Correct due month
              </label>
              <input
                className="mt-2 min-h-12 w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-base font-semibold text-slate-950 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                id={`requested-due-month-${inspectionId}`}
                onChange={(event) => setRequestedDueMonth(event.target.value)}
                type="month"
                value={requestedDueMonth}
              />
            </div>
          ) : null}

          <div>
            <label className="text-sm font-semibold text-amber-950" htmlFor={`field-update-note-${inspectionId}`}>
              {requestType === "customer_refused" ? "What happened?" : "Optional note"}
            </label>
            <textarea
              className="mt-2 min-h-24 w-full resize-none overflow-hidden rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              data-auto-grow="on"
              id={`field-update-note-${inspectionId}`}
              onChange={(event) => setNote(event.target.value)}
              placeholder={requestType === "customer_refused" ? "Example: Customer was closed and refused service today." : "Add anything office staff should know."}
              value={note}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              className="btn-brand-primary min-h-12 rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
              disabled={pending}
              onClick={() => startTransition(async () => {
                setError(null);
                setMessage(null);
                const result = await submitInspectionFieldUpdateAction(inspectionId, requestType === "customer_refused"
                  ? { requestType, note }
                  : { requestType, requestedDueMonth, note });

                if (result.ok) {
                  setMessage("Office staff have been notified.");
                  setNote("");
                  setIsOpen(false);
                } else {
                  setError(result.error);
                }
              })}
              type="button"
            >
              {pending ? "Sending..." : "Send to office"}
            </button>
            <button
              className="min-h-12 rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-amber-950 disabled:opacity-60"
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

      {message ? <p className="mt-3 text-sm font-semibold text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
    </div>
  );
}
