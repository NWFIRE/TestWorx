import { NextResponse } from "next/server";

import { handleStripeWebhook } from "@testworx/lib/server/index";

export const dynamic = "force-dynamic";

function getStatusCode(error: unknown) {
  if (!(error instanceof Error)) {
    return 500;
  }

  if (/signature|webhook/i.test(error.message)) {
    return 400;
  }

  if (/not configured/i.test(error.message)) {
    return 503;
  }

  return 500;
}

export async function POST(request: Request) {
  try {
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
    }

    const rawBody = await request.text();
    const result = await handleStripeWebhook({ rawBody, signature });
    return NextResponse.json({ ok: true, duplicate: result.duplicate, ignored: result.ignored ?? false, type: result.type });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to process Stripe webhook." }, { status: getStatusCode(error) });
  }
}

