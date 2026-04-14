export type AppNavItem = {
  href: string;
  label: string;
  shortLabel: string;
  abbreviation: string;
  icon?: "calendar" | "branch" | "alert" | "invoice" | "settings" | "grid" | "clipboard" | "portal" | "team" | "mail";
  description?: string;
  tone?: "blue" | "amber" | "emerald" | "violet" | "slate";
  matchMode?: "exact" | "prefix";
  matchPrefixes?: string[];
};

type InternalAllowances = Record<string, boolean> | null | undefined;

function hasQuoteAccessForRole(role: string, allowances?: InternalAllowances) {
  if (role === "platform_admin" || role === "tenant_admin") {
    return true;
  }

  if (role === "office_admin") {
    return allowances?.quoteAccess ?? true;
  }

  return allowances?.quoteAccess ?? false;
}

const adminNavItems: AppNavItem[] = [
  {
    href: "/app/admin",
    label: "Scheduling / Dispatch",
    shortLabel: "Scheduling",
    abbreviation: "SD",
    icon: "calendar",
    description: "Visits, assignment, and active queue",
    tone: "blue",
    matchMode: "exact",
    matchPrefixes: ["/app/admin/scheduling", "/app/admin/inspections", "/app/admin/reports"]
  },
  {
    href: "/app/admin/amendments",
    label: "Inspection Review",
    shortLabel: "Review",
    abbreviation: "IR",
    icon: "branch",
    description: "Inspection review and next-step requests",
    tone: "violet"
  },
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
    href: "/app/admin/clients",
    label: "Clients",
    shortLabel: "Clients",
    abbreviation: "CL",
    icon: "team",
    description: "Customer records, billing profiles, and QuickBooks links",
    tone: "slate"
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
    href: "/app/admin/upcoming-inspections",
    label: "Upcoming Inspections",
    shortLabel: "Upcoming",
    abbreviation: "UI",
    icon: "calendar",
    description: "Month-by-month planning and future inspection scheduling",
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
    href: "/app/admin/quotes",
    label: "Quotes",
    shortLabel: "Quotes",
    abbreviation: "QT",
    icon: "invoice",
    description: "Create, send, approve, and sync quotes",
    tone: "blue"
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
    href: "/app/admin/parts-and-services",
    label: "Parts and Services",
    shortLabel: "Catalog",
    abbreviation: "PS",
    icon: "grid",
    description: "QuickBooks products, services, and invoice items",
    tone: "blue"
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
      label: "Field Schedule",
      shortLabel: "Schedule",
      abbreviation: "FS",
      icon: "clipboard",
      description: "Assigned work, reports, and documents",
      tone: "blue",
      matchMode: "exact",
      matchPrefixes: ["/app/tech/inspections", "/app/tech/reports"]
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
  const baseItems = navByRole[role] ?? [];

  if (role === "technician" && hasQuoteAccessForRole(role, allowances)) {
    return [
      ...baseItems,
      adminNavItems.find((item) => item.href === "/app/admin/quotes")
    ].filter(Boolean) as AppNavItem[];
  }

  if (!hasQuoteAccessForRole(role, allowances)) {
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
