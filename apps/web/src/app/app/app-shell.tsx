"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { getAppNavItemsForRole, getCurrentAppNavItem, isAppNavItemActive, type AppNavItem } from "./app-nav-config";

const DRAWER_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll<HTMLElement>(DRAWER_SELECTOR)).filter(
    (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1
  );
}

function NavIcon({
  icon,
  className
}: {
  icon: AppNavItem["icon"];
  className?: string;
}) {
  const shared = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.9
  };

  switch (icon) {
    case "calendar":
      return (
        <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
          <rect {...shared} x="3" y="5" width="18" height="16" rx="3" />
          <path {...shared} d="M16 3v4M8 3v4M3 10h18M8 14h3M8 18h6" />
        </svg>
      );
    case "branch":
      return (
        <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
          <circle {...shared} cx="7" cy="6" r="2.5" />
          <circle {...shared} cx="17" cy="18" r="2.5" />
          <circle {...shared} cx="17" cy="6" r="2.5" />
          <path {...shared} d="M9.5 6H14.5M7 8.5V14a4 4 0 0 0 4 4h3.5" />
        </svg>
      );
    case "alert":
      return (
        <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
          <path {...shared} d="M10.2 4.6 3.8 16a3 3 0 0 0 2.6 4.5h11.2A3 3 0 0 0 20.2 16L13.8 4.6a2 2 0 0 0-3.6 0Z" />
          <path {...shared} d="M12 9v4.5M12 17h.01" />
        </svg>
      );
    case "invoice":
      return (
        <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
          <path {...shared} d="M7 3h8l4 4v13l-2-1.2L15 20l-3-1.2L9 20l-2-1.2L5 20V5a2 2 0 0 1 2-2Z" />
          <path {...shared} d="M9 9h6M9 13h6M9 17h4" />
        </svg>
      );
    case "settings":
      return (
        <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
          <path {...shared} d="M12 3v3M12 18v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M3 12h3M18 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
          <circle {...shared} cx="12" cy="12" r="4" />
        </svg>
      );
    case "grid":
      return (
        <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
          <rect {...shared} x="4" y="4" width="6" height="6" rx="1.5" />
          <rect {...shared} x="14" y="4" width="6" height="6" rx="1.5" />
          <rect {...shared} x="4" y="14" width="6" height="6" rx="1.5" />
          <rect {...shared} x="14" y="14" width="6" height="6" rx="1.5" />
        </svg>
      );
    case "clipboard":
      return (
        <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
          <rect {...shared} x="6" y="4" width="12" height="17" rx="2.5" />
          <path {...shared} d="M9 4.5h6a1.5 1.5 0 0 0-1.5-1.5h-3A1.5 1.5 0 0 0 9 4.5ZM9 10h6M9 14h6M9 18h4" />
        </svg>
      );
    case "portal":
      return (
        <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
          <rect {...shared} x="4" y="5" width="16" height="14" rx="3" />
          <path {...shared} d="M4 10h16M9 15h.01M12 15h3" />
        </svg>
      );
    case "team":
      return (
        <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
          <path {...shared} d="M16 19a4 4 0 0 0-8 0" />
          <circle {...shared} cx="12" cy="11" r="3" />
          <path {...shared} d="M20 19a3 3 0 0 0-2.6-2.97M4 19a3 3 0 0 1 2.6-2.97" />
          <path {...shared} d="M17.5 8.5a2.5 2.5 0 1 1 0 5M6.5 13.5a2.5 2.5 0 1 1 0-5" />
        </svg>
      );
    case "mail":
      return (
        <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
          <rect {...shared} x="3" y="6" width="18" height="12" rx="2.5" />
          <path {...shared} d="M4 8.5 12 14l8-5.5" />
        </svg>
      );
    default:
      return (
        <span aria-hidden="true" className={className}>
          {icon ?? "•"}
        </span>
      );
  }
}

function NavItem({
  item,
  active,
  collapsed,
  compact,
  onNavigate
}: {
  item: AppNavItem;
  active: boolean;
  collapsed: boolean;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const toneClasses: Record<NonNullable<AppNavItem["tone"]>, { activeBar: string; activeIcon: string }> = {
    blue: {
      activeBar: "before:bg-[var(--tenant-primary)]",
      activeIcon: "text-[var(--tenant-primary)]"
    },
    amber: {
      activeBar: "before:bg-amber-500",
      activeIcon: "text-amber-600"
    },
    emerald: {
      activeBar: "before:bg-emerald-500",
      activeIcon: "text-emerald-600"
    },
    violet: {
      activeBar: "before:bg-[var(--tenant-accent)]",
      activeIcon: "text-[var(--tenant-accent)]"
    },
    slate: {
      activeBar: "before:bg-slate-500",
      activeIcon: "text-slate-700"
    }
  };
  const tone = toneClasses[item.tone ?? "blue"];

  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      className={`pressable pressable-row group relative flex min-h-[44px] min-w-0 items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--tenant-primary-rgb)/0.35)] focus-visible:ring-offset-2 motion-reduce:transition-none before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-0.5 before:rounded-full before:opacity-0 ${
        active
          ? "bg-[var(--tenant-primary-soft)] text-slate-950 before:opacity-100"
          : "text-slate-600 hover:bg-white hover:text-slate-900"
      } ${tone.activeBar} ${collapsed ? "justify-center px-2" : ""} ${compact ? "min-h-[48px]" : ""}`}
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
    >
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center ${active ? tone.activeIcon : "text-slate-400 group-hover:text-slate-700"}`}
      >
        <NavIcon className="h-5 w-5" icon={item.icon} />
      </span>
      {!collapsed ? (
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-medium ${active ? "font-semibold text-slate-950" : ""}`}>{item.shortLabel}</span>
        </span>
      ) : null}
    </Link>
  );
}

function BrandBlock({
  collapsed
}: {
  collapsed: boolean;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-3 overflow-hidden ${collapsed ? "justify-center" : ""}`}>
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_6px_20px_rgba(15,23,42,0.05)]">
        <Image
          alt="TradeWorx"
          className="object-contain p-1"
          fill
          priority
          sizes="36px"
          src="/icon.png"
        />
      </div>
      {!collapsed ? (
        <div className="min-w-0 overflow-hidden">
          <p className="truncate text-[13px] font-semibold uppercase tracking-[0.24em] text-slate-600">TradeWorx</p>
        </div>
      ) : null}
    </div>
  );
}

function NavSection({
  collapsed,
  compact,
  navItems,
  pathname,
  onNavigate
}: {
  collapsed: boolean;
  compact: boolean;
  navItems: AppNavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <nav aria-label="Primary navigation" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {!collapsed ? (
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Core workflows</p>
        ) : null}
        <div className="space-y-1.5">
          {navItems.map((item) => (
            <NavItem
              key={item.href}
              active={isAppNavItemActive(pathname, item)}
              collapsed={collapsed}
              compact={compact}
              item={item}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>
    </div>
  );
}

export function AppShell({
  children,
  role,
  allowances,
  user,
  signOutAction
}: {
  children: React.ReactNode;
  role: string;
  allowances?: Record<string, boolean> | null;
  user: {
    name: string | null;
    email: string | null;
  };
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const navItems = useMemo(() => getAppNavItemsForRole(role, allowances), [allowances, role]);
  const currentItem = useMemo(() => getCurrentAppNavItem(role, pathname, allowances), [allowances, pathname, role]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;

    if (drawerOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    const returnFocusTarget = menuButtonRef.current;
    const focusable = getFocusableElements(drawerRef.current);
    focusable[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrawerOpen(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const drawerFocusable = getFocusableElements(drawerRef.current);
      if (drawerFocusable.length === 0) {
        return;
      }

      const first = drawerFocusable[0];
      const last = drawerFocusable[drawerFocusable.length - 1];
      if (!first || !last) {
        return;
      }
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      returnFocusTarget?.focus();
    };
  }, [drawerOpen]);

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="min-h-[100dvh] bg-paper lg:flex lg:h-[100dvh] lg:overflow-hidden">
      {navItems.length > 0 ? (
        <aside
          aria-label="Primary navigation"
          className={`hidden overflow-hidden border-r border-slate-200 bg-[#f5f7fb] transition-[width] duration-200 motion-reduce:transition-none lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:flex-col ${
            sidebarCollapsed ? "lg:w-[72px]" : "lg:w-64"
          }`}
        >
          <div className={`border-b border-slate-200 bg-[#f8fafc] ${sidebarCollapsed ? "px-2 py-2.5" : "px-4 py-3"}`}>
            <div className={`flex items-start ${sidebarCollapsed ? "justify-center" : "justify-between gap-3"}`}>
              <BrandBlock collapsed={sidebarCollapsed} />
              {!sidebarCollapsed ? (
                <button
                  aria-label="Collapse sidebar"
                  className="pressable pressable-icon inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 outline-none transition-colors hover:bg-white hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--tenant-primary-rgb)/0.35)] focus-visible:ring-offset-2"
                  onClick={() => setSidebarCollapsed(true)}
                  type="button"
                >
                  <span aria-hidden="true">&lt;</span>
                </button>
              ) : null}
            </div>
            {sidebarCollapsed ? (
              <div className="mt-2 flex justify-center">
                <button
                  aria-label="Expand sidebar"
                  className="pressable pressable-icon inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 outline-none transition-colors hover:bg-white hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--tenant-primary-rgb)/0.35)] focus-visible:ring-offset-2"
                  onClick={() => setSidebarCollapsed(false)}
                  type="button"
                >
                  <span aria-hidden="true">&gt;</span>
                </button>
              </div>
            ) : null}
          </div>
          <NavSection collapsed={sidebarCollapsed} compact={false} navItems={navItems} pathname={pathname} />
        </aside>
      ) : null}

      {navItems.length > 0 ? (
        <>
          <div
            aria-hidden={!drawerOpen}
            className={`fixed inset-0 z-40 bg-slate-950/40 transition-opacity duration-200 motion-reduce:transition-none lg:hidden ${
              drawerOpen ? "pointer-events-auto opacity-100 visible" : "pointer-events-none opacity-0 invisible"
            }`}
            onClick={closeDrawer}
          />
          <aside
            aria-label="Primary navigation"
            aria-modal={drawerOpen}
            className={`fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[min(320px,86vw)] flex-col overflow-hidden border-r border-slate-200 bg-[#f5f7fb] shadow-2xl transition-[transform,visibility] duration-200 motion-reduce:transition-none lg:hidden ${
              drawerOpen ? "translate-x-0 visible" : "-translate-x-full invisible"
            }`}
            ref={drawerRef}
            role="dialog"
            style={{
              paddingTop: "max(0rem, env(safe-area-inset-top))",
              paddingBottom: "max(0rem, env(safe-area-inset-bottom))"
            }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-[#f8fafc] px-4 py-4">
              <BrandBlock collapsed={false} />
              <button
                aria-label="Close navigation"
                className="pressable pressable-icon inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 outline-none transition-colors hover:bg-white hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--tenant-primary-rgb)/0.35)] focus-visible:ring-offset-2"
                onClick={closeDrawer}
                type="button"
              >
                <span aria-hidden="true">X</span>
              </button>
            </div>
            <NavSection
              collapsed={false}
              compact={true}
              navItems={navItems}
              onNavigate={closeDrawer}
              pathname={pathname}
            />
          </aside>
        </>
      ) : null}

      <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col lg:h-[100dvh] lg:min-h-0">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div
            className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8"
            style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
          >
            <div className="flex min-w-0 items-center gap-3">
              {navItems.length > 0 ? (
                <button
                  aria-label="Open navigation"
                  className="pressable inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 outline-none transition-colors hover:border-[color:rgb(var(--tenant-primary-rgb)/0.34)] hover:text-[var(--tenant-primary)] focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--tenant-primary-rgb)/0.35)] focus-visible:ring-offset-2 lg:hidden"
                  onClick={() => setDrawerOpen(true)}
                  ref={menuButtonRef}
                  type="button"
                >
                  Menu
                </button>
              ) : null}
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Workspace</p>
                <h1 className="truncate text-lg font-semibold text-ink">{currentItem?.label ?? user.name ?? "Workspace"}</h1>
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <div className="hidden min-w-0 text-right text-sm text-slate-500 sm:block">
                <p className="truncate">{user.email}</p>
                <p className="truncate capitalize">{role.replaceAll("_", " ")}</p>
              </div>
              <form action={signOutAction}>
                <button className="pressable min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium outline-none transition-colors hover:border-[color:rgb(var(--tenant-primary-rgb)/0.34)] hover:text-[var(--tenant-primary)] focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--tenant-primary-rgb)/0.35)] focus-visible:ring-offset-2" type="submit">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>

        <main
          className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:overflow-y-auto lg:px-8"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto w-full max-w-[1700px] min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
