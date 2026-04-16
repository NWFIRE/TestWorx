"use client";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const sizeMap = {
  sm: 14,
  md: 18,
  lg: 24
} as const;

const DOT_COUNT = 10;

function buildDots() {
  return Array.from({ length: DOT_COUNT }, (_, index) => {
    const rotation = (360 / DOT_COUNT) * index;
    const opacity = 0.24 + (index / (DOT_COUNT - 1)) * 0.7;
    const scale = 0.78 + (index / (DOT_COUNT - 1)) * 0.2;

    return {
      rotation,
      opacity,
      scale
    };
  });
}

const dots = buildDots();

export function TradeWorxLoader({
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
  const dotSize = Math.max(2.4, resolvedSize * 0.16);
  const orbitRadius = resolvedSize / 2 - dotSize;

  return (
    <span
      aria-label={label}
      className={cn(
        "tradeworx-loader inline-flex shrink-0 items-center justify-center",
        tone === "muted" ? "text-[color:var(--text-secondary)]" : "",
        tone === "inverse" ? "text-white" : "",
        tone === "default" ? "text-[rgb(var(--tenant-primary-rgb))]" : "",
        className
      )}
      role="status"
      style={{ width: resolvedSize, height: resolvedSize }}
    >
      <span className="tradeworx-loader-orbit relative inline-flex h-full w-full">
        {dots.map((dot, index) => (
          <span
            aria-hidden="true"
            className="tradeworx-loader-dot absolute left-1/2 top-1/2 rounded-full bg-current"
            key={index}
            style={{
              width: dotSize,
              height: dotSize,
              opacity: dot.opacity,
              transform: `translate(-50%, -50%) rotate(${dot.rotation}deg) translateY(-${orbitRadius}px) scale(${dot.scale})`
            }}
          />
        ))}
      </span>
    </span>
  );
}

export const BrandLoader = TradeWorxLoader;
