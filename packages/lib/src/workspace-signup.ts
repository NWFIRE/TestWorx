import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@testworx/db";
import { z } from "zod";
import { hashPassword } from "./auth";
import { sendWithResend } from "./account-email";
import { subscriberFeaturesEnabled } from "./subscriber-policy";

const signupSchema = z.object({ name: z.string().trim().min(2).max(100), companyName: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(250).transform(value => value.toLowerCase()), password: z.string().min(12).max(100) });
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

function assertSignupEnabled() {
  if (!subscriberFeaturesEnabled() || process.env.SELF_SIGNUP_ENABLED !== "true") throw new Error("Self-service signup is not enabled.");
}

export async function requestWorkspaceSignup(raw: z.input<typeof signupSchema>) {
  assertSignupEnabled();
  const input = signupSchema.parse(raw);
  if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) return;
  const existing = await prisma.workspaceSignup.findUnique({ where: { email: input.email } });
  if (existing && existing.createdAt.getTime() > Date.now() - 60000) return;
  const token = randomBytes(32).toString("hex");
  const passwordHash = await hashPassword(input.password);
  const data = { email: input.email, name: input.name, companyName: input.companyName, passwordHash,
    tokenHash: digest(token), expiresAt: new Date(Date.now() + 86400000), usedAt: null, createdAt: new Date() };
  const accepted = await prisma.$transaction(async tx => {
    // Coordinate requests across server instances, not just within one process.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('workspace-signup'), hashtext(${input.email}))`;
    if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) return false;
    const latest = await tx.workspaceSignup.findUnique({ where: { email: input.email } });
    if (latest && latest.createdAt.getTime() > Date.now() - 60000) return false;
    await tx.workspaceSignup.upsert({ where: { email: input.email }, create: data, update: data });
    return true;
  });
  if (!accepted) return;
  const url = new URL(`/signup/verify?token=${token}`, process.env.APP_URL).href;
  const delivery = await sendWithResend({ to: input.email, from: process.env.RESEND_FROM_EMAIL,
    subject: "Verify your TradeWorx workspace", html: `<p>Confirm your email to create your private workspace.</p><p><a href="${url}">Verify email and continue</a></p><p>This link expires in 24 hours. No payment is taken by confirming.</p>` });
  if (!delivery.sent) throw new Error("Verification email is unavailable. Contact support.");
}

export async function verifyWorkspaceSignup(token: string) {
  assertSignupEnabled();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid verification link.");
  return prisma.$transaction(async tx => {
    const identity = await tx.workspaceSignup.findUnique({ where: { tokenHash: digest(token) }, select: { email: true } });
    if (!identity) throw new Error("This link has expired or was already used. Sign in or request a new link.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('workspace-signup'), hashtext(${identity.email}))`;
    const signup = await tx.workspaceSignup.findUnique({ where: { tokenHash: digest(token) } });
    if (!signup || signup.usedAt || signup.expiresAt <= new Date()) throw new Error("This link has expired or was already used. Sign in or request a new link.");
    const claimed = await tx.workspaceSignup.updateMany({ where: { id: signup.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw new Error("This link was already used.");
    const tenant = await tx.tenant.create({ data: { name: signup.companyName, slug: `company-${randomBytes(12).toString("hex")}`,
      billingEmail: signup.email, subscriptionManaged: true, users: { create: { name: signup.name, email: signup.email,
        passwordHash: signup.passwordHash, role: "tenant_admin" } } } });
    await tx.auditLog.create({ data: { tenantId: tenant.id, action: "workspace.signup_verified", entityType: "Tenant", entityId: tenant.id, metadata: {} } });
    return tenant.id;
  });
}
