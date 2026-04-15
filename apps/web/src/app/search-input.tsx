"use client";

import type { InputHTMLAttributes } from "react";

import { BrandLoader } from "./brand-loader";

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  busy?: boolean;
  clearable?: boolean;
  onClear?: () => void;
};

export function SearchInput({
  busy = false,
  className,
  clearable = true,
  onClear,
  value,
  ...props
}: SearchInputProps) {
  const hasValue = typeof value === "string" ? value.trim().length > 0 : Boolean(value);

  return (
    <div className={className}>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-[color:var(--text-tertiary)]">
          Search
        </span>
        <input
          {...props}
          autoComplete="off"
          className="field-contrast h-12 w-full rounded-2xl border bg-white pl-20 pr-28 text-sm outline-none transition"
          type="search"
          value={value}
        />
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
          {busy ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-secondary)]">
              <BrandLoader label="Updating results" size="sm" tone="muted" />
              Updating
            </span>
          ) : null}
          {clearable && hasValue ? (
            <button
              className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[color:var(--border-default)] bg-white px-3 text-xs font-semibold text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-subtle)]"
              onClick={onClear}
              type="button"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
