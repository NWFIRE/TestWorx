"use client";

import { useRouter } from "next/navigation";

function canUseHistoryBack() {
  return typeof window !== "undefined" && window.history.length > 1;
}

export function PageBackControl({
  label = "Back",
  fallbackHref,
  className
}: {
  label?: string;
  fallbackHref: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      aria-label={label}
      className={`pressable inline-flex min-h-10 items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] font-medium text-slate-500 outline-none transition hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--tenant-primary-rgb)/0.35)] focus-visible:ring-offset-2 ${className ?? ""}`}
      onClick={() => {
        if (canUseHistoryBack()) {
          router.back();
          return;
        }

        router.push(fallbackHref);
      }}
      type="button"
    >
      <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center text-slate-400">
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 16 16"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M9.75 3.25 5 8l4.75 4.75"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
          />
        </svg>
      </span>
      <span>{label}</span>
    </button>
  );
}
