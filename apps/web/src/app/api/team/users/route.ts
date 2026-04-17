import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { searchTeamWorkspaceUsers } from "@testworx/lib/server/index";

type SearchParams = URLSearchParams;

function readParam(params: SearchParams, key: string) {
  return params.get(key)?.trim() ?? "";
}

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const result = await searchTeamWorkspaceUsers(
      {
        userId: session.user.id,
        role: session.user.role,
        tenantId: session.user.tenantId
      },
      {
        kind: readParam(searchParams, "kind") === "customer" ? "customer" : "internal",
        query: readParam(searchParams, "q"),
        page: Number.parseInt(readParam(searchParams, "page") || "0", 10) || 0,
        limit: Number.parseInt(readParam(searchParams, "limit") || "8", 10) || 8,
        status: readParam(searchParams, "status") === "active"
          ? "active"
          : readParam(searchParams, "status") === "inactive"
            ? "inactive"
            : "all"
      }
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load users.";
    const status = message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

