import { canAccessQuoteWorkspace } from "@testworx/lib";

export type AppNavItem = {
  href: string;
  label: string;
  shortLabel: string;
  abbreviation: string;
  icon?: "calendar" | "branch" | "alert" | "invoice" | "settings" | "grid" | "clipboard" | "portal" | "team" | "mail" | "book";
  description?: string;
  tone?: "blue" | "amber" | "emerald" | "violet" | "slate";
  matchMode?: "exact" | "prefix";
  matchPrefixes?: string[];
};

type InternalAllowances = Record<string, boolean> | null | undefined;

const quotesNavItem: AppNavItem = {
  href: "/app/admin/quotes",
  label: "Quotes",
  shortLabel: "Quotes",
  abbreviation: "QT",
  icon: "invoice",
  description: "Create, send, approve, and sync quotes",
  tone: "blue",
  matchMode: "exact",
  matchPrefixes: ["/app/admin/quotes"]
};

const adminNavItems: AppNavItem[] = [
  {
    href: "/app/admin/dashboard",
    label: "Dashboard",
    shortLabel: "Dashboard",
    abbreviation: "DB",
    icon: "calendar",
    description: "Operational overview, priorities, and work visibility",
    tone: "blue",
    matchMode: "exact",
    matchPrefixes: ["/app/admin", "/app/admin/dashboard"]
  },
  {
    href: "/app/admin/inspections",
    label: "Inspections",
    shortLabel: "Inspections",
    abbreviation: "IN",
    icon: "clipboard",
    description: "Create, filter, and manage inspection work",
    tone: "blue",
    matchMode: "exact",
    matchPrefixes: ["/app/admin/inspections", "/app/admin/scheduling"]
  },
  {
    href: "/app/admin/amendments",
    label: "Visit Review",
    shortLabel: "Review",
    abbreviation: "IR",
    icon: "branch",
    description: "Visit review, follow-up requests, and linked history",
    tone: "violet"
  },
  quotesNavItem,
  {
    href: "/app/deficiencies",
    label: "Deficiency Center",
    shortLabel: "Deficiencies",
    abbreviation: "DC",
    icon: "alert",
    description: "Quotes, approvals, and open issues",
    tone: "amber"
  },
  {
    href: "/app/admin/upcoming-inspections",
    label: "Upcoming Inspections",
    shortLabel: "Upcoming",
    abbreviation: "UI",
    icon: "calendar",
    description: "Month-by-month planning and future inspection scheduling",
    tone: "blue"
  },
  {
    href: "/app/admin/parts-and-services",
    label: "Parts and Services",
    shortLabel: "Parts/Services",
    abbreviation: "PS",
    icon: "grid",
    description: "QuickBooks products, services, and invoice items",
    tone: "blue"
  },
  {
    href: "/app/manuals",
    label: "Manuals",
    shortLabel: "Manuals",
    abbreviation: "MN",
    icon: "book",
    description: "Field-ready manuals, favorites, and recent documentation",
    tone: "blue",
    matchMode: "exact",
    matchPrefixes: ["/app/manuals", "/app/admin/manuals"]
  },
  {
    href: "/app/admin/clients",
    label: "Clients",
    shortLabel: "Clients",
    abbreviation: "CL",
    icon: "team",
    description: "Customer records, billing profiles, and QuickBooks links",
    tone: "slate"
  },
  {
    href: "/app/admin/billing",
    label: "Billing Review",
    shortLabel: "Billing",
    abbreviation: "BR",
    icon: "invoice",
    description: "Review line items and invoicing",
    tone: "emerald"
  },
  {
    href: "/app/admin/contract-providers",
    label: "Contract Providers",
    shortLabel: "Providers",
    abbreviation: "CP",
    icon: "team",
    description: "Provider billing accounts, contracts, and site assignment visibility",
    tone: "emerald",
    matchMode: "exact",
    matchPrefixes: ["/app/admin/contract-providers"]
  },
  {
    href: "/app/admin/email-reminders",
    label: "Email Reminders",
    shortLabel: "Email Reminders",
    abbreviation: "ER",
    icon: "mail",
    description: "Prepare and send branded customer reminder emails",
    tone: "blue"
  },
  {
    href: "/app/admin/archive",
    label: "Inspection Archive",
    shortLabel: "Archive",
    abbreviation: "AR",
    icon: "clipboard",
    description: "Completed inspection history, reports, and documents",
    tone: "slate"
  },
  {
    href: "/app/admin/team",
    label: "Team and Portal Access",
    shortLabel: "Team",
    abbreviation: "TM",
    icon: "team",
    description: "Invites, access, and account controls",
    tone: "slate"
  },
  {
    href: "/app/admin/settings",
    label: "Settings / Service Fees",
    shortLabel: "Settings",
    abbreviation: "SF",
    icon: "settings",
    description: "Branding, billing, and service fee rules",
    tone: "slate"
  }
];

const navByRole: Record<string, AppNavItem[]> = {
  tenant_admin: adminNavItems,
  office_admin: adminNavItems,
  platform_admin: [
    {
      href: "/app/platform",
      label: "Platform Admin",
      shortLabel: "Platform",
      abbreviation: "PA",
      icon: "grid",
      description: "Cross-tenant controls and oversight",
      tone: "slate"
    },
    ...adminNavItems
  ],
  technician: [
    {
      href: "/app/tech",
      label: "Home",
      shortLabel: "Home",
      abbreviation: "HM",
      icon: "grid",
      description: "Today, upcoming work, and technician quick actions",
      tone: "blue",
      matchMode: "exact"
    },
    {
      href: "/app/tech/work",
      label: "Work",
      shortLabel: "Work",
      abbreviation: "WK",
      icon: "clipboard",
      description: "Assigned jobs, claimable work, and field execution",
      tone: "blue",
      matchMode: "exact",
      matchPrefixes: ["/app/tech/work"]
    },
    {
      href: "/app/tech/inspections",
      label: "Inspections",
      shortLabel: "Inspections",
      abbreviation: "IN",
      icon: "calendar",
      description: "Active inspections, drafts, and completion flow",
      tone: "violet",
      matchMode: "exact",
      matchPrefixes: ["/app/tech/inspections", "/app/tech/reports"]
    },
    {
      href: "/app/manuals",
      label: "Manuals",
      shortLabel: "Manuals",
      abbreviation: "MN",
      icon: "book",
      description: "Favorites, recent manuals, and field documentation",
      tone: "blue",
      matchMode: "exact",
      matchPrefixes: ["/app/manuals"]
    },
    {
      href: "/app/tech/profile",
      label: "Profile",
      shortLabel: "Profile",
      abbreviation: "PF",
      icon: "team",
      description: "Sync status, offline readiness, and technician account tools",
      tone: "slate",
      matchMode: "exact",
      matchPrefixes: ["/app/tech/profile"]
    }
  ],
  customer_user: [
    {
      href: "/app/customer",
      label: "Customer Portal",
      shortLabel: "Portal",
      abbreviation: "CP",
      icon: "portal",
      description: "Reports, documents, and history",
      tone: "emerald",
      matchMode: "exact",
      matchPrefixes: ["/app/customer/reports", "/app/customer/quotes"]
    }
  ]
};

export function getAppNavItemsForRole(role: string, allowances?: InternalAllowances) {
  let baseItems = navByRole[role] ?? [];

  if (role === "technician" && canAccessQuoteWorkspace(role, allowances)) {
    const profileItem = baseItems.find((item) => item.href === "/app/tech/profile");
    const itemsWithoutProfile = baseItems.filter((item) => item.href !== "/app/tech/profile");
    baseItems = profileItem ? [...itemsWithoutProfile, quotesNavItem, profileItem] : [...itemsWithoutProfile, quotesNavItem];
  }

  if (!canAccessQuoteWorkspace(role, allowances)) {
    return baseItems.filter((item) => item.href !== "/app/admin/quotes");
  }

  return baseItems;
}

export function isAppNavItemActive(pathname: string, item: AppNavItem) {
  const matchPrefixes = item.matchPrefixes ?? [];

  if (pathname === item.href) {
    return true;
  }

  if (matchPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }

  if (item.matchMode === "exact") {
    return false;
  }

  return pathname.startsWith(`${item.href}/`);
}

export function getCurrentAppNavItem(role: string, pathname: string, allowances?: InternalAllowances) {
  return getAppNavItemsForRole(role, allowances).find((item) => isAppNavItemActive(pathname, item)) ?? null;
}
