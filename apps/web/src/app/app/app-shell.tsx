"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { getAppNavItemsForRole, getCurrentAppNavItem, isAppNavItemActive, type AppNavItem } from "./app-nav-config";

function SidebarNavItem({
  item,
  active,
  collapsed,
  onNavigate
}: {
  item: AppNavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`group flex min-h-12 items-center gap-3 rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
        active
          ? "border-slateblue bg-slateblue text-white shadow-sm"
          : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-ink"
      } ${collapsed ? "justify-center px-2" : ""}`}
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
    >
      <span
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold uppercase tracking-[0.18em] ${
          active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
        }`}
      >
        {item.abbreviation}
      </span>
      {!collapsed ? <span className="min-w-0 truncate">{item.shortLabel}</span> : null}
    </Link>
  );
}

function SidebarContent({
  currentItem,
  collapsed,
  navItems,
  pathname,
  onNavigate
}: {
  currentItem: AppNavItem | null;
  collapsed: boolean;
  navItems: AppNavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-4 py-5">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500 ${collapsed ? "text-center" : ""}`}>
          TradeWorx
        </p>
        {!collapsed ? <p className="mt-2 text-sm text-slate-500">{currentItem?.label ?? "Workspace"}</p> : null}
      </div>
      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-2">
          {navItems.map((item) => (
            <SidebarNavItem
              key={item.href}
              active={isAppNavItemActive(pathname, item)}
              collapsed={collapsed}
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen lg:flex">
      {navItems.length > 0 ? (
        <aside className={`hidden border-r border-slate-200 bg-slate-50/90 transition-[width] duration-200 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col ${sidebarCollapsed ? "lg:w-[5.75rem]" : "lg:w-72"}`}>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
            {!sidebarCollapsed ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Workspace</p>
                <p className="mt-2 text-sm font-semibold text-ink">{currentItem?.label ?? "TradeWorx"}</p>
              </div>
            ) : (
              <div className="mx-auto text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">TW</div>
            )}
            <button
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-ink"
              onClick={() => setSidebarCollapsed((value) => !value)}
              type="button"
            >
              {sidebarCollapsed ? ">" : "<"}
            </button>
          </div>
          <SidebarContent collapsed={sidebarCollapsed} currentItem={currentItem} navItems={navItems} pathname={pathname} />
        </aside>
      ) : null}

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setMobileNavOpen(false)}>
          <aside
            className="h-full w-[min(20rem,85vw)] border-r border-slate-200 bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">TradeWorx</p>
                <p className="mt-2 text-sm font-semibold text-ink">{currentItem?.label ?? "Workspace"}</p>
              </div>
              <button
                aria-label="Close navigation"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600"
                onClick={() => setMobileNavOpen(false)}
                type="button"
              >
                X
              </button>
            </div>
            <SidebarContent collapsed={false} currentItem={currentItem} navItems={navItems} onNavigate={() => setMobileNavOpen(false)} pathname={pathname} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              {navItems.length > 0 ? (
                <button
                  aria-label="Open navigation"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 lg:hidden"
                  onClick={() => setMobileNavOpen(true)}
                  type="button"
                >
                  Menu
                </button>
              ) : null}
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">TradeWorx</p>
                <h1 className="truncate text-lg font-semibold text-ink">{currentItem?.label ?? user.name ?? "Workspace"}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right text-sm text-slate-500 sm:block">
                <p className="truncate">{user.email}</p>
                <p className="capitalize">{role.replaceAll("_", " ")}</p>
              </div>
              <form action={signOutAction}>
                <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium" type="submit">Sign out</button>
              </form>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1700px] min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
