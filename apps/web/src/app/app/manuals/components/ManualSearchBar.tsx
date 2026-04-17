export function ManualSearchBar({
  query
}: {
  query?: string;
}) {
  return (
    <label className="block flex-1">
      <span className="sr-only">Search manuals</span>
      <input
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[color:rgb(var(--tenant-primary-rgb)/0.4)] focus:ring-2 focus:ring-[color:rgb(var(--tenant-primary-rgb)/0.14)]"
        defaultValue={query}
        name="query"
        placeholder="Search by title, manufacturer, model, or tag"
        type="search"
      />
    </label>
  );
}
