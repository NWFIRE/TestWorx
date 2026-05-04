"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function TechnicianAppError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isOnline, setIsOnline] = useState(() => typeof window === "undefined" ? true : window.navigator.onLine);

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(window.navigator.onLine);
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);

    console.error("Technician mobile route failed", {
      message: error.message,
      digest: error.digest
    });

    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, [error]);

  return (
    <section className="mx-auto max-w-xl rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
      <div className={isOnline
        ? "inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
        : "inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800"}
      >
        {isOnline ? "Connection interrupted" : "Offline mode"}
      </div>
      <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
        Keep working from this device
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        TradeWorx hit a temporary connection problem while loading this technician screen. Inspection changes already saved on this device will keep retrying automatically when service returns.
      </p>
      {error.digest ? (
        <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
          Error reference: {error.digest}
        </p>
      ) : null}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button
          className="min-h-12 rounded-2xl bg-[var(--tenant-primary)] px-4 py-3 text-sm font-semibold text-[var(--tenant-primary-contrast)]"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
        <Link
          className="flex min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700"
          href="/app/tech/profile"
        >
          Open Sync
        </Link>
        <Link
          className="flex min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
          href="/app/tech/inspections"
        >
          Inspections
        </Link>
        <Link
          className="flex min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
          href="/app/tech"
        >
          Home
        </Link>
      </div>
    </section>
  );
}
