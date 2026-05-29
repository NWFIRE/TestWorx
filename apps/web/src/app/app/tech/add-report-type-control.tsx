"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { inspectionTypeRegistry } from "@testworx/lib";

import { addInspectionTaskAction } from "./actions";

type InspectionType = keyof typeof inspectionTypeRegistry;

type ExistingReportSummary = {
  id: string;
  displayLabel: string;
};

const preferredInspectionTypes: InspectionType[] = [
  "fire_alarm",
  "wet_fire_sprinkler",
  "kitchen_suppression",
  "fire_extinguisher",
  "emergency_exit_lighting",
  "industrial_suppression",
  "backflow",
  "work_order"
];

function orderedInspectionTypes() {
  const allTypes = Object.keys(inspectionTypeRegistry) as InspectionType[];
  const preferred = preferredInspectionTypes.filter((type) => type in inspectionTypeRegistry);
  const remaining = allTypes.filter((type) => !preferred.includes(type));
  return [...preferred, ...remaining];
}

export function AddReportTypeControl({
  inspectionId,
  existingReports = [],
  buttonClassName,
  buttonLabel = "Add Report"
}: {
  inspectionId: string;
  existingReports?: ExistingReportSummary[];
  buttonClassName?: string;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addedReport, setAddedReport] = useState<{ taskId: string; label: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const modalPanelRef = useRef<HTMLDivElement | null>(null);

  const normalizedExistingLabels = useMemo(
    () => existingReports.map((report) => report.displayLabel.trim().toLowerCase()),
    [existingReports]
  );
  const filteredTypes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orderedInspectionTypes().filter((type) => {
      const config = inspectionTypeRegistry[type];
      if (!query) {
        return true;
      }
      return `${config.label} ${config.description}`.toLowerCase().includes(query);
    });
  }, [search]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimeout = window.setTimeout(() => modalPanelRef.current?.querySelector<HTMLElement>("input, button")?.focus(), 20);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
      if (event.key === "Tab") {
        const focusable = modalPanelRef.current?.querySelectorAll<HTMLElement>("button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])");
        if (!focusable?.length) {
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimeout);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  function resetAndOpen() {
    setMessage(null);
    setErrorMessage(null);
    setAddedReport(null);
    setSearch("");
    setIsOpen(true);
  }

  function addReport(inspectionType: InspectionType) {
    const label = inspectionTypeRegistry[inspectionType].label;
    startTransition(async () => {
      setMessage(null);
      setErrorMessage(null);
      setAddedReport(null);
      const result = await addInspectionTaskAction(inspectionId, inspectionType);
      if (!result.ok || !result.taskId) {
        setErrorMessage(result.error ?? "Could not add report. Please try again.");
        return;
      }

      setMessage(`${label} report added to this inspection.`);
      setAddedReport({ taskId: result.taskId, label });
      router.refresh();
    });
  }

  return (
    <>
      <button
        className={buttonClassName ?? "min-h-10 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-100"}
        onClick={resetAndOpen}
        type="button"
      >
        {buttonLabel}
      </button>

      {isOpen ? (
        <div
          aria-labelledby="add-report-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-3 py-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
          role="dialog"
        >
          <div className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.35)]" ref={modalPanelRef}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">Current visit</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950" id="add-report-title">Add Report to This Inspection</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Choose the additional report needed for this visit.</p>
              </div>
              <button
                className="grid min-h-10 min-w-10 place-items-center rounded-full border border-slate-200 bg-white text-lg font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                x
              </button>
            </div>

            <div className="max-h-[calc(92vh-9rem)] overflow-y-auto px-5 py-5 sm:px-6">
              {message ? (
                <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                  <p className="text-sm font-semibold text-emerald-900">{message}</p>
                  {addedReport ? (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <button
                        className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-800"
                        onClick={() => router.push(`/app/tech/reports/${inspectionId}/${addedReport.taskId}`)}
                        type="button"
                      >
                        Start Report
                      </button>
                      <button
                        className="min-h-11 rounded-xl border border-emerald-200 bg-white px-4 text-sm font-bold text-emerald-800"
                        onClick={() => {
                          setMessage(null);
                          setAddedReport(null);
                        }}
                        type="button"
                      >
                        Add another
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {errorMessage ? (
                <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{errorMessage}</p>
              ) : null}

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Search report types</span>
                <input
                  autoFocus
                  className="mt-2 min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Fire alarm, extinguisher, work order..."
                  type="search"
                  value={search}
                />
              </label>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {filteredTypes.map((inspectionType) => {
                  const config = inspectionTypeRegistry[inspectionType];
                  const hasSameLabel = normalizedExistingLabels.includes(config.label.toLowerCase());
                  return (
                    <div
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/60"
                      key={inspectionType}
                    >
                      <div className="flex min-h-24 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">{config.label}</h3>
                          <p className="mt-1 text-sm leading-5 text-slate-600">{config.description}</p>
                          {hasSameLabel ? (
                            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                              Adds another separate copy. Existing report data stays isolated.
                            </p>
                          ) : null}
                        </div>
                        <button
                          className="min-h-11 shrink-0 rounded-full bg-blue-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
                          disabled={isPending}
                          onClick={() => addReport(inspectionType)}
                          type="button"
                        >
                          {isPending ? "Adding..." : "Add"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredTypes.length === 0 ? (
                <p className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-700">
                  No report types match that search.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
