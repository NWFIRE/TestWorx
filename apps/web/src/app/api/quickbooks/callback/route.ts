import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { completeQuickBooksConnection } from "@testworx/lib";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("tradeworx_qbo_state")?.value ?? cookieStore.get("testworx_qbo_state")?.value;
  cookieStore.delete("tradeworx_qbo_state");
  cookieStore.delete("testworx_qbo_state");

  if (error || !code || !realmId || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/app/admin/settings?quickbooks=error", request.url));
  }

  try {
    await completeQuickBooksConnection(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      { code, realmId }
    );
    return NextResponse.redirect(new URL("/app/admin/settings?quickbooks=connected", request.url));
  } catch {
    return NextResponse.redirect(new URL("/app/admin/settings?quickbooks=error", request.url));
  }
}
