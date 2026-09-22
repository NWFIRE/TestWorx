"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

import { SearchInput } from "./search-input";
import { SEARCH_DEBOUNCE_MS } from "./search-behavior";

export function LiveUrlSearchInput({
  id, name, initialValue, paramKey, placeholder, resetPageKeys = [],
  debounceMs = SEARCH_DEBOUNCE_MS, className = ""
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
  const [query, setQuery] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const draft = useRef(initialValue);
  const applied = useRef(initialValue.trim());
  const submitted = useRef(new Set<string>());
  const resetKeys = resetPageKeys.join("\u001f");

  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    // A slower response must not replace text entered since its request started.
    if (submitted.current.delete(initialValue.trim())) return;
    cancel();
    applied.current = initialValue.trim();
    draft.current = initialValue;
    const sync = setTimeout(() => {
      if (draft.current === initialValue) setQuery(initialValue);
    }, 0);
    return () => clearTimeout(sync);
  }, [initialValue, cancel]);

  useEffect(() => {
    function restoreHistory() {
      cancel();
      submitted.current.clear();
      const value = new URLSearchParams(window.location.search).get(paramKey) ?? "";
      applied.current = value.trim();
      draft.current = value;
      setQuery(value);
    }
    window.addEventListener("popstate", restoreHistory);
    return () => {
      cancel();
      window.removeEventListener("popstate", restoreHistory);
    };
  }, [cancel, paramKey, pathname]);

  function applyQuery(value: string) {
    cancel();
    if (composing.current || window.location.pathname !== pathname) return;
    const trimmed = value.trim();
    if (trimmed === applied.current) return;
    // Read current params at dispatch time so a dropdown changed while typing is retained.
    const params = new URLSearchParams(window.location.search);
    if (trimmed) params.set(paramKey, trimmed);
    else params.delete(paramKey);
    for (const key of resetKeys ? resetKeys.split("\u001f") : []) params.set(key, "1");
    applied.current = trimmed;
    submitted.current.add(trimmed);
    startTransition(() => router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false }));
  }

  function updateQuery(value: string) {
    cancel();
    draft.current = value;
    setQuery(value);
    if (!composing.current) timer.current = setTimeout(() => applyQuery(value), debounceMs);
  }

  return (
    <SearchInput
      busy={pending}
      className={`w-full ${className}`}
      id={id}
      name={name ?? paramKey}
      onChange={(event) => updateQuery(event.target.value)}
      onClear={() => { updateQuery(""); applyQuery(""); }}
      onBlur={(event) => {
        // A result or navigation link must win over any queued list search.
        if (event.relatedTarget instanceof Element && event.relatedTarget.closest("a[href]")) cancel();
        else applyQuery(draft.current);
      }}
      onCompositionStart={() => { composing.current = true; cancel(); }}
      onCompositionEnd={(event) => { composing.current = false; updateQuery(event.currentTarget.value); }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          applyQuery(draft.current);
        }
      }}
      placeholder={placeholder}
      value={query}
    />
  );
}
