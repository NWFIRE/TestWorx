import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { prisma } from "@testworx/db";

// Only the deployment's trusted edge may supply an address. Other hosts share a
// conservative bucket until their proxy contract has been explicitly implemented.
export function signupClientKey(headers: { get(name: string): string | null }) {
  const address = process.env.VERCEL === "1" ? headers.get("x-vercel-forwarded-for")?.trim() : null;
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Signup protection is not configured.");
  return createHmac("sha256", secret).update(address && isIP(address) ? address : "unverified-edge").digest("hex");
}

export async function consumeSignupQuota(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs);
  const rows = await prisma.$queryRaw<Array<{ hits: number }>>`
    INSERT INTO "SignupRateLimit" ("key", "windowStart", "expiresAt", "hits")
    VALUES (${key}, ${windowStart}, ${expiresAt}, 1)
    ON CONFLICT ("key") DO UPDATE SET
      "hits" = CASE WHEN "SignupRateLimit"."windowStart" = EXCLUDED."windowStart"
        THEN LEAST("SignupRateLimit"."hits" + 1, ${limit + 1}) ELSE 1 END,
      "windowStart" = EXCLUDED."windowStart", "expiresAt" = EXCLUDED."expiresAt"
    RETURNING "hits"`;
  if (!rows[0] || rows[0].hits > limit) throw new Error("Too many requests. Please try again later.");
}

export async function enforceSignupRateLimit(headers: { get(name: string): string | null }, operation: "request" | "verify") {
  const client = signupClientKey(headers);
  // Fail closed if the shared store is unavailable; never fall back to a process-local counter.
  await consumeSignupQuota(`signup:${operation}:global`, operation === "request" ? 100 : 3000, 60 * 60 * 1000);
  await consumeSignupQuota(`signup:${operation}:${client}`, operation === "request" ? 10 : 30,
    operation === "request" ? 15 * 60 * 1000 : 60 * 1000);
  await prisma.$executeRaw`DELETE FROM "SignupRateLimit" WHERE "expiresAt" < NOW() - INTERVAL '1 day'`;
}
