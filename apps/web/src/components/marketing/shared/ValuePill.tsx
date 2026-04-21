import type { ReactNode } from "react";

export function ValuePill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 shadow-[0_4px_14px_rgba(15,23,42,0.04)]">
      {children}
    </span>
  );
}
