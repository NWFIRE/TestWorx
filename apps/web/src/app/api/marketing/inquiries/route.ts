import { NextResponse } from "next/server";
import { submitMarketingInquiry } from "@testworx/lib/marketing-inquiries";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ ok: false, error: "Please submit this request from the TradeWorx website." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ ok: false, error: "Unsupported request format." }, { status: 415 });
  }
  if (Number(request.headers.get("content-length")) > 16000) {
    return NextResponse.json({ ok: false, error: "Please shorten your message." }, { status: 413 });
  }
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > 16000) return NextResponse.json({ ok: false, error: "Please shorten your message." }, { status: 413 });
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "Please check your details and try again." }, { status: 400 });
  }
  const address = (request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "unknown").split(",")[0]?.trim() || "unknown";
  const result = await submitMarketingInquiry(raw, address);
  return NextResponse.json(result, { status: result.ok ? 200 : result.rateLimited ? 429 : result.fieldErrors ? 400 : 503, headers: { "Cache-Control": "no-store", ...(result.rateLimited ? { "Retry-After": "3600" } : {}) } });
}
