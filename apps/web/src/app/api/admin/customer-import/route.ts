import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { importCustomerSiteCsv } from "@testworx/lib/server/index";

export const runtime = "nodejs";

function isAdminRole(role: string | undefined) {
  return role === "platform_admin" || role === "tenant_admin" || role === "office_admin";
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("csvFile");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Select a CSV file to import." }, { status: 400 });
    }

    const summary = await importCustomerSiteCsv(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      await file.text()
    );

    return NextResponse.json({
      success: `Imported ${summary.rowCount} row(s): ${summary.customersCreated} customer(s) created, ${summary.customersUpdated} customer(s) updated, ${summary.sitesCreated} site(s) created, ${summary.sitesUpdated} site(s) updated, ${summary.assetsCreated} asset(s) created, ${summary.assetsUpdated} asset(s) updated.${summary.quickBooksCustomersSynced > 0 ? ` Synced ${summary.quickBooksCustomersSynced} customer${summary.quickBooksCustomersSynced === 1 ? "" : "s"} to QuickBooks.` : ""}${summary.quickBooksCustomerSyncFailures > 0 ? ` ${summary.quickBooksCustomerSyncFailures} customer QuickBooks sync${summary.quickBooksCustomerSyncFailures === 1 ? "" : "s"} failed and can be retried from Clients.` : ""}`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to import CSV." },
      { status: 400 }
    );
  }
}
