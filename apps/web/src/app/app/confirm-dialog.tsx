"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ConfirmDialogVariant = "default" | "danger" | "warning";

export type ConfirmDialogOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  eyebrow?: string;
  details?: Array<{ label: string; value: string | null | undefined }>;
  variant?: ConfirmDialogVariant;
};

type PendingConfirmation = ConfirmDialogOptions & {
  resolve: (value: boolean) => void;
};

function variantClasses(variant: ConfirmDialogVariant) {
  switch (variant) {
    case "danger":
      return {
        badge: "border-rose-200 bg-rose-50 text-rose-700",
        confirm: "bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-200"
      };
    case "warning":
      return {
        badge: "border-amber-200 bg-amber-50 text-amber-700",
        confirm: "bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-200"
      };
    default:
      return {
        badge: "border-blue-100 bg-blue-50 text-blue-700",
        confirm: "bg-slateblue text-white hover:brightness-110 focus:ring-blue-200"
      };
  }
}

export function useConfirmDialog() {
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogPanelRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback((confirmed: boolean) => {
    setPendingConfirmation((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  const confirm = useCallback((options: ConfirmDialogOptions) => new Promise<boolean>((resolve) => {
    setPendingConfirmation({ ...options, resolve });
  }), []);

  useEffect(() => {
    if (!pendingConfirmation) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimeout = window.setTimeout(() => cancelButtonRef.current?.focus(), 20);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      }
      if (event.key === "Enter") {
        event.preventDefault();
        close(true);
      }
      if (event.key === "Tab") {
        const focusable = dialogPanelRef.current?.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
        );
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
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimeout);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [close, pendingConfirmation]);

  const dialog = pendingConfirmation ? (
    <div
      aria-labelledby="tradeworx-confirm-title"
      aria-modal="true"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm animate-in fade-in duration-150"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close(false);
        }
      }}
      role="dialog"
    >
      <div className="max-h-[calc(100vh-3rem)] w-full max-w-lg overflow-y-auto rounded-[2rem] border border-white/80 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.24)] animate-in zoom-in-95 duration-200 sm:p-6" ref={dialogPanelRef}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className={`inline-flex rounded-full border px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.18em] ${variantClasses(pendingConfirmation.variant ?? "default").badge}`}>
              {pendingConfirmation.eyebrow ?? "Confirm action"}
            </span>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-slate-950" id="tradeworx-confirm-title">
              {pendingConfirmation.title}
            </h2>
          </div>
          <button
            aria-label="Close confirmation"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-xl leading-none text-slate-500 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-blue-100"
            onClick={() => close(false)}
            type="button"
          >
            x
          </button>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          {pendingConfirmation.description}
        </p>
        {pendingConfirmation.details?.length ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              {pendingConfirmation.details.map((detail) => (
                <div key={detail.label}>
                  <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">{detail.label}</dt>
                  <dd className="mt-1 truncate text-sm font-semibold text-slate-900">{detail.value || "Not recorded"}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100"
            onClick={() => close(false)}
            ref={cancelButtonRef}
            type="button"
          >
            {pendingConfirmation.cancelLabel ?? "Cancel"}
          </button>
          <button
            className={`inline-flex min-h-12 items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-4 ${variantClasses(pendingConfirmation.variant ?? "default").confirm}`}
            onClick={() => close(true)}
            type="button"
          >
            {pendingConfirmation.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}
