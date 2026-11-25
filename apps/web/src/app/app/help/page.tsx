import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { listSupportTickets } from "@testworx/lib/src/subscriber-support";
import { subscriberFeaturesEnabled, supportTicketNumber } from "@testworx/lib/src/subscriber-policy";
import { PageHeader } from "../admin/operations-ui";

export default async function HelpPage() {
  if (!subscriberFeaturesEnabled()) notFound();
  const session = await auth({ subscriptionRecovery: true });
  if (!session?.user?.id) redirect("/login");
  if (session.user.role === "platform_admin") redirect("/app/platform/support");
  const tickets = await listSupportTickets(session.user.id);
  return <section className="mx-auto max-w-5xl space-y-5">
    <PageHeader eyebrow="Help" title="My requests" />
    <Link href="/app/help/new" className="inline-flex min-h-11 items-center rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white">Report a problem</Link>
    {["tenant_admin", "office_admin"].includes(session.user.role) ? <Link href="/app/help/delivery" className="ml-4 inline-flex min-h-11 items-center text-blue-700">Customer report delivery</Link> : null}
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      {!tickets.length ? <p className="text-slate-500">No support requests yet.</p> : tickets.map(ticket => <Link key={ticket.id} href={`/app/help/${ticket.id}`} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-4 hover:bg-blue-50 focus-visible:outline focus-visible:outline-blue-700"><span><span className="text-xs text-slate-500">{supportTicketNumber(ticket.number)}</span><span className="block font-medium">{ticket.title}</span></span><span className="text-sm">{ticket.blocked && ticket.status !== "resolved" ? "Work blocked · " : ""}{ticket.status}</span></Link>)}
    </div>
  </section>;
}
