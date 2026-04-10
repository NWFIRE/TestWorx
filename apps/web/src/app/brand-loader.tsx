"use client";

import Image from "next/image";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function BrandLoader({
  className,
  size = 16,
  label = "Loading"
}: {
  className?: string;
  size?: number;
  label?: string;
}) {
  return (
    <span
      aria-label={label}
      className={cn("brand-loader inline-flex shrink-0 items-center justify-center", className)}
      role="status"
      style={{ width: size, height: size }}
    >
      <Image alt="" aria-hidden="true" className="brand-loader-mark h-full w-full object-contain" height={size} src="/icon.png" unoptimized width={size} />
    </span>
  );
}
