import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { auth } from "@/auth";

export const runtime = "nodejs";

function sanitizePathSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
}

function isAdminRole(role: string | undefined) {
  return role === "platform_admin" || role === "tenant_admin" || role === "office_admin";
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantPrefix = sanitizePathSegment(session.user.tenantId);

  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`${tenantPrefix}/manual/`)) {
          throw new Error("Upload path is invalid for this tenant.");
        }

        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 50 * 1024 * 1024,
          addRandomSuffix: false
        };
      },
      onUploadCompleted: async () => {}
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to prepare manual upload." },
      { status: 400 }
    );
  }
}
