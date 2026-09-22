"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type SettingsDisclosureCardProps = {
  eyebrow: string;
  title: string;
  description?: string;
  openLabel: string;
  initialOpen?: boolean;
  queryKey?: string;
  desktopSpan?: "single" | "full" | "fullWhenOpen";
  children: ReactNode;
};

export function SettingsDisclosureCard({
  eyebrow,
  title,
  openLabel,
  initialOpen = false,
  queryKey,
  desktopSpan = "single",
  children
}: SettingsDisclosureCardProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(initialOpen);
  const panelId = useId();

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

  const spanClass =
    desktopSpan === "full"
      ? "xl:col-span-2"
      : desktopSpan === "fullWhenOpen" && open
        ? "xl:col-span-2"
        : "";

  return (
    <div className={`min-w-0 self-start rounded-2xl border border-slate-200 bg-white ${spanClass}`}>
  <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0 max-w-2xl">
          <p className="text-xs font-medium text-slate-500">{eyebrow}</p>
          <h3 className="mt-1 text-lg font-semibold text-ink">{title}</h3>
        </div>
        <button
          aria-expanded={open}
          aria-controls={panelId}
          className="pressable inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue"
          onClick={toggleOpen}
          type="button"
        >
          {open ? "Hide section" : openLabel}
        </button>
      </div>
      <div
        id={panelId}
        inert={!open}
        aria-hidden={!open}
        className="grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
      >
        <div className="overflow-hidden">
          <div className="min-w-0 px-3 pb-4 sm:px-5 [&>div]:p-0 [&>div]:shadow-none">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
