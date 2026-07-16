"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const LIVE_SEARCH_DEBOUNCE_MS = 1200;

function buildNextUrl({
  pathname,
  searchParams,
  paramKey,
  nextQuery,
  resetPageKeys
}: {
  pathname: string;
  searchParams: URLSearchParams;
  paramKey: string;
  nextQuery: string;
  resetPageKeys: string[];
}) {
  const nextSearch = new URLSearchParams(searchParams.toString());
  const trimmedValue = nextQuery.trim();
  if (trimmedValue) {
    nextSearch.set(paramKey, trimmedValue);
  } else {
    nextSearch.delete(paramKey);
  }

  for (const pageKey of resetPageKeys) {
    nextSearch.set(pageKey, "1");
  }

  return nextSearch.toString() ? `${pathname}?${nextSearch.toString()}` : pathname;
}

export function LiveUrlSearchInput({
  id,
  name,
  initialValue,
  paramKey,
  placeholder,
  resetPageKeys = [],
  debounceMs = LIVE_SEARCH_DEBOUNCE_MS,
  className = ""
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
  const [query, setQuery] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  const searchDebounceRef = useRef<number | null>(null);
  const lastAppliedValueRef = useRef(initialValue.trim());
  const resetPageKeyList = resetPageKeys.join("\u001f");

  useEffect(() => {
    const nextAppliedValue = initialValue.trim();
    lastAppliedValueRef.current = nextAppliedValue;
    const timeout = window.setTimeout(() => setQuery(initialValue), 0);
    return () => window.clearTimeout(timeout);
  }, [initialValue]);

  const applyQuery = useCallback((nextQuery: string) => {
    const trimmedValue = nextQuery.trim();
    if (trimmedValue === lastAppliedValueRef.current) {
      return;
    }

    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }

    const nextUrl = buildNextUrl({
      pathname,
      searchParams,
      paramKey,
      nextQuery: trimmedValue,
      resetPageKeys: resetPageKeyList ? resetPageKeyList.split("\u001f") : []
    });
    lastAppliedValueRef.current = trimmedValue;
    startTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  }, [paramKey, pathname, resetPageKeyList, router, searchParams]);

  useEffect(() => {
    const trimmedValue = query.trim();
    if (trimmedValue === lastAppliedValueRef.current) {
      return;
    }

    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current);
    }

    const timeout = window.setTimeout(() => {
      searchDebounceRef.current = null;
      applyQuery(trimmedValue);
    }, debounceMs);
    searchDebounceRef.current = timeout;

    return () => {
      window.clearTimeout(timeout);
      if (searchDebounceRef.current === timeout) {
        searchDebounceRef.current = null;
      }
    };
  }, [applyQuery, debounceMs, query]);

  function clearQuery() {
    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }

    setQuery("");
    applyQuery("");
  }

  return (
    <div className={`relative ${className}`}>
      <input
        aria-busy={pending}
        autoComplete="off"
        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-20 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[color:var(--tenant-primary-border)] focus:ring-4 focus:ring-[color:rgb(var(--tenant-primary-rgb)/0.10)]"
        id={id}
        name={name}
        onChange={(event) => setQuery(event.target.value)}
        onBlur={() => applyQuery(query)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            applyQuery(query);
          }
          if (event.key === "Escape" && query) {
            event.preventDefault();
            clearQuery();
          }
        }}
        placeholder={placeholder}
        role="searchbox"
        type="text"
        value={query}
      />
      <div className="absolute inset-y-0 right-2 flex items-center gap-1">
        {pending ? (
          <span className="h-2 w-2 rounded-full bg-blue-500" aria-label="Filtering inspections" />
        ) : null}
        {query ? (
          <button
            aria-label="Clear search"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={clearQuery}
            type="button"
          >
            X
          </button>
        ) : null}
      </div>
    </div>
  );
}
