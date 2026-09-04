"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Option = {
  value: string;
  label: string;
};

export function LiveUrlSelectFilter({
  paramKey,
  value,
  options,
  className,
  resetPageKeys = ["page"]
}: {
  paramKey: string;
  value: string;
  options: Option[];
  className?: string;
  resetPageKeys?: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedValue, setSelectedValue] = useState(value);

  useEffect(() => {
    setSelectedValue(value);
  }, [value]);

  return (
    <select
      className={
        className ??
        "h-12 w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slateblue"
      }
      value={selectedValue}
      onChange={(event) => {
        const nextSearch = new URLSearchParams(searchParams.toString());
        const nextValue = event.target.value.trim();
        setSelectedValue(nextValue);

        if (nextValue) {
          nextSearch.set(paramKey, nextValue);
        } else {
          nextSearch.delete(paramKey);
        }

        for (const pageKey of resetPageKeys) {
          nextSearch.set(pageKey, "1");
        }

        const nextUrl = nextSearch.toString() ? `${pathname}?${nextSearch.toString()}` : pathname;
        router.replace(nextUrl, { scroll: false });
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
