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
  slate: "border-slate-400 bg-slate-100 text-slate-900",
  blue: "badge-brand-primary",
  emerald: "border-emerald-500 bg-emerald-100 text-emerald-950",
  amber: "border-amber-500 bg-amber-100 text-amber-950",
  rose: "border-rose-500 bg-rose-100 text-rose-950",
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
        "enterprise-card rounded-[26px] p-5 lg:p-6",
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
  actions,
  className,
  contentWidth = "wide"
}: {
  eyebrow?: string;
  title: string;
  description?: string;
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
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className={widthClass}>
          {eyebrow ? (
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--tenant-primary)]">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.045em] text-ink md:text-4xl">
            {title}
          </h1>
        </div>
        {actions ? <div className="flex w-full min-w-0 flex-wrap items-center gap-3 xl:w-auto">{actions}</div> : null}
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
      ? "2xl:grid-cols-[minmax(0,1.45fr)_minmax(24rem,0.78fr)]"
      : variant === "even"
        ? "2xl:grid-cols-2"
        : "2xl:grid-cols-[minmax(0,1.22fr)_minmax(24rem,0.88fr)]";

  return <section className={cn("grid gap-6", variantClass, className)}>{children}</section>;
}

export function KPIStatCard({
  label,
  value,
  href,
  icon,
  tone = "slate"
}: {
  label: string;
  value: string | number;
  note?: string;
  href?: string;
  icon?: ReactNode;
  tone?: Tone;
}) {
  const content = (
    <div className="enterprise-card flex h-full flex-col justify-between gap-3 rounded-[22px] p-4 lg:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold leading-5 text-[color:var(--text-secondary)] lg:text-sm">{label}</div>
          <div className="mt-2 text-[30px] font-bold tracking-[-0.055em] text-ink lg:mt-3 lg:text-3xl lg:tracking-[-0.045em]">
            {value}
          </div>
        </div>
        {icon ? (
          <div className={cn("rounded-2xl border p-2.5", toneClasses[tone])}>{icon}</div>
        ) : null}
      </div>
    </div>
  );

  if (!href) {
    return content;
  }

  return (
    <Link
      className="pressable-surface block rounded-[22px] outline-none transition duration-200 hover:-translate-y-0.5 hover:[&_div]:border-[color:var(--border-strong)] hover:[&_div]:shadow-[0_22px_48px_rgba(9,18,32,0.14)] focus-visible:[&_div]:ring-2 focus-visible:[&_div]:ring-[color:rgb(var(--tenant-primary-rgb)/0.24)]"
      href={href}
    >
      {content}
    </Link>
  );
}

export function FilterBar({
  title,
  children,
  className,
  defaultOpen = false
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  if (!title) {
    return (
      <SectionCard className={className}>
        <div className="flex flex-wrap gap-3">{children}</div>
      </SectionCard>
    );
  }

  return (
    <SectionCard className={className}>
      <details className="group" open={defaultOpen}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl outline-none transition focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--tenant-primary-rgb)/0.24)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[color:var(--text-secondary)]">
            {title}
          </p>
          <span className="inline-flex min-h-10 items-center rounded-2xl border border-[color:var(--border-default)] bg-white px-4 text-sm font-semibold text-[color:var(--text-secondary)] transition group-open:bg-[color:var(--surface-subtle)]">
            <span className="group-open:hidden">Show</span>
            <span className="hidden group-open:inline">Hide</span>
          </span>
        </summary>
        <div className="mt-4 flex flex-wrap gap-3">
          {children}
        </div>
      </details>
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
    label: "Ready To Bill",
    href: "/app/admin/reports",
    tone: "emerald" as const
  },
  {
    key: "billing",
    label: "Billing work",
    href: "/app/admin/billing",
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
    <FilterBar defaultOpen title="Work queue">
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
        "pressable pressable-row inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-bold shadow-sm transition",
        active
          ? activeClass
          : "border-[color:var(--border-default)] bg-[color:var(--surface-base)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-subtle)] hover:text-ink"
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
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-[0.18em] shadow-sm",
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
  className
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[24px] border border-dashed border-[color:var(--border-strong)] bg-[color:var(--surface-subtle)] px-5 py-8 text-center",
        className
      )}
    >
      <h3 className="text-lg font-bold text-ink">{title}</h3>
    </div>
  );
}
