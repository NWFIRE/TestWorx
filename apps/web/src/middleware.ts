import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  // Overwrite, rather than trust, a client-supplied bypass header.
  headers.set("x-tradeworx-request-path", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/app/:path*", "/api/:path*"] };
