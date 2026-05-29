import { canAccessProductsServicesWorkspace, canAccessQuoteWorkspace } from "@testworx/lib";

export type AppNavItem = {
  href: string;
  label: string;
  shortLabel: string;
  abbreviation: string;
  icon?: "calendar" | "branch" | "alert" | "invoice" | "settings" | "grid" | "clipboard" | "portal" | "team" | "mail" | "book";
  description?: string;
  tone?: "blue" | "amber" | "emerald" | "violet" | "slate";
  group?: "Dashboard" | "Work" | "Billing" | "Customers" | "Operations" | "Settings" | "Portal";
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
  group: "Billing",
  matchMode: "exact",
  matchPrefixes: ["/app/admin/quotes"]
};

const partsAndServicesNavItem: AppNavItem = {
  href: "/app/admin/parts-and-services",
  label: "Parts and Services",
  shortLabel: "Parts/Services",
  abbreviation: "PS",
  icon: "grid",
  description: "QuickBooks products, services, and invoice items",
  tone: "blue",
  group: "Operations"
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
    group: "Dashboard",
    matchMode: "exact",
    matchPrefixes: ["/app/admin/dashboard"]
  },
  {
    href: "/app/admin/inspections",
    label: "Inspections",
    shortLabel: "Inspections",
    abbreviation: "IN",
    icon: "clipboard",
    description: "Create, filter, and manage inspection work",
    tone: "blue",
    group: "Work",
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
    tone: "violet",
    group: "Work"
  },
  quotesNavItem,
  {
    href: "/app/deficiencies",
    label: "Deficiency Center",
    shortLabel: "Deficiencies",
    abbreviation: "DC",
    icon: "alert",
    description: "Quotes, approvals, and open issues",
    tone: "amber",
    group: "Work"
  },
  {
    href: "/app/admin/upcoming-inspections",
    label: "Upcoming Inspections",
    shortLabel: "Upcoming",
    abbreviation: "UI",
    icon: "calendar",
    description: "Month-by-month planning and future inspection scheduling",
    tone: "blue",
    group: "Work"
  },
  partsAndServicesNavItem,
  {
    href: "/app/manuals",
    label: "Manuals",
    shortLabel: "Manuals",
    abbreviation: "MN",
    icon: "book",
    description: "Field-ready manuals, favorites, and recent documentation",
    tone: "blue",
    group: "Operations",
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
    tone: "slate",
    group: "Customers"
  },
  {
    href: "/app/admin/billing",
    label: "Billing",
    shortLabel: "Billing",
    abbreviation: "BL",
    icon: "invoice",
    description: "Ready To Bill work and invoiced history",
    tone: "emerald",
    group: "Billing"
  },
  {
    href: "/app/admin/email-reminders",
    label: "Email Reminders",
    shortLabel: "Email Reminders",
    abbreviation: "ER",
    icon: "mail",
    description: "Prepare and send branded customer reminder emails",
    tone: "blue",
    group: "Customers"
  },
  {
    href: "/app/admin/archive",
    label: "Inspection Archive",
    shortLabel: "Archive",
    abbreviation: "AR",
    icon: "clipboard",
    description: "Completed inspection history, reports, and documents",
    tone: "slate",
    group: "Work"
  },
  {
    href: "/app/admin/team",
    label: "Team and Portal Access",
    shortLabel: "Team",
    abbreviation: "TM",
    icon: "team",
    description: "Invites, access, and account controls",
    tone: "slate",
    group: "Operations"
  },
  {
    href: "/app/admin/timesheets",
    label: "Timesheets",
    shortLabel: "Timesheets",
    abbreviation: "TS",
    icon: "calendar",
    description: "Clock entries, weekly totals, and admin corrections",
    tone: "blue",
    group: "Operations",
    matchMode: "exact",
    matchPrefixes: ["/app/admin/timesheets"]
  },
  {
    href: "/app/admin/settings",
    label: "Settings / Service Fees",
    shortLabel: "Settings",
    abbreviation: "SF",
    icon: "settings",
    description: "Branding, billing, and service fee rules",
    tone: "slate",
    group: "Settings"
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
      tone: "slate",
      group: "Settings"
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
      group: "Dashboard",
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
      group: "Work",
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
      group: "Work",
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
      group: "Operations",
      matchMode: "exact",
      matchPrefixes: ["/app/manuals"]
    },
    {
      href: "/app/tech/timesheets",
      label: "Timesheets",
      shortLabel: "Timesheets",
      abbreviation: "TS",
      icon: "calendar",
      description: "Clock in, clock out, and weekly time",
      tone: "blue",
      group: "Operations",
      matchMode: "exact",
      matchPrefixes: ["/app/tech/timesheets"]
    },
    {
      href: "/app/tech/profile",
      label: "Profile",
      shortLabel: "Profile",
      abbreviation: "PF",
      icon: "team",
      description: "Sync status, offline readiness, and technician account tools",
      tone: "slate",
      group: "Settings",
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
      group: "Portal",
      matchMode: "exact",
      matchPrefixes: ["/app/customer/reports", "/app/customer/quotes"]
    }
  ]
};

export const defaultAdminSidebarOrder = adminNavItems.map((item) => item.href);

function orderAppNavItems(items: AppNavItem[], sidebarOrder?: string[] | null) {
  if (!sidebarOrder?.length) {
    return items;
  }

  const orderRank = new Map<string, number>();
  for (const href of sidebarOrder) {
    if (!orderRank.has(href)) {
      orderRank.set(href, orderRank.size);
    }
  }

  return [...items].sort((first, second) => {
    const firstRank = orderRank.get(first.href);
    const secondRank = orderRank.get(second.href);

    if (firstRank === undefined && secondRank === undefined) {
      return items.indexOf(first) - items.indexOf(second);
    }

    if (firstRank === undefined) {
      return 1;
    }

    if (secondRank === undefined) {
      return -1;
    }

    return firstRank - secondRank;
  });
}

function applyAdminSidebarOrder(role: string, items: AppNavItem[], sidebarOrder?: string[] | null) {
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(role)) {
    return items;
  }

  if (role !== "platform_admin") {
    return orderAppNavItems(items, sidebarOrder);
  }

  const platformItems = items.filter((item) => item.href === "/app/platform");
  const adminItems = items.filter((item) => item.href !== "/app/platform");
  return [...platformItems, ...orderAppNavItems(adminItems, sidebarOrder)];
}

export function getAppNavItemsForRole(role: string, allowances?: InternalAllowances, sidebarOrder?: string[] | null) {
  let baseItems = navByRole[role] ?? [];

  if (role === "technician" && canAccessQuoteWorkspace(role, allowances)) {
    const profileItem = baseItems.find((item) => item.href === "/app/tech/profile");
    const itemsWithoutProfile = baseItems.filter((item) => item.href !== "/app/tech/profile");
    baseItems = profileItem ? [...itemsWithoutProfile, quotesNavItem, profileItem] : [...itemsWithoutProfile, quotesNavItem];
  }

  if (role === "technician" && canAccessProductsServicesWorkspace(role, allowances)) {
    const profileItem = baseItems.find((item) => item.href === "/app/tech/profile");
    const itemsWithoutProfile = baseItems.filter((item) => item.href !== "/app/tech/profile");
    baseItems = profileItem
      ? [...itemsWithoutProfile, partsAndServicesNavItem, profileItem]
      : [...itemsWithoutProfile, partsAndServicesNavItem];
  }

  if (!canAccessQuoteWorkspace(role, allowances) || !canAccessProductsServicesWorkspace(role, allowances)) {
    return applyAdminSidebarOrder(
      role,
      baseItems.filter((item) => {
        if (item.href === "/app/admin/quotes") {
          return canAccessQuoteWorkspace(role, allowances);
        }
        if (item.href === "/app/admin/parts-and-services") {
          return canAccessProductsServicesWorkspace(role, allowances);
        }
        return true;
      }),
      sidebarOrder
    );
  }

  return applyAdminSidebarOrder(role, baseItems, sidebarOrder);
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

export function getCurrentAppNavItem(role: string, pathname: string, allowances?: InternalAllowances, sidebarOrder?: string[] | null) {
  const matches = getAppNavItemsForRole(role, allowances, sidebarOrder).filter((item) => isAppNavItemActive(pathname, item));
  return matches.sort((first, second) => {
    const firstLength = Math.max(first.href.length, ...(first.matchPrefixes ?? []).map((prefix) => prefix.length));
    const secondLength = Math.max(second.href.length, ...(second.matchPrefixes ?? []).map((prefix) => prefix.length));
    return secondLength - firstLength;
  })[0] ?? null;
}
