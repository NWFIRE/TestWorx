import { NextResponse } from "next/server";

import { runQuoteReminderSweep } from "@testworx/lib/server/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const authorization = request.headers.get("authorization")?.trim();
  return authorization === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const limitParam = new URL(request.url).searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    const result = await runQuoteReminderSweep({
      limit: Number.isFinite(limit) ? limit : undefined
    });

    return NextResponse.json({
      ok: true,
      processed: result.processed,
      sentCount: result.sentCount,
      skippedCount: result.skippedCount,
      ranAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to run quote reminders." },
      { status: 500 }
    );
  }
}

