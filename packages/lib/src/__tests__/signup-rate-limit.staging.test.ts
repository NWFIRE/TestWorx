import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@testworx/db";
import { consumeSignupQuota } from "../signup-rate-limit";
const staging = process.env.APP_ENV === "staging" && process.env.DATABASE_URL === "postgresql://perf@127.0.0.1:55439/tradeworx_subscriber";
describe.skipIf(!staging)("shared signup quotas", () => {
  const key = `test:${randomUUID()}`;
  afterAll(async () => { await prisma.$executeRaw`DELETE FROM "SignupRateLimit" WHERE "key" = ${key}`; await prisma.$disconnect(); });
  it("admits exactly the quota under concurrent attempts and resets expired windows", async () => {
    const results = await Promise.allSettled(Array.from({ length: 15 }, () => consumeSignupQuota(key, 5, 3600000)));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(5);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(10);
    await prisma.$executeRaw`UPDATE "SignupRateLimit" SET "windowStart" = '2000-01-01' WHERE "key" = ${key}`;
    await expect(consumeSignupQuota(key, 5, 3600000)).resolves.toBeUndefined();
  });
});
