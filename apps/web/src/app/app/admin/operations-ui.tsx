import type { ReactNode } from "react";
import Link from "next/link";

type Tone =
  | "slate"
  | "blue"
  | "emerald"
  | "amber"
  | "rose"
  | "violet";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const toneClasses: Record<Tone, string> = {
  slate: "border-slate-200 bg-slate-50 text-slate-700",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700"
};

export function AppPageShell({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("space-y-5 lg:space-y-6", className)}>{children}</section>;
}

export function SectionCard({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)] lg:p-6",
        className
      )}
    >
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <SectionCard className={className}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500 md:text-base">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </SectionCard>
  );
}

export function KPIStatCard({
  label,
  value,
  note,
  href,
  icon,
  tone = "slate"
}: {
  label: string;
  value: string | number;
  note: string;
  href?: string;
  icon?: ReactNode;
  tone?: Tone;
}) {
  const content = (
    <div className="flex h-full flex-col justify-between gap-4 rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] lg:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium leading-5 text-slate-500 lg:text-sm">{label}</div>
          <div className="mt-2 text-[28px] font-semibold tracking-[-0.05em] text-slate-950 lg:mt-3 lg:text-3xl lg:tracking-[-0.04em]">
            {value}
          </div>
        </div>
        {icon ? (
          <div className={cn("rounded-2xl border p-2.5", toneClasses[tone])}>{icon}</div>
        ) : null}
      </div>
      <div className="text-xs leading-5 text-slate-500 lg:text-sm">{note}</div>
    </div>
  );

  if (!href) {
    return content;
  }

  return (
    <Link
      className="block rounded-[24px] outline-none transition duration-200 hover:-translate-y-0.5 hover:[&_div]:border-slate-300 hover:[&_div]:shadow-[0_16px_40px_rgba(15,23,42,0.06)] focus-visible:[&_div]:ring-2 focus-visible:[&_div]:ring-[#1f4678]/20"
      href={href}
    >
      {content}
    </Link>
  );
}

export function FilterBar({
  title,
  description,
  children,
  className
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <SectionCard className={className}>
      {title ? (
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            {title}
          </p>
          {description ? <p className="mt-2 text-sm text-slate-500">{description}</p> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">{children}</div>
    </SectionCard>
  );
}

const workQueueItems = [
  { key: "all", label: "All work", href: "/app/admin", tone: "slate" as const },
  {
    key: "open",
    label: "Open inspections",
    href: "/app/admin/scheduling?status=open,in_progress",
    tone: "blue" as const
  },
  {
    key: "review",
    label: "Awaiting review",
    href: "/app/admin/reports?status=awaiting-review",
    tone: "violet" as const
  },
  {
    key: "billing",
    label: "Billing ready",
    href: "/app/admin/billing?status=ready",
    tone: "emerald" as const
  },
  {
    key: "flags",
    label: "Compliance flags",
    href: "/app/deficiencies?status=open&severity=high,critical",
    tone: "amber" as const
  }
];

export function WorkQueueNav({ activeKey }: { activeKey: "all" | "open" | "review" | "billing" | "flags" }) {
  return (
    <FilterBar
      description="Move directly into the live operational queue that matches the work you need to push forward."
      title="Work queue"
    >
      {workQueueItems.map((item) => (
        <FilterChipLink
          active={activeKey === item.key}
          href={item.href}
          key={item.key}
          label={item.label}
          tone={item.tone}
        />
      ))}
    </FilterBar>
  );
}

export function FilterChipLink({
  href,
  label,
  active,
  tone = "slate"
}: {
  href: string;
  label: string;
  active: boolean;
  tone?: Tone;
}) {
  const activeClass =
    tone === "blue"
      ? "border-[#1f4678] bg-[#1f4678] text-white"
      : tone === "amber"
        ? "border-amber-500 bg-amber-500 text-white"
        : tone === "emerald"
          ? "border-emerald-600 bg-emerald-600 text-white"
          : tone === "violet"
            ? "border-violet-600 bg-violet-600 text-white"
            : "border-slate-900 bg-slate-900 text-white";

  return (
    <Link
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold transition",
        active
          ? activeClass
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      )}
      href={href}
    >
      {label}
    </Link>
  );
}

export function StatusBadge({
  label,
  tone = "slate"
}: {
  label: string;
  tone?: Tone;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
        toneClasses[tone]
      )}
    >
      {label}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  className
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-8 text-center",
        className
      )}
    >
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}
