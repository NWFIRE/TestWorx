import Link from "next/link";

export function ManualsPageHeader({
  canManage = false
}: {
  canManage?: boolean;
}) {
  return (
    <section className="rounded-[28px] border border-[color:rgb(203_215_230_/_0.92)] bg-[color:var(--surface-base)] p-5 shadow-[0_16px_38px_rgba(15,23,42,0.06)] lg:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--tenant-primary)]">
            Manuals
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">
            Field manuals, without the file-dump feel.
          </h1>
          <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)] md:text-base">
            Quick access to wet chemical and industrial dry chemical documentation, with favorites and recent manuals kept front and center.
          </p>
        </div>
        {canManage ? (
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
        ) : null}
      </div>
    </section>
  );
}
