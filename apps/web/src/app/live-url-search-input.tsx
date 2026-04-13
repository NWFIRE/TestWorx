"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SearchInput } from "./search-input";

const LIVE_SEARCH_DEBOUNCE_MS = 250;

export function LiveUrlSearchInput({
  id,
  initialValue,
  paramKey,
  placeholder,
  resetPageKeys = [],
  className
}: {
  id?: string;
  initialValue: string;
  paramKey: string;
  placeholder: string;
  resetPageKeys?: string[];
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialValue);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const trimmedValue = value.trim();
    const trimmedInitialValue = initialValue.trim();
    if (trimmedValue === trimmedInitialValue) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const nextSearch = new URLSearchParams(searchParams.toString());
      if (trimmedValue) {
        nextSearch.set(paramKey, trimmedValue);
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
    }, LIVE_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [initialValue, paramKey, pathname, resetPageKeys, router, searchParams, value]);

  return (
    <SearchInput
      className={className}
      busy={pending}
      id={id}
      onChange={(event) => setValue(event.target.value)}
      onClear={() => setValue("")}
      placeholder={placeholder}
      value={value}
    />
  );
}
