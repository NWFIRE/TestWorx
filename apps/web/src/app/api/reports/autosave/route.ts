import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isPrivateBlobStoreConfigurationError, saveReportDraft } from "@testworx/lib/server/index";

function getStatusCode(error: unknown) {
  if (!(error instanceof Error)) {
    return 500;
  }

  if (/unauthorized/i.test(error.message)) {
    return 401;
  }

  if (/does not have access|locked|cannot edit|cannot be edited/i.test(error.message)) {
    return 403;
  }

  if (/not found|match this inspection task|required|must be|supported|smaller|only image|only pdf/i.test(error.message)) {
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
    const saved = await saveReportDraft(
      {
        userId: session.user.id,
        role: session.user.role,
        tenantId: session.user.tenantId
      },
      body
    );

    return NextResponse.json({ ok: true, autosaveVersion: saved.autosaveVersion, updatedAt: saved.updatedAt.toISOString() });
  } catch (error) {
    if (isPrivateBlobStoreConfigurationError(error)) {
      console.error("Blob storage configuration error during report autosave", error);
      return NextResponse.json(
        { error: "Report media storage is unavailable right now. Your changes were not saved. Please contact your administrator." },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save draft." }, { status: getStatusCode(error) });
  }
}

