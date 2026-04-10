"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { BrandLoader } from "./brand-loader";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function ActionButton({
  children,
  className,
  disabled,
  pending = false,
  pendingLabel,
  tone = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  pending?: boolean;
  pendingLabel?: string;
  tone?: "primary" | "secondary" | "danger" | "dark";
  children: ReactNode;
}) {
  const toneClass =
    tone === "primary"
      ? "btn-brand-primary pressable-filled border border-transparent"
      : tone === "danger"
        ? "border border-rose-200 bg-rose-600 text-white pressable-filled"
        : tone === "dark"
          ? "border border-slate-900 bg-slate-900 text-white pressable-filled"
          : "border border-slate-200 bg-white text-slate-700";

  return (
    <button
      {...props}
      className={cn(
        "pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition hover:brightness-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
        toneClass,
        className
      )}
      data-pending={pending ? "true" : undefined}
      disabled={disabled || pending}
      type={props.type ?? "button"}
    >
      <span className="inline-flex w-4 shrink-0 items-center justify-center">
        {pending ? (
          <BrandLoader
            label={typeof pendingLabel === "string" ? pendingLabel : "Loading"}
            size="md"
            tone={tone === "primary" || tone === "danger" || tone === "dark" ? "inverse" : "default"}
          />
        ) : null}
      </span>
      <span className="min-w-0">{pending ? (pendingLabel ?? children) : children}</span>
    </button>
  );
}
