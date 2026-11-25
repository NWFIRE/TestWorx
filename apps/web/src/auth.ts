import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { subscriberFeaturesEnabled, subscriptionAccess } from "@testworx/lib/src/subscriber-policy";

import { prisma } from "@testworx/db";
import { assertEnvForFeature, comparePassword } from "@testworx/lib/server/index";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const nextAuth = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      authorize: async (rawCredentials) => {
        assertEnvForFeature("auth");
        assertEnvForFeature("database");

        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          return null;
        }
        try {
          const user = await prisma.user.findUnique({
            where: { email: parsed.data.email.toLowerCase() },
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              tenantId: true,
              isActive: true,
              passwordHash: true,
              allowances: true
            }
          });

          if (!user || !user.isActive) {
            return null;
          }

          const matches = await comparePassword(parsed.data.password, user.passwordHash);
          if (!matches) {
            return null;
          }

          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() }
          });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            tenantId: user.tenantId,
            allowances:
              user.allowances && typeof user.allowances === "object" && !Array.isArray(user.allowances)
                ? (user.allowances as Record<string, boolean>)
                : null
          };
        } catch (error) {
          console.error("Credentials authorize failed", error);
          return null;
        }
      }
    })
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        const authUser = user as typeof user & {
          role: string;
          tenantId: string | null;
          allowances?: Record<string, boolean> | null;
        };
        token.role = authUser.role;
        token.tenantId = authUser.tenantId;
        token.allowances = authUser.allowances ?? null;
      } else if (token.sub) {
        const currentUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: {
            name: true,
            isActive: true,
            role: true,
            tenantId: true,
            allowances: true
          }
        });

        if (!currentUser?.isActive) return null;

        if (currentUser) {
          token.name = currentUser.name;
          token.role = currentUser.role;
          token.tenantId = currentUser.tenantId;
          token.allowances =
            currentUser.allowances && typeof currentUser.allowances === "object" && !Array.isArray(currentUser.allowances)
              ? (currentUser.allowances as Record<string, boolean>)
              : null;
        }
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = String(token.role ?? "");
        session.user.tenantId = (token.tenantId as string | null) ?? null;
        session.user.allowances =
          token.allowances && typeof token.allowances === "object" && !Array.isArray(token.allowances)
            ? (token.allowances as Record<string, boolean>)
            : null;
      }
      return session;
    }
  }
});

export const { handlers, signIn, signOut } = nextAuth;

export async function auth(options: { subscriptionRecovery?: boolean } = {}) {
  const session = await nextAuth.auth();
  if (!session?.user?.tenantId || !subscriberFeaturesEnabled() || session.user.role === "platform_admin") return session;
  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: {
    subscriptionManaged: true, stripeSubscriptionStatus: true, stripeCurrentPeriodEndsAt: true, paymentFailedAt: true
  } });
  if (!tenant) return null;
  if (subscriptionAccess(tenant)) return session;
  const requestHeaders = await headers();
  const path = requestHeaders.get("x-tradeworx-request-path") ?? "";
  // Server actions can be posted to a different page. Recovery is an explicit server-only capability.
  if (requestHeaders.has("next-action") && !options.subscriptionRecovery) return null;
  const allowed = ["/app/help", "/api/support", "/app/admin/settings/subscription", "/app/subscription-required", "/api/auth"];
  if (allowed.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) return session;
  if (path.startsWith("/api/")) return null;
  if (path.startsWith("/app")) redirect(session.user.role === "tenant_admin" ? "/app/admin/settings/subscription" : "/app/subscription-required");
  return session;
}


