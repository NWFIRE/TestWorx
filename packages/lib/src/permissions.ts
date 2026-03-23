export const roleMatrix = {
  platform_admin: ["platform"],
  tenant_admin: ["admin"],
  office_admin: ["admin"],
  technician: ["tech"],
  customer_user: ["customer"]
} as const;

export function canAccessSurface(role: string, surface: string) {
  if (role === "platform_admin") {
    return ["platform", "admin", "tech", "customer"].includes(surface);
  }

  return role in roleMatrix && roleMatrix[role as keyof typeof roleMatrix].includes(surface as never);
}

export function assertTenantContext(role: string, tenantId: string | null) {
  if (role !== "platform_admin" && !tenantId) {
    throw new Error("Tenant context is required for non-platform users.");
  }
}

