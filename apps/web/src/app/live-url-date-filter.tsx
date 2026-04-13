"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function LiveUrlDateFilter({
  paramKey,
  value,
  className,
  resetPageKeys = ["page"]
}: {
  paramKey: string;
  value: string;
  className?: string;
  resetPageKeys?: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  return (
    <input
      className={className ?? "h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slateblue"}
      defaultValue={value}
      onChange={(event) => {
        const nextSearch = new URLSearchParams(searchParams.toString());
        const nextValue = event.target.value.trim();

        if (nextValue) {
          nextSearch.set(paramKey, nextValue);
        } else {
          nextSearch.delete(paramKey);
        }

        for (const pageKey of resetPageKeys) {
          nextSearch.set(pageKey, "1");
        }

        const nextUrl = nextSearch.toString() ? `${pathname}?${nextSearch.toString()}` : pathname;
        startTransition(() => {
          router.replace(nextUrl, { scroll: false });
        });
      }}
      type="date"
    />
  );
}
