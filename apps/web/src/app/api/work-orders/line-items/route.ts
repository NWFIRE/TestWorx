import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { deleteWorkOrderLineItem, upsertWorkOrderLineItem } from "@testworx/lib/server/index";

function getStatusCode(error: unknown) {
  if (!(error instanceof Error)) {
    return 500;
  }

  if (/unauthorized/i.test(error.message)) {
    return 401;
  }

  if (/does not have access|already been invoiced/i.test(error.message)) {
    return 403;
  }

  if (/not found|select an active|required/i.test(error.message)) {
    return 422;
  }

  return 400;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const action = typeof body?.action === "string" ? body.action : "upsert";
    if (action === "delete") {
      await deleteWorkOrderLineItem(
        { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
        {
          inspectionId: String(body.inspectionId ?? ""),
          lineItemId: String(body.lineItemId ?? body.id ?? "")
        }
      );
      return NextResponse.json({ ok: true });
    }

    const lineItem = await upsertWorkOrderLineItem(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      {
        id: typeof body.id === "string" ? body.id : null,
        inspectionId: String(body.inspectionId ?? ""),
        catalogItemId: String(body.catalogItemId ?? ""),
        quantity: Number(body.quantity ?? 1),
        unitPrice: body.unitPrice === null || body.unitPrice === undefined || body.unitPrice === ""
          ? null
          : Number(body.unitPrice),
        billableStatus: typeof body.billableStatus === "string" ? body.billableStatus : "billable",
        technicianNotes: typeof body.technicianNotes === "string" ? body.technicianNotes : null
      }
    );

    return NextResponse.json({ ok: true, lineItem });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update work order line item." }, { status: getStatusCode(error) });
  }
}
