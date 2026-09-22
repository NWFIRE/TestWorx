"use client";

import { useRef, type InputHTMLAttributes } from "react";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const hasValue = typeof value === "string" ? value.length > 0 : Boolean(value);

  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-[color:var(--text-tertiary)]">
          Search
        </span>
        <input
          {...props}
          aria-label={props["aria-label"] ?? props.placeholder ?? "Search"}
          aria-busy={busy}
          autoComplete="off"
          className="field-contrast h-12 w-full min-w-0 rounded-2xl border bg-white pl-20 pr-24 text-base outline-none transition sm:text-sm"
          ref={inputRef}
          onKeyDown={(event) => {
            props.onKeyDown?.(event);
            if (!event.defaultPrevented && event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
            }
            if (!event.defaultPrevented && event.key === "Escape") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          type="search"
          value={value}
        />
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
          {busy ? (
            <span className="inline-flex items-center text-[color:var(--text-secondary)]">
              <BrandLoader label="Updating results" size="sm" tone="muted" />
              <span className="sr-only">Updating</span>
            </span>
          ) : null}
          {clearable && hasValue && onClear ? (
            <button
              aria-label="Clear search"
              className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[color:var(--border-default)] bg-white px-3 text-xs font-semibold text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-subtle)]"
              disabled={props.disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onClear();
                inputRef.current?.focus({ preventScroll: true });
              }}
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
