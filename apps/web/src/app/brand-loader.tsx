"use client";

import Image from "next/image";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const sizeMap = {
  sm: 14,
  md: 16,
  lg: 20
} as const;

export function BrandLoader({
  className,
  size = "md",
  label = "Loading",
  tone = "default"
}: {
  className?: string;
  size?: "sm" | "md" | "lg" | number;
  label?: string;
  tone?: "default" | "muted" | "inverse";
}) {
  const resolvedSize = typeof size === "number" ? size : sizeMap[size];

  return (
    <span
      aria-label={label}
      className={cn(
        "brand-loader inline-flex shrink-0 items-center justify-center",
        tone === "muted" ? "opacity-80" : "",
        tone === "inverse" ? "brightness-110" : "",
        className
      )}
      role="status"
      style={{ width: resolvedSize, height: resolvedSize }}
    >
      <span className="brand-loader-mark-wrap inline-flex h-full w-full items-center justify-center">
        <Image
          alt=""
          aria-hidden="true"
          className="brand-loader-mark h-full w-full object-contain"
          height={resolvedSize}
          src="/icon.png"
          unoptimized
          width={resolvedSize}
        />
      </span>
    </span>
  );
}
