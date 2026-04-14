import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: string;
      tenantId: string | null;
      allowances?: Record<string, boolean> | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    tenantId?: string | null;
    allowances?: Record<string, boolean> | null;
  }
}

