import Link from "next/link";

import type { ManualListItem } from "../manual-types";
import { ManualCard } from "./ManualCard";

export function RecentManualsSection({
  manuals
}: {
  manuals: ManualListItem[];
}) {
  if (manuals.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Recent</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Pick up where you left off.</h2>
        </div>
        <Link className="text-sm font-semibold text-[var(--tenant-primary)]" href="/app/manuals?recentOnly=true">
          View all
        </Link>
      </div>
      <div className="grid gap-4">
        {manuals.map((manual) => (
          <ManualCard key={manual.id} manual={manual} />
        ))}
      </div>
    </section>
  );
}
