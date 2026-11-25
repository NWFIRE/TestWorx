import { auth } from "@/auth";
import { prisma } from "@testworx/db";
import { getSupportTicket } from "@testworx/lib/src/subscriber-support";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Not authorized", { status: 401 });
  try {
    const ticket = await getSupportTicket(session.user.id, (await params).id);
    if (!ticket) return new Response("Not found", { status: 404 });
    const screenshot = await prisma.supportScreenshot.findUnique({ where: { ticketId: ticket.id } });
    if (!screenshot) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(screenshot.bytes), { headers: { "Content-Type": screenshot.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline; filename=screenshot" } });
  } catch { return new Response("Not found", { status: 404 }); }
}
