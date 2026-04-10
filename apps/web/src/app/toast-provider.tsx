"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type ToastTone = "success" | "error" | "info";

type ToastInput = {
  title: string;
  description?: string | null;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastRecord = ToastInput & {
  id: string;
  tone: ToastTone;
};

const ToastContext = createContext<{ showToast: (input: ToastInput) => void } | null>(null);

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const toneClasses: Record<ToastTone, string> = {
  success: "border-emerald-200 bg-white text-slate-900 shadow-[0_18px_44px_rgba(5,150,105,0.12)]",
  error: "border-rose-200 bg-white text-slate-900 shadow-[0_18px_44px_rgba(225,29,72,0.12)]",
  info: "border-slate-200 bg-white text-slate-900 shadow-[0_18px_44px_rgba(15,23,42,0.12)]"
};

const accentClasses: Record<ToastTone, string> = {
  success: "bg-emerald-500",
  error: "bg-rose-500",
  info: "bg-[var(--tenant-primary)]"
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timeouts = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const existingTimeout = timeouts.current.get(id);
    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
      timeouts.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((input: ToastInput) => {
    const id = crypto.randomUUID();
    const nextToast: ToastRecord = {
      id,
      title: input.title,
      description: input.description,
      tone: input.tone ?? "info",
      durationMs: input.durationMs ?? 4200
    };
    setToasts((current) => [...current, nextToast]);
    const timeoutId = window.setTimeout(() => dismissToast(id), nextToast.durationMs ?? 4200);
    timeouts.current.set(id, timeoutId);
  }, [dismissToast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-atomic="true"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-[90] flex flex-col items-center gap-3 px-4 sm:top-6 sm:items-end sm:px-6"
      >
        {toasts.map((toast) => (
          <div
            className={cn(
              "pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-[22px] border p-4 transition-all duration-200 ease-out sm:max-w-[24rem]",
              "toast-card",
              toneClasses[toast.tone]
            )}
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
          >
            <div className={cn("absolute inset-y-0 left-0 w-1.5", accentClasses[toast.tone])} />
            <div className="pl-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{toast.title}</p>
                  {toast.description ? <p className="mt-1 text-sm leading-6 text-slate-500">{toast.description}</p> : null}
                </div>
                <button
                  aria-label="Dismiss notification"
                  className="pressable pressable-icon inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => dismissToast(toast.id)}
                  type="button"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider.");
  }
  return context;
}
