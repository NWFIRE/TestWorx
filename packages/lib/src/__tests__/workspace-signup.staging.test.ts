import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@testworx/db";
import { requestWorkspaceSignup, verifyWorkspaceSignup } from "../workspace-signup";

const staging = process.env.APP_ENV === "staging" && process.env.EMAIL_DRIVER === "capture" &&
  process.env.DATABASE_URL === "postgresql://perf@127.0.0.1:55439/tradeworx_subscriber";

describe.skipIf(!staging)("workspace signup concurrency in staging", () => {
  const email = `signup-race-${randomUUID()}@example.test`;
  let tenantId: string | undefined;
  afterAll(async () => {
    if (tenantId) {
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
    }
    await prisma.workspaceSignup.deleteMany({ where: { email } });
    await prisma.capturedEmail.deleteMany({ where: { recipient: email } });
    await prisma.$disconnect();
  });
  it("issues one usable token and creates one empty workspace under concurrent requests", async () => {
    const input = { name: "Staging Owner", companyName: "Signup Race Company", email, password: "StagingPassword123!" };
    await Promise.all(Array.from({ length: 5 }, () => requestWorkspaceSignup(input)));
    const emails = await prisma.capturedEmail.findMany({ where: { recipient: email } });
    expect(emails).toHaveLength(1);
    const token = emails[0]!.html.match(/token=([a-f0-9]{64})/)?.[1];
    expect(token).toBeTruthy();
    const outcomes = await Promise.allSettled([verifyWorkspaceSignup(token!), verifyWorkspaceSignup(token!)]);
    const success = outcomes.filter((outcome) => outcome.status === "fulfilled");
    expect(success).toHaveLength(1);
    tenantId = (success[0] as PromiseFulfilledResult<string>).value;
    expect(await prisma.user.count({ where: { email, tenantId, role: "tenant_admin" } })).toBe(1);
    expect(await prisma.customerCompany.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.inspection.count({ where: { tenantId } })).toBe(0);
    await expect(verifyWorkspaceSignup(token!)).rejects.toThrow(/already used/);
    await requestWorkspaceSignup(input);
    expect(await prisma.capturedEmail.count({ where: { recipient: email } })).toBe(1);
  }, 30000);
});
