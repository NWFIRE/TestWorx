import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { prisma } from "@testworx/db";
import { assertEnvForFeature, comparePassword } from "@testworx/lib";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const { handlers, signIn, signOut, auth } = NextAuth({
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
            where: { email: parsed.data.email.toLowerCase() }
          });

          if (!user || !user.isActive) {
            return null;
          }

          const matches = await comparePassword(parsed.data.password, user.passwordHash);
          if (!matches) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            tenantId: user.tenantId
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
        const authUser = user as typeof user & { role: string; tenantId: string | null };
        token.role = authUser.role;
        token.tenantId = authUser.tenantId;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = String(token.role ?? "");
        session.user.tenantId = (token.tenantId as string | null) ?? null;
      }
      return session;
    }
  }
});

