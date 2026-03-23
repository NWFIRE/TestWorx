import { compare, hash } from "bcryptjs";

export async function hashPassword(password: string) {
  return hash(password, 12);
}

export async function comparePassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

export function getDefaultDashboardPath(role: string) {
  switch (role) {
    case "platform_admin":
      return "/app/platform";
    case "technician":
      return "/app/tech";
    case "customer_user":
      return "/app/customer";
    case "tenant_admin":
    case "office_admin":
    default:
      return "/app/admin";
  }
}

