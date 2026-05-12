"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SearchInput } from "./search-input";

const LIVE_SEARCH_DEBOUNCE_MS = 400;

export function LiveUrlSearchInput({
  id,
  name,
  initialValue,
  paramKey,
  placeholder,
  resetPageKeys = [],
  debounceMs = LIVE_SEARCH_DEBOUNCE_MS,
  className
}: {
  id?: string;
  name?: string;
  initialValue: string;
  paramKey: string;
  placeholder: string;
  resetPageKeys?: string[];
  debounceMs?: number;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialValue);
  const [isFocused, setIsFocused] = useState(false);
  const [pending, startTransition] = useTransition();
  const lastAppliedValueRef = useRef(initialValue.trim());

  useEffect(() => {
    const nextAppliedValue = initialValue.trim();
    const previousAppliedValue = lastAppliedValueRef.current;
    lastAppliedValueRef.current = nextAppliedValue;

    if (isFocused && value.trim() !== previousAppliedValue) {
      return;
    }

    const timeout = window.setTimeout(() => setValue(initialValue), 0);
    return () => window.clearTimeout(timeout);
  }, [initialValue, isFocused, value]);

  const applySearch = useCallback((nextValue: string) => {
    const trimmedValue = nextValue.trim();
    if (trimmedValue === lastAppliedValueRef.current) {
      return;
    }

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
    lastAppliedValueRef.current = trimmedValue;
    startTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  }, [paramKey, pathname, resetPageKeys, router, searchParams]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      applySearch(value);
    }, debounceMs);

    return () => window.clearTimeout(timeout);
  }, [applySearch, debounceMs, value]);

  return (
    <SearchInput
      className={className}
      busy={pending}
      id={id}
      name={name}
      onChange={(event) => setValue(event.target.value)}
      onClear={() => {
        setValue("");
        applySearch("");
      }}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          applySearch(value);
          return;
        }

        if (event.key === "Escape") {
          event.currentTarget.blur();
        }
      }}
      placeholder={placeholder}
      value={value}
    />
  );
}
