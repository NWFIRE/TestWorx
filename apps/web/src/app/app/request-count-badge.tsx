export function RequestCountBadge({ count, collapsed = false }: { count: number; collapsed?: boolean }) {
  if (count <= 0) return null;
  return <span
    aria-label={`${count} service request${count === 1 ? "" : "s"} awaiting review`}
    title={`${count} service request${count === 1 ? "" : "s"} awaiting review`}
    className={`inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-red-700 px-1.5 text-xs font-bold leading-none tracking-normal text-white shadow-sm ring-2 ring-white ${collapsed ? "absolute right-0.5 top-0.5" : ""}`}
  >{count > 99 ? "99+" : count}</span>;
}
