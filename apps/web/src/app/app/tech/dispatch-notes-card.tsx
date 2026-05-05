"use client";

export function DispatchNotesCard({
  notes,
  compact = false,
  className = ""
}: {
  notes?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const trimmedNotes = notes?.trim();

  if (!trimmedNotes) {
    return null;
  }

  return (
    <div className={`rounded-[1.35rem] border border-amber-200 bg-amber-50/90 ${compact ? "px-4 py-3" : "px-5 py-4"} ${className}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-900">
          !
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-900">Dispatch notes</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-amber-950">{trimmedNotes}</p>
        </div>
      </div>
    </div>
  );
}
