"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SearchSelect, type SearchSelectOption } from "./search-select";

const LIVE_SEARCH_DEBOUNCE_MS = 250;

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

export function LiveUrlSearchSelect({
  id,
  initialValue,
  paramKey,
  placeholder,
  options,
  emptyText = "No results found",
  resetPageKeys = [],
  className
}: {
  id?: string;
  initialValue: string;
  paramKey: string;
  placeholder: string;
  options: SearchSelectOption[];
  emptyText?: string;
  resetPageKeys?: string[];
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialValue);
  const [isFocused, setIsFocused] = useState(false);
  const [isNavigatingToResult, setIsNavigatingToResult] = useState(false);
  const [pending, startTransition] = useTransition();
  const searchDebounceRef = useRef<number | null>(null);
  const lastAppliedValueRef = useRef(initialValue.trim());
  const navigatingToResultRef = useRef(false);
  const hasSelectedOption = options.some((option) => option.value === query);
  const resetPageKeyList = resetPageKeys.join("\u001f");

  useEffect(() => {
    const nextAppliedValue = initialValue.trim();
    const previousAppliedValue = lastAppliedValueRef.current;
    lastAppliedValueRef.current = nextAppliedValue;

    if (isNavigatingToResult || (isFocused && query.trim() !== previousAppliedValue)) {
      return;
    }

    const timeout = window.setTimeout(() => setQuery(initialValue), 0);
    return () => window.clearTimeout(timeout);
  }, [initialValue, isFocused, isNavigatingToResult, query]);

  const applyQuery = useCallback((nextQuery: string) => {
    if (navigatingToResultRef.current) {
      return;
    }

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
    if (navigatingToResultRef.current) {
      return;
    }

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
    }, LIVE_SEARCH_DEBOUNCE_MS);
    searchDebounceRef.current = timeout;

    return () => {
      window.clearTimeout(timeout);
      if (searchDebounceRef.current === timeout) {
        searchDebounceRef.current = null;
      }
    };
  }, [applyQuery, query]);

  function updateQuery(nextQuery: string) {
    if (navigatingToResultRef.current) {
      return;
    }

    setQuery(nextQuery);
  }

  function clearQuery() {
    if (navigatingToResultRef.current) {
      return;
    }

    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }

    setQuery("");
    applyQuery("");
  }

  return (
    <SearchSelect
      allowCustomValue
      className={className}
      customValue={hasSelectedOption ? "" : query}
      emptyText={emptyText}
      id={id}
      loading={pending}
      onChange={(nextValue, option) => {
        if (option?.href) {
          if (searchDebounceRef.current !== null) {
            window.clearTimeout(searchDebounceRef.current);
            searchDebounceRef.current = null;
          }
          navigatingToResultRef.current = true;
          setIsNavigatingToResult(true);
          setQuery(option.label);
          router.push(option.href);
          return;
        }
        setQuery(nextValue);
        if (option) {
          applyQuery(nextValue);
        }
      }}
      onCustomValueChange={updateQuery}
      onClear={clearQuery}
      onInputBlur={() => setIsFocused(false)}
      onInputFocus={() => setIsFocused(true)}
      onQueryCommit={(nextQuery) => applyQuery(nextQuery)}
      onQueryChange={updateQuery}
      options={options}
      placeholder={placeholder}
      value={hasSelectedOption ? query : ""}
    />
  );
}
