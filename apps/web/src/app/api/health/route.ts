import { NextResponse } from "next/server";

import { prisma } from "@testworx/db";
import { assertEnvForFeature, evaluatePilotReadiness, getOptionalQuickBooksEnv, getOptionalStripeEnv, getServerEnv } from "@testworx/lib";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const env = getServerEnv();
    assertEnvForFeature("database");

    await prisma.$queryRaw`SELECT 1`;

    const stripe = getOptionalStripeEnv();
    const quickbooks = getOptionalQuickBooksEnv();
    const pilotReadiness = evaluatePilotReadiness({
      stripeConfigured: Boolean(stripe.STRIPE_SECRET_KEY && stripe.STRIPE_PUBLISHABLE_KEY),
      stripeWebhookConfigured: Boolean(stripe.STRIPE_WEBHOOK_SECRET && stripe.STRIPE_SECRET_KEY && stripe.STRIPE_PUBLISHABLE_KEY),
      quickBooksConfigured: Boolean(quickbooks.QUICKBOOKS_CLIENT_ID && quickbooks.QUICKBOOKS_CLIENT_SECRET),
      quickBooksMode: quickbooks.QUICKBOOKS_CLIENT_ID && quickbooks.QUICKBOOKS_CLIENT_SECRET ? (quickbooks.QUICKBOOKS_SANDBOX ? "sandbox" : "live") : null
    });
    return NextResponse.json({
      ok: true,
      environment: {
        appUrl: env.APP_URL,
        nextAuthUrl: env.NEXTAUTH_URL,
        storageDriver: env.STORAGE_DRIVER,
        stripeConfigured: Boolean(stripe.STRIPE_SECRET_KEY && stripe.STRIPE_PUBLISHABLE_KEY),
        quickBooksConfigured: Boolean(quickbooks.QUICKBOOKS_CLIENT_ID && quickbooks.QUICKBOOKS_CLIENT_SECRET)
      },
      database: {
        connected: true
      },
      pilotReadiness
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Environment validation failed."
      },
      { status: 503 }
    );
  }
}
