import Link from "next/link";

import { formatManualSystemCategory, manualSystemCategories } from "@testworx/lib";

function buildHref(category?: string) {
  return category ? `/app/manuals?systemCategory=${category}` : "/app/manuals";
}

export function ManualCategoryTabs({
  activeCategory
}: {
  activeCategory?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
          !activeCategory
            ? "bg-slate-900 text-white"
            : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300"
        }`}
        href={buildHref()}
      >
        All manuals
      </Link>
      {manualSystemCategories.map((category) => (
        <Link
          key={category}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            activeCategory === category
              ? "bg-slate-900 text-white"
              : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300"
          }`}
          href={buildHref(category)}
        >
          {formatManualSystemCategory(category)}
        </Link>
      ))}
    </div>
  );
}
