"use client";

import { useEffect, useState, useTransition } from "react";
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
  const [queryDraft, setQueryDraft] = useState<{ text: string; initialValue: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const query = queryDraft?.initialValue === initialValue ? queryDraft.text : initialValue;
  const hasSelectedOption = options.some((option) => option.value === query);
  const resetPageKeyList = resetPageKeys.join("\u001f");

  useEffect(() => {
    const trimmedValue = query.trim();
    const trimmedInitialValue = initialValue.trim();
    if (trimmedValue === trimmedInitialValue) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const nextUrl = buildNextUrl({
        pathname,
        searchParams,
        paramKey,
        nextQuery: trimmedValue,
        resetPageKeys: resetPageKeyList ? resetPageKeyList.split("\u001f") : []
      });
      startTransition(() => {
        router.replace(nextUrl, { scroll: false });
      });
    }, LIVE_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [initialValue, paramKey, pathname, query, resetPageKeyList, router, searchParams]);

  function updateQuery(nextQuery: string) {
    setQueryDraft({ text: nextQuery, initialValue });
  }

  function applyQueryNow(nextQuery: string) {
    const nextUrl = buildNextUrl({
      pathname,
      searchParams,
      paramKey,
      nextQuery,
      resetPageKeys: resetPageKeyList ? resetPageKeyList.split("\u001f") : []
    });
    startTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
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
        setQueryDraft({ text: nextValue, initialValue });
        if (option) {
          applyQueryNow(nextValue);
        }
      }}
      onCustomValueChange={updateQuery}
      onQueryChange={updateQuery}
      options={options}
      placeholder={placeholder}
      value={hasSelectedOption ? query : ""}
    />
  );
}
