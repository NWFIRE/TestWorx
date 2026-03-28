export type AppNavItem = {
  href: string;
  label: string;
  shortLabel: string;
  abbreviation: string;
  matchMode?: "exact" | "prefix";
  matchPrefixes?: string[];
};

const adminNavItems: AppNavItem[] = [
  {
    href: "/app/admin",
    label: "Scheduling / Dispatch",
    shortLabel: "Scheduling",
    abbreviation: "SD",
    matchMode: "exact",
    matchPrefixes: ["/app/admin/inspections", "/app/admin/reports"]
  },
  {
    href: "/app/admin/amendments",
    label: "Amendment Center",
    shortLabel: "Amendments",
    abbreviation: "AC"
  },
  {
    href: "/app/deficiencies",
    label: "Deficiency Center",
    shortLabel: "Deficiencies",
    abbreviation: "DC"
  },
  {
    href: "/app/admin/billing",
    label: "Billing Review",
    shortLabel: "Billing",
    abbreviation: "BR"
  },
  {
    href: "/app/admin/settings",
    label: "Settings / Service Fees",
    shortLabel: "Settings",
    abbreviation: "SF"
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
      abbreviation: "PA"
    },
    ...adminNavItems
  ],
  technician: [
    {
      href: "/app/tech",
      label: "Field Schedule",
      shortLabel: "Schedule",
      abbreviation: "FS",
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
      matchMode: "exact",
      matchPrefixes: ["/app/customer/reports"]
    }
  ]
};

export function getAppNavItemsForRole(role: string) {
  return navByRole[role] ?? [];
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

export function getCurrentAppNavItem(role: string, pathname: string) {
  return getAppNavItemsForRole(role).find((item) => isAppNavItemActive(pathname, item)) ?? null;
}
