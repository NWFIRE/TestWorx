"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type SettingsDisclosureCardProps = {
  eyebrow: string;
  title: string;
  description: string;
  openLabel: string;
  initialOpen?: boolean;
  queryKey?: string;
  children: ReactNode;
};

export function SettingsDisclosureCard({
  eyebrow,
  title,
  description,
  openLabel,
  initialOpen = false,
  queryKey,
  children
}: SettingsDisclosureCardProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(initialOpen);

  useEffect(() => {
    setOpen(initialOpen);
  }, [initialOpen]);

  function toggleOpen() {
    const nextOpen = !open;
    setOpen(nextOpen);

    if (!queryKey || typeof window === "undefined") {
      return;
    }

    const nextSearch = new URLSearchParams(searchParams.toString());
    if (nextOpen) {
      nextSearch.set(queryKey, "1");
    } else {
      nextSearch.delete(queryKey);
    }

    const query = nextSearch.toString();
    const nextUrl = query ? `${pathname}?${query}` : pathname;
    window.history.replaceState(null, "", nextUrl);
  }

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4 p-6">
        <div className="max-w-2xl">
          <p className="text-sm uppercase tracking-[0.25em] text-slate-500">{eyebrow}</p>
          <h3 className="mt-2 text-2xl font-semibold text-ink">{title}</h3>
          <p className="mt-2 text-sm text-slate-500">{description}</p>
        </div>
        <button
          className="pressable inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue"
          onClick={toggleOpen}
          type="button"
        >
          {open ? "Hide section" : openLabel}
        </button>
      </div>
      <div
        className="grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
      >
        <div className="overflow-hidden">
          <div className="px-6 pb-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
