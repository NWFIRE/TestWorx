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
  eyebrow: string;
  title: string;
  description: string;
  links: NavLink[];
};

const navByRole: Record<string, NavConfig> = {
  tenant_admin: {
    eyebrow: "Office operations",
    title: "Scheduling and dispatch",
    description: "Create, assign, edit, and rebalance recurring inspection work without breaking tenant boundaries.",
    links: [
      { href: "/app/admin", label: "Open scheduling and dispatch" },
      { href: "/app/admin/amendments", label: "Open amendment center" },
      { href: "/app/deficiencies", label: "Open deficiency center" },
      { href: "/app/admin/billing", label: "Open billing review" },
      { href: "/app/admin/settings", label: "Open settings and service fees" }
    ]
  },
  office_admin: {
    eyebrow: "Office operations",
    title: "Scheduling and dispatch",
    description: "Create, assign, edit, and rebalance recurring inspection work without breaking tenant boundaries.",
    links: [
      { href: "/app/admin", label: "Open scheduling and dispatch" },
      { href: "/app/admin/amendments", label: "Open amendment center" },
      { href: "/app/deficiencies", label: "Open deficiency center" },
      { href: "/app/admin/billing", label: "Open billing review" },
      { href: "/app/admin/settings", label: "Open settings and service fees" }
    ]
  },
  platform_admin: {
    eyebrow: "Platform operations",
    title: "Platform administration",
    description: "Move between the platform workspace and tenant operations without losing your place.",
    links: [
      { href: "/app/platform", label: "Open platform admin" },
      { href: "/app/admin", label: "Open scheduling and dispatch" },
      { href: "/app/admin/billing", label: "Open billing review" },
      { href: "/app/admin/settings", label: "Open settings and service fees" }
    ]
  },
  technician: {
    eyebrow: "Field operations",
    title: "Technician workspace",
    description: "Return to the field schedule quickly so assigned work, shared queue items, and active reports stay easy to reach.",
    links: [
      { href: "/app/tech", label: "Open field schedule" }
    ]
  },
  customer_user: {
    eyebrow: "Customer portal",
    title: "Report access",
    description: "Jump back to finalized reports and customer-visible documents from anywhere in the portal.",
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
    <section className="mb-6 rounded-[2rem] bg-slateblue p-5 text-white shadow-panel">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          {config.links.map((link) => {
            const active = isActivePath(pathname, link.href);
            return (
              <Link
                key={link.href}
                className={`inline-flex min-h-11 items-center rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                  active
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
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-white/70">{config.eyebrow}</p>
          <h2 className="mt-2 text-3xl font-semibold">{config.title}</h2>
          <p className="mt-3 max-w-3xl text-white/80">{config.description}</p>
        </div>
      </div>
    </section>
  );
}
