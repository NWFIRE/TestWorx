"use client";

import { useSmartBack } from "./use-smart-back";

export function PageBackControl({
  fallbackHref,
  className
}: {
  label?: string;
  fallbackHref: string;
  className?: string;
}) {
  const smartBack = useSmartBack(fallbackHref);

  return (
    <button
      aria-label="Back"
      className={`pressable inline-flex min-h-10 items-center rounded-xl px-2.5 py-2 text-[13px] font-medium text-slate-500 outline-none transition hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--tenant-primary-rgb)/0.35)] focus-visible:ring-offset-2 ${className ?? ""}`}
      onClick={() => smartBack()}
      type="button"
    >
      <span>Back</span>
    </button>
  );
}
