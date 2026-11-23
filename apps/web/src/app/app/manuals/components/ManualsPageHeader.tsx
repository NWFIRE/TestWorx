import Link from "next/link";
import { PageHeader } from "../../admin/operations-ui";

export function ManualsPageHeader({
  canManage = false
}: {
  canManage?: boolean;
}) {
  return (
    <PageHeader title="Manuals" eyebrow="Manuals" actions={canManage ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
              href="/app/admin/manuals"
            >
              Manage manuals
            </Link>
            <Link
              className="rounded-2xl bg-[var(--tenant-primary)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95"
              href="/app/admin/manuals/new"
            >
              Add manual
            </Link>
          </div>
        ) : null} />
  );
}
