"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AppQuickNavProps = {
  role: string;
};

type NavLink = {
  href: string;
  label: string;
};

type NavConfig = {
  links: NavLink[];
  compactOnly?: boolean;
};

const navByRole: Record<string, NavConfig> = {
  tenant_admin: {
    compactOnly: true,
    links: [
      { href: "/app/admin", label: "Open scheduling and dispatch" },
      { href: "/app/admin/amendments", label: "Open amendment center" },
      { href: "/app/deficiencies", label: "Open deficiency center" },
      { href: "/app/admin/billing", label: "Open billing review" },
      { href: "/app/admin/settings", label: "Open settings and service fees" }
    ]
  },
  office_admin: {
    compactOnly: true,
    links: [
      { href: "/app/admin", label: "Open scheduling and dispatch" },
      { href: "/app/admin/amendments", label: "Open amendment center" },
      { href: "/app/deficiencies", label: "Open deficiency center" },
      { href: "/app/admin/billing", label: "Open billing review" },
      { href: "/app/admin/settings", label: "Open settings and service fees" }
    ]
  },
  platform_admin: {
    compactOnly: true,
    links: [
      { href: "/app/platform", label: "Open platform admin" },
      { href: "/app/admin", label: "Open scheduling and dispatch" },
      { href: "/app/admin/billing", label: "Open billing review" },
      { href: "/app/admin/settings", label: "Open settings and service fees" }
    ]
  },
  technician: {
    links: [
      { href: "/app/tech", label: "Open field schedule" }
    ]
  },
  customer_user: {
    links: [
      { href: "/app/customer", label: "Open customer portal" }
    ]
  }
};

function isActivePath(pathname: string, href: string) {
  if (href === "/app/admin") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppQuickNav({ role }: AppQuickNavProps) {
  const pathname = usePathname();
  const config = navByRole[role];

  if (!config || pathname === "/app") {
    return null;
  }

  return (
    <section className={`mb-6 ${config.compactOnly ? "rounded-[2rem] bg-white p-4 shadow-panel" : "rounded-[2rem] bg-slateblue p-5 text-white shadow-panel"}`}>
      <div className="flex flex-wrap gap-3">
        {config.links.map((link) => {
          const active = isActivePath(pathname, link.href);
          return (
            <Link
              key={link.href}
              className={`inline-flex min-h-11 items-center rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                config.compactOnly
                  ? active
                    ? "border-slateblue bg-slateblue text-white"
                    : "border-slate-200 bg-white text-slateblue hover:border-slateblue/40 hover:bg-slate-50"
                  : active
                    ? "border-white bg-white text-slateblue"
                    : "border-white/20 text-white hover:border-white/40 hover:bg-white/10"
              }`}
              href={link.href}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
