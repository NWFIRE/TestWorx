import type { ReactNode } from "react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function ScreenshotCard({
  title,
  children,
  className
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.12)]", className)}>
      {title ? (
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-5 py-4">
          <p className="text-sm font-semibold tracking-[-0.02em] text-slate-800">{title}</p>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          </div>
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </div>
  );
}
