"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

import { BrandLoader } from "@/app/brand-loader";
import { useSmartBack } from "@/app/use-smart-back";
import { getAppNavItemsForRole, getCurrentAppNavItem, isAppNavItemActive, type AppNavItem } from "./app-nav-config";
import { MobilePullToRefresh } from "./mobile-pull-to-refresh";
import { NativeTechnicianRouteGuard } from "./native-technician-route-guard";
import { TechnicianSyncBootstrap } from "./tech/offline/technician-sync-bootstrap";
import { NativeTechnicianBridge } from "./tech/native-technician-bridge";
import { TechnicianNotificationProvider, TechnicianNotificationQueryBridge } from "./tech/technician-notifications-client";
import { TechnicianMobileHeader, TechnicianMobileTabBar } from "./tech/technician-mobile-shell";

const DRAWER_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

const MOBILE_KEYBOARD_THRESHOLD = 120;
const EXPANDED_SIDEBAR_BREAKPOINT = 1280;
const SIMPLIFIED_WORKSPACE_NAV_ENABLED = process.env.NEXT_PUBLIC_SIMPLIFIED_WORKSPACE_NAV !== "0";

function isKeyboardFocusableElement(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function syncTextareaHeight(textarea: HTMLTextAreaElement) {
  if (textarea.dataset.autoGrow === "off") {
    return;
  }

  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(textarea.scrollHeight, textarea.clientHeight)}px`;
  textarea.style.overflowY = "hidden";
}

function getVisibleViewportMetrics() {
  const viewport = typeof window !== "undefined" ? window.visualViewport : null;
  const viewportHeight = viewport ? viewport.height : window.innerHeight;
  const viewportOffsetTop = viewport ? viewport.offsetTop : 0;
  const viewportBottom = viewportHeight + viewportOffsetTop;

  return {
    viewportHeight,
    viewportOffsetTop,
    viewportBottom
  };
}

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
    case "book":
      return (
        <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
          <path {...shared} d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5v-16Z" />
          <path {...shared} d="M7.5 3A2.5 2.5 0 0 0 5 5.5V19m4-11h6m-6 4h6" />
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
  onPrefetch,
  onNavigate
}: {
  item: AppNavItem;
  active: boolean;
  collapsed: boolean;
  compact: boolean;
  onPrefetch?: (href: string) => void;
  onNavigate?: (href: string) => void;
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
        className={`pressable pressable-row group relative flex min-h-[44px] min-w-0 items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--tenant-primary-rgb)/0.38)] focus-visible:ring-offset-2 motion-reduce:transition-none before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-1 before:rounded-full before:opacity-0 ${
          active
          ? "bg-white text-ink before:opacity-100 shadow-[inset_0_0_0_1px_var(--tenant-primary-border),0_10px_24px_rgba(9,18,32,0.10)]"
          : "text-[color:var(--text-muted)] hover:bg-white/90 hover:text-ink hover:shadow-[0_8px_18px_rgba(9,18,32,0.06)]"
      } ${tone.activeBar} ${collapsed ? "justify-center px-2" : ""} ${compact ? "min-h-[48px]" : ""}`}
      href={item.href}
      onClick={() => onNavigate?.(item.href)}
      onFocus={() => onPrefetch?.(item.href)}
      onPointerEnter={() => onPrefetch?.(item.href)}
      prefetch
      title={collapsed ? item.label : undefined}
    >
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center ${active ? tone.activeIcon : "text-[color:var(--text-muted)] group-hover:text-ink"}`}
      >
        <NavIcon className="h-5 w-5" icon={item.icon} />
      </span>
      {!collapsed ? (
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${active ? "font-bold text-ink" : "font-semibold"}`}>{item.shortLabel}</span>
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
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[color:var(--border-default)] bg-white shadow-[0_8px_22px_rgba(9,18,32,0.10)]">
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
          <p className="truncate text-[13px] font-black uppercase tracking-[0.26em] text-ink">TradeWorx</p>
        </div>
      ) : null}
    </div>
  );
}

function DesktopBackButton({ fallbackHref }: { fallbackHref?: string | null }) {
  const smartBack = useSmartBack(fallbackHref);

  return (
    <button
      aria-label="Go back"
      className="pressable hidden h-8 items-center rounded-lg border border-[color:var(--border-default)] bg-white px-2.5 text-xs font-bold text-[color:var(--text-secondary)] shadow-sm transition hover:border-[color:var(--border-strong)] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--tenant-primary-rgb)/0.28)] lg:inline-flex"
      onClick={() => smartBack()}
      type="button"
    >
      Back
    </button>
  );
}

function NavSection({
  collapsed,
  compact,
  navItems,
  onPrefetch,
  pathname,
  onNavigate
}: {
  collapsed: boolean;
  compact: boolean;
  navItems: AppNavItem[];
  onPrefetch?: (href: string) => void;
  pathname: string;
  onNavigate?: (href: string) => void;
}) {
  const groupedNavItems = useMemo(() => {
    if (!SIMPLIFIED_WORKSPACE_NAV_ENABLED) {
      return [
        {
          group: "Workspace",
          items: navItems,
        },
      ];
    }

    const groupOrder: NonNullable<AppNavItem["group"]>[] = ["Dashboard", "Work", "Billing", "Customers", "Operations", "Settings", "Portal"];
    const simplifiedRank = new Map([
      ["/app/admin/dashboard", 10],
      ["/app/admin/inspections", 20],
      ["/app/admin/upcoming-inspections", 30],
      ["/app/admin/archive", 40],
      ["/app/admin/amendments", 50],
      ["/app/deficiencies", 60],
      ["/app/admin/billing", 70],
      ["/app/admin/quotes", 80],
      ["/app/admin/clients", 90],
      ["/app/admin/email-reminders", 100],
      ["/app/admin/parts-and-services", 110],
      ["/app/admin/settings", 120],
      ["/app/manuals", 130],
      ["/app/admin/team", 140]
    ]);
    const sortGroup = (items: AppNavItem[]) => [...items].sort((left, right) => {
      const leftRank = simplifiedRank.get(left.href);
      const rightRank = simplifiedRank.get(right.href);
      if (leftRank === undefined && rightRank === undefined) {
        return navItems.indexOf(left) - navItems.indexOf(right);
      }
      return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
    });
    const grouped = new Map<string, AppNavItem[]>();
    for (const item of navItems) {
      const group = item.group ?? "Dashboard";
      grouped.set(group, [...(grouped.get(group) ?? []), item]);
    }

    const knownGroups = groupOrder
      .filter((group) => grouped.has(group))
      .map((group) => ({ group, items: sortGroup(grouped.get(group) ?? []) }));
    const unknownGroups = [...grouped.entries()]
      .filter(([group]) => !groupOrder.includes(group as NonNullable<AppNavItem["group"]>))
      .map(([group, items]) => ({ group, items: sortGroup(items) }));

    return [...knownGroups, ...unknownGroups];
  }, [navItems]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <nav aria-label="Primary navigation" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {!collapsed ? (
          <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Workspace</p>
        ) : null}
        <div className="space-y-4">
          {groupedNavItems.map(({ group, items }) => (
            <div className="space-y-1.5" key={group}>
              {!collapsed && groupedNavItems.length > 1 ? (
                <p className="px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">{group}</p>
              ) : null}
              {items.map((item) => (
                <NavItem
                  key={item.href}
                  active={isAppNavItemActive(pathname, item)}
                  collapsed={collapsed}
                  compact={compact}
                  item={item}
                  onPrefetch={onPrefetch}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
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
  sidebarOrder,
  user,
  signOutAction
}: {
  children: React.ReactNode;
  role: string;
  allowances?: Record<string, boolean> | null;
  sidebarOrder?: string[] | null;
  user: {
    name: string | null;
    email: string | null;
  };
  signOutAction: () => Promise<void>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isTechnician = role === "technician";
  const navItems = useMemo(() => getAppNavItemsForRole(role, allowances, sidebarOrder), [allowances, role, sidebarOrder]);
  const [pendingNavHref, setPendingNavHref] = useState<string | null>(null);
  const activePathname = pendingNavHref && !isAppNavItemActive(pathname, { href: pendingNavHref, label: "", shortLabel: "", abbreviation: "" })
    ? pendingNavHref
    : pathname;
  const currentItem = useMemo(() => getCurrentAppNavItem(role, activePathname, allowances, sidebarOrder), [activePathname, allowances, role, sidebarOrder]);
  const desktopBackFallbackHref = role === "customer_user" && pathname !== "/app/customer" ? "/app/customer" : null;
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window === "undefined" || window.innerWidth < EXPANDED_SIDEBAR_BREAKPOINT
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const shellContentRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const pendingNavTimeoutRef = useRef<number | null>(null);

  const prefetchNavHref = useCallback((href: string) => {
    router.prefetch(href);
  }, [router]);

  const handleSidebarNavigate = useCallback((href: string) => {
    prefetchNavHref(href);
    if (href !== pathname) {
      setPendingNavHref(href);
    }
    setDrawerOpen(false);
  }, [pathname, prefetchNavHref]);

  const updateViewportMetrics = useCallback(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const viewport = window.visualViewport;
    const appHeight = viewport ? viewport.height + viewport.offsetTop : window.innerHeight;
    const rawKeyboardOffset = viewport ? window.innerHeight - viewport.height - viewport.offsetTop : 0;
    const keyboardOffset = rawKeyboardOffset > MOBILE_KEYBOARD_THRESHOLD ? rawKeyboardOffset : 0;

    document.documentElement.style.setProperty("--app-height", `${Math.round(appHeight)}px`);
    document.documentElement.style.setProperty("--keyboard-offset", `${Math.round(keyboardOffset)}px`);
    document.body.dataset.keyboardOpen = keyboardOffset > 0 ? "true" : "false";
    document.documentElement.dataset.keyboardOpen = keyboardOffset > 0 ? "true" : "false";
  }, []);

  const handleRefresh = useCallback(() => {
    startRefreshTransition(() => {
      router.refresh();
    });
  }, [router]);

  useEffect(() => {
    if (!pendingNavHref) {
      return;
    }

    if (pendingNavTimeoutRef.current) {
      window.clearTimeout(pendingNavTimeoutRef.current);
    }

    pendingNavTimeoutRef.current = window.setTimeout(() => {
      setPendingNavHref(null);
      pendingNavTimeoutRef.current = null;
    }, 3500);

    return () => {
      if (pendingNavTimeoutRef.current) {
        window.clearTimeout(pendingNavTimeoutRef.current);
        pendingNavTimeoutRef.current = null;
      }
    };
  }, [pendingNavHref]);

  useEffect(() => {
    if (typeof window === "undefined" || navItems.length === 0) {
      return;
    }

    const uniqueHrefs = Array.from(new Set(navItems.map((item) => item.href)));
    const browserWindow = window as Window & typeof globalThis & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const warmRoutes = () => {
      for (const href of uniqueHrefs) {
        router.prefetch(href);
      }
    };

    if (browserWindow.requestIdleCallback && browserWindow.cancelIdleCallback) {
      const idleId = browserWindow.requestIdleCallback(warmRoutes, { timeout: 1800 });
      return () => browserWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = globalThis.setTimeout(warmRoutes, 250);
    return () => globalThis.clearTimeout(timeoutId);
  }, [navItems, router]);

  const keepFocusedElementVisible = useCallback((target: HTMLElement) => {
    const container = contentRef.current;
    if (!container || !isKeyboardFocusableElement(target)) {
      return;
    }

    if (target instanceof HTMLTextAreaElement) {
      syncTextareaHeight(target);
    }

    window.requestAnimationFrame(() => {
      const header = container.previousElementSibling instanceof HTMLElement ? container.previousElementSibling : null;
      const headerHeight = header?.getBoundingClientRect().height ?? 0;
      const { viewportBottom } = getVisibleViewportMetrics();
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const visibleTop = containerRect.top + headerHeight + 12;
      const visibleBottom = Math.min(containerRect.bottom, viewportBottom) - 20;

      if (targetRect.top >= visibleTop && targetRect.bottom <= visibleBottom) {
        return;
      }

      target.scrollIntoView({
        block: "center",
        behavior: "smooth",
        inline: "nearest"
      });

      window.setTimeout(() => {
        const refreshedContainerRect = container.getBoundingClientRect();
        const refreshedTargetRect = target.getBoundingClientRect();
        const refreshedBottom = Math.min(refreshedContainerRect.bottom, getVisibleViewportMetrics().viewportBottom) - 20;
        const refreshedTop = refreshedContainerRect.top + headerHeight + 12;

        if (refreshedTargetRect.top >= refreshedTop && refreshedTargetRect.bottom <= refreshedBottom) {
          return;
        }

        const currentScrollTop = container.scrollTop;
        const targetTopWithinContainer = refreshedTargetRect.top - refreshedContainerRect.top + currentScrollTop;
        const desiredTop = Math.max(0, targetTopWithinContainer - Math.max(32, headerHeight + 24));

        container.scrollTo({
          top: desiredTop,
          behavior: "smooth"
        });
      }, 90);
    });
  }, []);

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
    const container = contentRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      top: 0,
      behavior: "auto"
    });
  }, [pathname]);

  useEffect(() => {
    updateViewportMetrics();

    const viewport = window.visualViewport;
    window.addEventListener("resize", updateViewportMetrics);
    window.addEventListener("orientationchange", updateViewportMetrics);
    if (viewport) {
      viewport.addEventListener("resize", updateViewportMetrics);
      viewport.addEventListener("scroll", updateViewportMetrics);
    }

    return () => {
      window.removeEventListener("resize", updateViewportMetrics);
      window.removeEventListener("orientationchange", updateViewportMetrics);
      if (viewport) {
        viewport.removeEventListener("resize", updateViewportMetrics);
        viewport.removeEventListener("scroll", updateViewportMetrics);
      }
      document.documentElement.style.removeProperty("--app-height");
      document.documentElement.style.removeProperty("--keyboard-offset");
      delete document.documentElement.dataset.keyboardOpen;
      delete document.body.dataset.keyboardOpen;
    };
  }, [updateViewportMetrics]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleViewportShift = () => {
      const activeElement = document.activeElement;
      if (!isKeyboardFocusableElement(activeElement)) {
        return;
      }

      keepFocusedElementVisible(activeElement);
    };

    const viewport = window.visualViewport;
    window.addEventListener("resize", handleViewportShift);
    window.addEventListener("orientationchange", handleViewportShift);
    if (viewport) {
      viewport.addEventListener("resize", handleViewportShift);
      viewport.addEventListener("scroll", handleViewportShift);
    }

    return () => {
      window.removeEventListener("resize", handleViewportShift);
      window.removeEventListener("orientationchange", handleViewportShift);
      if (viewport) {
        viewport.removeEventListener("resize", handleViewportShift);
        viewport.removeEventListener("scroll", handleViewportShift);
      }
    };
  }, [keepFocusedElementVisible]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) {
      return;
    }

    const handleFocusIn = (event: FocusEvent) => {
      if (!isKeyboardFocusableElement(event.target)) {
        return;
      }

      keepFocusedElementVisible(event.target);
      window.setTimeout(() => keepFocusedElementVisible(event.target as HTMLElement), 140);
      window.setTimeout(() => keepFocusedElementVisible(event.target as HTMLElement), 320);
    };

    const handleInput = (event: Event) => {
      if (!(event.target instanceof HTMLTextAreaElement)) {
        return;
      }

      syncTextareaHeight(event.target);
      keepFocusedElementVisible(event.target);
    };

    container.addEventListener("focusin", handleFocusIn);
    container.addEventListener("input", handleInput);

    return () => {
      container.removeEventListener("focusin", handleFocusIn);
      container.removeEventListener("input", handleInput);
    };
  }, [keepFocusedElementVisible]);

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

  const shell = (
    <div className="bg-paper lg:flex lg:overflow-hidden" style={{ minHeight: "var(--app-height, 100dvh)" }}>
      {isTechnician ? <TechnicianSyncBootstrap /> : null}
      {navItems.length > 0 ? (
        <aside
          aria-label="Primary navigation"
          className={`hidden overflow-hidden border-r border-[color:var(--border-strong)] bg-[color:var(--sidebar-bg)] shadow-[4px_0_24px_rgba(9,18,32,0.06)] transition-[width] duration-200 motion-reduce:transition-none lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:flex-col ${
            sidebarCollapsed ? "lg:w-[72px]" : "lg:w-64"
          }`}
        >
          <div className={`border-b border-[color:var(--border-default)] bg-[color:var(--sidebar-header-bg)] ${sidebarCollapsed ? "px-2 py-2.5" : "px-4 py-3"}`}>
            <div className={`flex items-start ${sidebarCollapsed ? "justify-center" : "justify-between gap-3"}`}>
              <BrandBlock collapsed={sidebarCollapsed} />
              {!sidebarCollapsed ? (
                <button
                  aria-label="Collapse sidebar"
                  className="pressable pressable-icon inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-[color:var(--text-muted)] outline-none transition-colors hover:border-[color:var(--border-default)] hover:bg-white hover:text-ink focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--tenant-primary-rgb)/0.35)] focus-visible:ring-offset-2"
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
                  className="pressable pressable-icon inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-[color:var(--text-muted)] outline-none transition-colors hover:border-[color:var(--border-default)] hover:bg-white hover:text-ink focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--tenant-primary-rgb)/0.35)] focus-visible:ring-offset-2"
                  onClick={() => setSidebarCollapsed(false)}
                  type="button"
                >
                  <span aria-hidden="true">&gt;</span>
                </button>
              </div>
            ) : null}
          </div>
          <NavSection
            collapsed={sidebarCollapsed}
            compact={false}
            navItems={navItems}
            onNavigate={handleSidebarNavigate}
            onPrefetch={prefetchNavHref}
            pathname={activePathname}
          />
        </aside>
      ) : null}

      {navItems.length > 0 && !isTechnician ? (
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
            className={`fixed inset-y-0 left-0 z-50 flex w-[min(320px,86vw)] flex-col overflow-hidden border-r border-[color:var(--border-strong)] bg-[color:var(--sidebar-bg)] shadow-2xl transition-[transform,visibility] duration-200 motion-reduce:transition-none lg:hidden ${
              drawerOpen ? "translate-x-0 visible" : "-translate-x-full invisible"
            }`}
            ref={drawerRef}
            role="dialog"
            style={{
              height: "var(--app-height, 100dvh)",
              paddingTop: "max(0rem, env(safe-area-inset-top))",
              paddingBottom: "max(0rem, env(safe-area-inset-bottom))"
            }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border-default)] bg-[color:var(--sidebar-header-bg)] px-4 py-4">
              <BrandBlock collapsed={false} />
              <button
                aria-label="Close navigation"
                className="pressable pressable-icon inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent text-[color:var(--text-muted)] outline-none transition-colors hover:border-[color:var(--border-default)] hover:bg-white hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--tenant-primary-rgb)/0.35)] focus-visible:ring-offset-2"
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
              onNavigate={handleSidebarNavigate}
              onPrefetch={prefetchNavHref}
              pathname={activePathname}
            />
          </aside>
        </>
      ) : null}

      <div
        className="flex min-w-0 flex-1 flex-col lg:h-[100dvh] lg:min-h-0"
        ref={shellContentRef}
        style={{ minHeight: "var(--app-height, 100dvh)" }}
      >
        <header className="sticky top-0 z-30 border-b border-[color:var(--border-strong)] bg-white/97 shadow-[0_8px_26px_rgba(9,18,32,0.07)] backdrop-blur">
          <div
            className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8"
            style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
          >
            {isTechnician ? (
              <TechnicianMobileHeader allowances={allowances} pathname={pathname} userName={user.name} />
            ) : (
              <>
                <div className="flex min-w-0 items-center gap-3">
                  {navItems.length > 0 ? (
                <button
                  aria-label="Open navigation"
                  className="pressable inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[color:var(--border-default)] bg-white px-3 text-sm font-bold text-[color:var(--text-secondary)] shadow-sm outline-none transition-colors hover:border-[color:rgb(var(--tenant-primary-rgb)/0.34)] hover:text-[var(--tenant-primary)] focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--tenant-primary-rgb)/0.35)] focus-visible:ring-offset-2 lg:hidden"
                  onClick={() => setDrawerOpen(true)}
                  ref={menuButtonRef}
                  type="button"
                >
                  Menu
                </button>
                  ) : null}
                  <DesktopBackButton fallbackHref={desktopBackFallbackHref} />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">Workspace</p>
                    <h1 className="truncate text-lg font-bold text-ink">{currentItem?.label ?? user.name ?? "Workspace"}</h1>
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="hidden min-w-0 text-right text-sm font-semibold text-[color:var(--text-muted)] sm:block">
                    <p className="truncate">{user.email}</p>
                    <p className="truncate capitalize">{role.replaceAll("_", " ")}</p>
                  </div>
                  <button
                    aria-label="Refresh page"
                    className="pressable hidden min-h-11 min-w-11 items-center justify-center rounded-xl border border-[color:var(--border-default)] bg-white px-3 text-sm font-bold text-[color:var(--text-secondary)] shadow-sm outline-none transition-colors hover:border-[color:rgb(var(--tenant-primary-rgb)/0.34)] hover:text-[var(--tenant-primary)] focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--tenant-primary-rgb)/0.35)] focus-visible:ring-offset-2 lg:inline-flex"
                    disabled={isRefreshing}
                    onClick={handleRefresh}
                    title={isRefreshing ? "Refreshing..." : "Refresh page"}
                    type="button"
                  >
                    <BrandLoader animated={isRefreshing} className={isRefreshing ? "opacity-100" : "opacity-85"} label={isRefreshing ? "Refreshing" : "Refresh page"} size="sm" tone="muted" />
                  </button>
                  <form action={signOutAction}>
                    <button className="pressable min-h-11 rounded-xl border border-[color:var(--border-default)] bg-white px-4 py-2 text-sm font-bold text-[color:var(--text-secondary)] shadow-sm outline-none transition-colors hover:border-[color:rgb(var(--tenant-primary-rgb)/0.34)] hover:text-[var(--tenant-primary)] focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--tenant-primary-rgb)/0.35)] focus-visible:ring-offset-2" type="submit">
                      Sign out
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </header>

        <main
          className={`min-w-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-6 sm:px-6 lg:px-8 ${isTechnician ? "pb-28 lg:pb-6" : ""}`}
          ref={contentRef}
          style={{
            paddingBottom: isTechnician
              ? "calc(var(--mobile-tab-bar-offset, 5.5rem) + 1rem + var(--keyboard-offset, 0px))"
              : "calc(max(1.5rem, env(safe-area-inset-bottom)) + var(--keyboard-offset, 0px))",
            scrollPaddingTop: "calc(var(--mobile-header-offset, 88px) + 1rem)",
            scrollPaddingBottom: isTechnician
              ? "calc(var(--keyboard-offset, 0px) + var(--mobile-tab-bar-offset, 5.5rem) + 2rem)"
              : "calc(var(--keyboard-offset, 0px) + 7rem + env(safe-area-inset-bottom))"
          }}
        >
          <MobilePullToRefresh containerRef={contentRef} drawerOpen={drawerOpen} gestureRef={shellContentRef}>
            <div className="mx-auto w-full max-w-[1700px] min-w-0">{children}</div>
          </MobilePullToRefresh>
        </main>
      </div>
      {isTechnician ? <TechnicianMobileTabBar allowances={allowances} pathname={pathname} /> : null}
    </div>
  );

  if (!isTechnician) {
    return shell;
  }

  return (
    <TechnicianNotificationProvider>
      <NativeTechnicianRouteGuard allowances={allowances} role={role} />
      <TechnicianNotificationQueryBridge />
      <NativeTechnicianBridge />
      {shell}
    </TechnicianNotificationProvider>
  );
}
