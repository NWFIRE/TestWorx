"use client";

import { usePathname, useRouter } from "next/navigation";

function resolveFallbackHref(pathname: string) {
  if (pathname.startsWith("/app/admin")) {
    return "/app/admin";
  }

  if (pathname.startsWith("/app/tech")) {
    return "/app/tech";
  }

  if (pathname.startsWith("/app/customer")) {
    return "/app/customer";
  }

  if (pathname.startsWith("/app")) {
    return "/app";
  }

  return "/login";
}

export function GlobalBackButton() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/" || pathname.startsWith("/app")) {
    return null;
  }

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(resolveFallbackHref(pathname));
  };

  return (
    <button
      aria-label="Go back"
      className="pressable fixed left-4 top-4 z-50 inline-flex min-h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-ink shadow-panel transition hover:border-slateblue/30 hover:text-slateblue"
      onClick={handleBack}
      type="button"
    >
      Back
    </button>
  );
}
