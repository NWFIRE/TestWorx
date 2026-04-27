"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type SearchSelectOption = {
  value: string;
  label: string;
  secondaryLabel?: string | null;
  badge?: string | null;
  disabled?: boolean;
};

export function SearchSelect({
  id,
  name,
  label,
  options,
  value,
  onChange,
  onQueryChange,
  placeholder = "Search",
  disabledPlaceholder,
  disabled = false,
  required = false,
  loading = false,
  emptyText = "No results found",
  className = "",
  allowCustomValue = false,
  customValue = "",
  onCustomValueChange
}: {
  id?: string;
  name?: string;
  label?: string;
  options: SearchSelectOption[];
  value: string;
  onChange: (value: string, option: SearchSelectOption | null) => void;
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  disabledPlaceholder?: string;
  disabled?: boolean;
  required?: boolean;
  loading?: boolean;
  emptyText?: string;
  className?: string;
  allowCustomValue?: boolean;
  customValue?: string;
  onCustomValueChange?: (value: string) => void;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-listbox`;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = useMemo(() => options.find((option) => option.value === value) ?? null, [options, value]);
  const [queryOverride, setQueryOverride] = useState<{
    text: string;
    value: string;
    customValue: string;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const query =
    queryOverride && queryOverride.value === value && queryOverride.customValue === customValue
      ? queryOverride.text
      : selectedOption?.label ?? customValue ?? "";

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery || selectedOption?.label === query) {
      return options.slice(0, 20);
    }

    return options
      .filter((option) => [option.label, option.secondaryLabel, option.badge]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery))
      .slice(0, 20);
  }, [options, query, selectedOption]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function selectOption(option: SearchSelectOption) {
    if (option.disabled) {
      return;
    }

    onChange(option.value, option);
    onCustomValueChange?.("");
    setQueryOverride(null);
    setOpen(false);
  }

  function clearSelection() {
    onChange("", null);
    onCustomValueChange?.("");
    setQueryOverride({ text: "", value: "", customValue: "" });
    onQueryChange?.("");
    setOpen(false);
  }

  function updateQuery(nextQuery: string) {
    setQueryOverride({ text: nextQuery, value, customValue });
    onQueryChange?.(nextQuery);
    setActiveIndex(0);
    setOpen(true);

    if (selectedOption && nextQuery !== selectedOption.label) {
      onChange("", null);
    }

    if (allowCustomValue) {
      onCustomValueChange?.(nextQuery);
    }
  }

  return (
    <div className={className} ref={wrapperRef}>
      {name ? <input name={name} type="hidden" value={value} /> : null}
      {label ? <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor={inputId}>{label}</label> : null}
      <div className="relative">
        <input
          aria-activedescendant={open && filteredOptions[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          autoComplete="off"
          className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-20 text-sm text-slate-900 outline-none transition focus:border-[color:var(--tenant-primary-border)] focus:ring-4 focus:ring-[color:rgb(var(--tenant-primary-rgb)/0.10)] disabled:bg-slate-50 disabled:text-slate-400"
          disabled={disabled}
          id={inputId}
          onChange={(event) => updateQuery(event.target.value)}
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              return;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => Math.min(current + 1, Math.max(filteredOptions.length - 1, 0)));
              return;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => Math.max(current - 1, 0));
              return;
            }

            if (event.key === "Enter" && open) {
              const option = filteredOptions[activeIndex];
              if (option) {
                event.preventDefault();
                selectOption(option);
              }
            }
          }}
          placeholder={disabled ? disabledPlaceholder ?? placeholder : placeholder}
          required={required && !allowCustomValue}
          role="combobox"
          value={query}
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1">
          {(value || customValue || query) && !disabled ? (
            <button
              aria-label="Clear selection"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={clearSelection}
              type="button"
            >
              X
            </button>
          ) : null}
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center text-slate-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 20 20">
              <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
            </svg>
          </span>
        </div>

        {open && !disabled ? (
          <div
            className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_44px_rgba(15,23,42,0.14)]"
            id={listboxId}
            role="listbox"
          >
            {loading ? (
              <div className="rounded-xl px-3 py-3 text-sm text-slate-500">Searching...</div>
            ) : filteredOptions.length === 0 ? (
              <div className="rounded-xl px-3 py-3 text-sm text-slate-500">{emptyText}</div>
            ) : (
              filteredOptions.map((option, index) => {
                const active = index === activeIndex;
                const selected = option.value === value;
                return (
                  <button
                    aria-selected={selected}
                    className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left transition ${
                      active || selected ? "bg-[var(--tenant-primary-soft)]" : "hover:bg-slate-50"
                    } ${option.disabled ? "cursor-not-allowed opacity-50" : ""}`}
                    disabled={option.disabled}
                    id={`${listboxId}-${index}`}
                    key={option.value}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectOption(option);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-950">{option.label}</span>
                      {option.secondaryLabel ? <span className="mt-1 block truncate text-xs text-slate-500">{option.secondaryLabel}</span> : null}
                    </span>
                    {option.badge ? <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">{option.badge}</span> : null}
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
