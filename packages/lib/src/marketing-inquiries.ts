import "server-only";
import { createHash } from "node:crypto";
import { Resend } from "resend";
import { z } from "zod";
import type { MarketingInquiryResult } from "./marketing-inquiries-shared";

const singleLine = (max: number) => z.string().trim().max(max).refine((value) => !/[\r\n]/.test(value), "Use a single line.");
const inquirySchema = z.object({
  requestId: z.string().uuid(),
  kind: z.enum(["trial", "demo"]),
  name: singleLine(100).refine(Boolean, "Enter your name."),
  company: singleLine(160).refine(Boolean, "Enter your company name."),
  email: z.string().trim().max(254).email("Enter a valid email address.").transform((value) => value.toLowerCase()),
  phone: singleLine(40).default(""),
  plan: z.enum(["not_sure", "starter", "pro", "enterprise"]),
  teamSize: z.enum(["not_sure", "1-5", "6-15", "16-50", "51+"]),
  availability: singleLine(200).default(""),
  message: z.string().trim().max(2000, "Please keep your message under 2,000 characters.").default(""),
  consent: z.literal(true, { errorMap: () => ({ message: "Please allow us to contact you about this request." }) }),
  website: z.string().max(0).default("")
}).strict();

// Bounded per-instance protection; deploy a WAF rate rule for distributed abuse protection.
export function createInquiryLimiter() {
  const entries = new Map<string, { count: number; expires: number }>();
  return (key: string, limit: number, now = Date.now()) => {
    for (const [entryKey, entry] of entries) if (entry.expires <= now) entries.delete(entryKey);
    const existing = entries.get(key);
    if (existing && existing.count >= limit) return false;
    if (!existing && entries.size >= 10000) return false;
    entries.set(key, { count: (existing?.count ?? 0) + 1, expires: existing?.expires ?? now + 60 * 60 * 1000 });
    return true;
  };
}

const allowInquiry = createInquiryLimiter();
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const deliveryError = "We couldn't send your request. Your details are still here. Please try again or email hello@tradeworx.net.";

export async function submitMarketingInquiry(raw: unknown, clientAddress: string): Promise<MarketingInquiryResult> {
  if (!allowInquiry(`ip:${digest(clientAddress)}`, 10)) {
    return { ok: false, rateLimited: true, error: "Too many requests. Please try again in an hour or email hello@tradeworx.net." };
  }
  const parsed = inquirySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please check your details and try again.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;
  if (!allowInquiry(`email:${digest(data.email)}`, 5) || !allowInquiry("total", 100)) {
    return { ok: false, rateLimited: true, error: "Too many requests. Please try again in an hour or email hello@tradeworx.net." };
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const to = process.env.MARKETING_INQUIRY_EMAIL?.trim() || "hello@tradeworx.net";
  if (!apiKey || !z.string().email().safeParse(from).success || !z.string().email().safeParse(to).success) {
    return { ok: false, error: deliveryError };
  }
  const label = data.kind === "trial" ? "Free trial request" : "Demo request";
  const email = {
    from: from!,
    to,
    replyTo: data.email,
    subject: `TradeWorx: ${label}`,
    text: [
      label,
      `Name: ${data.name}`,
      `Company: ${data.company}`,
      `Email: ${data.email}`,
      `Phone: ${data.phone || "Not provided"}`,
      `Interested plan: ${data.plan}`,
      `Team size: ${data.teamSize}`,
      `Availability / time zone: ${data.availability || "Not provided"}`,
      "",
      data.message || "No additional message.",
      "",
      "Visitor agreed to be contacted about this request.",
      `Request reference: ${data.requestId}`
    ].join("\n")
  };
  try {
    const result = await new Resend(apiKey).emails.send(email, {
      idempotencyKey: `marketing/${data.requestId}/${digest(JSON.stringify(email))}`
    });
    if (result.error || !result.data?.id) return { ok: false, error: deliveryError };
    return { ok: true };
  } catch {
    return { ok: false, error: deliveryError };
  }
}
