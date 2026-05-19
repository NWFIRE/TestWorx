export function PriorityInspectionBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-label="Priority inspection"
      className={compact
        ? "inline-flex min-h-7 items-center rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-900 shadow-sm"
        : "inline-flex min-h-9 items-center rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-amber-900 shadow-sm"}
    >
      Priority
    </span>
  );
}
