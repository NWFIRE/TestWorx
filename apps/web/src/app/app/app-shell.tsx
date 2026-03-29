"use client";

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
  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      className={`group relative flex min-h-12 min-w-0 items-center gap-3 overflow-hidden rounded-xl border px-3 py-3 text-sm font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-slateblue focus-visible:ring-offset-2 motion-reduce:transition-none ${
        active
          ? "border-slateblue bg-slateblue text-white shadow-sm"
          : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-ink"
      } ${collapsed ? "justify-center px-2" : ""} ${compact ? "min-h-[48px]" : ""}`}
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
    >
      {collapsed ? (
        <span
          aria-hidden="true"
          className={`absolute left-1 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full ${
            active ? "bg-white/90" : "bg-transparent"
          }`}
        />
      ) : null}
      <span
        aria-hidden="true"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold uppercase tracking-[0.16em] ${
          active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
        }`}
      >
        <span className="flex h-5 w-5 items-center justify-center">{item.abbreviation}</span>
      </span>
      {!collapsed ? <span className="min-w-0 truncate">{item.shortLabel}</span> : null}
    </Link>
  );
}

function BrandBlock({
  currentItem,
  collapsed
}: {
  currentItem: AppNavItem | null;
  collapsed: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 overflow-hidden">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slateblue text-sm font-bold uppercase tracking-[0.18em] text-white">
        TW
      </div>
      {!collapsed ? (
        <div className="min-w-0 overflow-hidden">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">TradeWorx</p>
          <p className="truncate text-sm font-semibold text-ink">{currentItem?.label ?? "Workspace"}</p>
        </div>
      ) : null}
    </div>
  );
}

function NavSection({
  currentItem,
  collapsed,
  compact,
  navItems,
  pathname,
  onNavigate
}: {
  currentItem: AppNavItem | null;
  collapsed: boolean;
  compact: boolean;
  navItems: AppNavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className={`min-w-0 border-b border-slate-200 px-4 pb-4 pt-5 ${collapsed ? "px-2 text-center" : ""}`}>
        {!collapsed ? (
          <>
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Workspace</p>
            <p className="mt-2 truncate text-sm font-medium text-slate-600">{currentItem?.label ?? "Workspace"}</p>
          </>
        ) : (
          <div className="h-6" aria-hidden="true" />
        )}
      </div>
      <nav aria-label="Primary navigation" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-2">
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
      <div className={`shrink-0 px-4 pb-5 pt-3 ${collapsed ? "px-2" : ""}`}>
        {!collapsed ? <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">Workspace navigation</div> : <div className="h-8" aria-hidden="true" />}
      </div>
    </div>
  );
}

export function AppShell({
  children,
  role,
  user,
  signOutAction
}: {
  children: React.ReactNode;
  role: string;
  user: {
    name: string | null;
    email: string | null;
  };
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const navItems = useMemo(() => getAppNavItemsForRole(role), [role]);
  const currentItem = useMemo(() => getCurrentAppNavItem(role, pathname), [pathname, role]);
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
    <div className="min-h-[100dvh] bg-paper lg:flex">
      {navItems.length > 0 ? (
        <aside
          aria-label="Primary navigation"
          className={`hidden overflow-hidden border-r border-slate-200 bg-white transition-[width] duration-200 motion-reduce:transition-none lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:flex-col ${
            sidebarCollapsed ? "lg:w-[72px]" : "lg:w-64"
          }`}
        >
          <div className={`border-b border-slate-200 ${sidebarCollapsed ? "px-2 py-3" : "px-4 py-4"}`}>
            <BrandBlock collapsed={sidebarCollapsed} currentItem={currentItem} />
            {!sidebarCollapsed ? (
              <button
                aria-label="Collapse sidebar"
                className="mt-3 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 outline-none transition-colors hover:border-slate-300 hover:text-ink focus-visible:ring-2 focus-visible:ring-slateblue focus-visible:ring-offset-2"
                onClick={() => setSidebarCollapsed(true)}
                type="button"
              >
                <span aria-hidden="true">&lt;</span>
              </button>
            ) : (
              <div className="mt-3 flex justify-center">
                <button
                  aria-label="Expand sidebar"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 outline-none transition-colors hover:border-slate-300 hover:text-ink focus-visible:ring-2 focus-visible:ring-slateblue focus-visible:ring-offset-2"
                  onClick={() => setSidebarCollapsed(false)}
                  type="button"
                >
                  <span aria-hidden="true">&gt;</span>
                </button>
              </div>
            )}
          </div>
          <NavSection collapsed={sidebarCollapsed} compact={false} currentItem={currentItem} navItems={navItems} pathname={pathname} />
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
            className={`fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[min(320px,86vw)] flex-col overflow-hidden border-r border-slate-200 bg-white shadow-2xl transition-[transform,visibility] duration-200 motion-reduce:transition-none lg:hidden ${
              drawerOpen ? "translate-x-0 visible" : "-translate-x-full invisible"
            }`}
            ref={drawerRef}
            role="dialog"
            style={{
              paddingTop: "max(0rem, env(safe-area-inset-top))",
              paddingBottom: "max(0rem, env(safe-area-inset-bottom))"
            }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
              <BrandBlock collapsed={false} currentItem={currentItem} />
              <button
                aria-label="Close navigation"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 outline-none transition-colors hover:border-slate-300 hover:text-ink focus-visible:ring-2 focus-visible:ring-slateblue focus-visible:ring-offset-2"
                onClick={closeDrawer}
                type="button"
              >
                <span aria-hidden="true">X</span>
              </button>
            </div>
            <NavSection
              collapsed={false}
              compact={true}
              currentItem={currentItem}
              navItems={navItems}
              onNavigate={closeDrawer}
              pathname={pathname}
            />
          </aside>
        </>
      ) : null}

      <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div
            className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8"
            style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
          >
            <div className="flex min-w-0 items-center gap-3">
              {navItems.length > 0 ? (
                <button
                  aria-label="Open navigation"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 outline-none transition-colors hover:border-slate-300 hover:text-ink focus-visible:ring-2 focus-visible:ring-slateblue focus-visible:ring-offset-2 lg:hidden"
                  onClick={() => setDrawerOpen(true)}
                  ref={menuButtonRef}
                  type="button"
                >
                  Menu
                </button>
              ) : null}
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Workspace</p>
                <h1 className="truncate text-lg font-semibold text-ink">{currentItem?.label ?? user.name ?? "Workspace"}</h1>
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <div className="hidden min-w-0 text-right text-sm text-slate-500 sm:block">
                <p className="truncate">{user.email}</p>
                <p className="truncate capitalize">{role.replaceAll("_", " ")}</p>
              </div>
              <form action={signOutAction}>
                <button className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium outline-none transition-colors hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-slateblue focus-visible:ring-offset-2" type="submit">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>

        <main
          className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto w-full max-w-[1700px] min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
