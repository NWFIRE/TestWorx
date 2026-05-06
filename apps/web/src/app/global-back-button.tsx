"use client";

import { usePathname } from "next/navigation";

import { useSmartBack } from "./use-smart-back";

export function GlobalBackButton() {
  const pathname = usePathname();
  const smartBack = useSmartBack();

  if (pathname === "/" || pathname.startsWith("/app")) {
    return null;
  }

  return (
    <button
      aria-label="Go back"
      className="pressable fixed left-4 top-4 z-50 inline-flex min-h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-ink shadow-panel transition hover:border-slateblue/30 hover:text-slateblue"
      onClick={() => smartBack()}
      type="button"
    >
      Back
    </button>
  );
}
