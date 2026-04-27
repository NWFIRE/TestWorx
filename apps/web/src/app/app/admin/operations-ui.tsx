import type { ReactNode } from "react";
import Link from "next/link";
import { PageBackControl } from "@/app/page-back-control";

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
  slate: "border-[color:var(--border-default)] bg-[color:var(--surface-muted)] text-slate-700",
  blue: "badge-brand-primary",
  emerald: "border-emerald-300 bg-emerald-50 text-emerald-800",
  amber: "border-amber-300 bg-amber-50 text-amber-800",
  rose: "border-rose-300 bg-rose-50 text-rose-800",
  violet: "badge-brand-accent"
};

export function AppPageShell({
  children,
  className,
  density = "default"
}: {
  children: ReactNode;
  className?: string;
  density?: "default" | "wide";
}) {
  return <section className={cn(density === "wide" ? "space-y-6 lg:space-y-7" : "space-y-5 lg:space-y-6", className)}>{children}</section>;
}

export function SectionCard({
  children,
  className,
  id
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-[28px] border border-[color:rgb(203_215_230_/_0.92)] bg-[color:var(--surface-base)] p-5 shadow-[0_16px_38px_rgba(15,23,42,0.06)] lg:p-6",
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
  className,
  contentWidth = "wide",
  backNavigation
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
  contentWidth?: "default" | "wide" | "full";
  backNavigation?: {
    label?: string;
    fallbackHref: string;
  };
}) {
  const widthClass =
    contentWidth === "full"
      ? "max-w-6xl"
      : contentWidth === "wide"
        ? "max-w-5xl"
        : "max-w-3xl";

  return (
    <SectionCard className={className}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className={widthClass}>
          {backNavigation ? (
            <div className="mb-2">
              <PageBackControl fallbackHref={backNavigation.fallbackHref} label={backNavigation.label} />
            </div>
          ) : null}
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--tenant-primary)]">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)] md:text-base">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </SectionCard>
  );
}

export function WorkspaceSplit({
  children,
  className,
  variant = "balanced"
}: {
  children: ReactNode;
  className?: string;
  variant?: "balanced" | "content-heavy" | "even";
}) {
  const variantClass =
    variant === "content-heavy"
      ? "xl:grid-cols-[minmax(0,1.3fr)_minmax(22rem,0.85fr)] 2xl:grid-cols-[minmax(0,1.45fr)_minmax(24rem,0.78fr)]"
      : variant === "even"
        ? "xl:grid-cols-2"
        : "xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.95fr)] 2xl:grid-cols-[minmax(0,1.22fr)_minmax(24rem,0.88fr)]";

  return <section className={cn("grid gap-6", variantClass, className)}>{children}</section>;
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
    <div className="flex h-full flex-col justify-between gap-4 rounded-[24px] border border-[color:rgb(203_215_230_/_0.92)] bg-[color:var(--surface-base)] p-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)] lg:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium leading-5 text-[color:var(--text-secondary)] lg:text-sm">{label}</div>
          <div className="mt-2 text-[28px] font-semibold tracking-[-0.05em] text-slate-950 lg:mt-3 lg:text-3xl lg:tracking-[-0.04em]">
            {value}
          </div>
        </div>
        {icon ? (
          <div className={cn("rounded-2xl border p-2.5", toneClasses[tone])}>{icon}</div>
        ) : null}
      </div>
      <div className="text-xs leading-5 text-[color:var(--text-muted)] lg:text-sm">{note}</div>
    </div>
  );

  if (!href) {
    return content;
  }

  return (
    <Link
      className="pressable-surface block rounded-[24px] outline-none transition duration-200 hover:-translate-y-0.5 hover:[&_div]:border-slate-300 hover:[&_div]:shadow-[0_16px_40px_rgba(15,23,42,0.06)] focus-visible:[&_div]:ring-2 focus-visible:[&_div]:ring-[color:rgb(var(--tenant-primary-rgb)/0.2)]"
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--text-secondary)]">
            {title}
          </p>
          {description ? <p className="mt-2 text-sm text-[color:var(--text-muted)]">{description}</p> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">{children}</div>
    </SectionCard>
  );
}

const workQueueItems = [
  { key: "all", label: "Dashboard", href: "/app/admin/dashboard", tone: "slate" as const },
  {
    key: "open",
    label: "Inspections",
    href: "/app/admin/inspections?status=open",
    tone: "blue" as const
  },
  {
    key: "review",
    label: "Ready to bill",
    href: "/app/admin/reports",
    tone: "emerald" as const
  },
  {
    key: "billing",
    label: "Billing work",
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
      ? "border-[var(--tenant-primary)] bg-[var(--tenant-primary)] text-[var(--tenant-primary-contrast)]"
      : tone === "amber"
        ? "border-amber-500 bg-amber-500 text-white"
        : tone === "emerald"
          ? "border-emerald-600 bg-emerald-600 text-white"
          : tone === "violet"
            ? "border-[var(--tenant-accent)] bg-[var(--tenant-accent)] text-[var(--tenant-accent-contrast)]"
            : "border-slate-900 bg-slate-900 text-white";

  return (
    <Link
      className={cn(
        "pressable pressable-row inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold transition",
        active
          ? activeClass
          : "border-[color:var(--border-default)] bg-[color:var(--surface-base)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-subtle)]"
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

export function PriorityBadge({
  label = "Priority"
}: {
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-300 bg-fuchsia-600 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-white shadow-[0_10px_24px_rgba(192,38,211,0.28)] ring-4 ring-fuchsia-100/80">
      <span className="h-2 w-2 rounded-full bg-white/90" />
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
        "rounded-[24px] border border-dashed border-[color:var(--border-default)] bg-[color:rgb(248_250_252_/_0.95)] px-5 py-8 text-center",
        className
      )}
    >
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[color:var(--text-muted)]">{description}</p>
    </div>
  );
}
