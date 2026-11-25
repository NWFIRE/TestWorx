import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { listSupportTickets, requireSupportOperator } from "@testworx/lib/src/subscriber-support";
import { subscriberFeaturesEnabled, supportTicketNumber } from "@testworx/lib/src/subscriber-policy";
import { PageHeader } from "../../admin/operations-ui";

export default async function PlatformSupport({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  if (!subscriberFeaturesEnabled()) notFound();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  try { await requireSupportOperator(session.user.id); } catch { notFound(); }
  const q = (await searchParams).q ?? "";
  const tickets = await listSupportTickets(session.user.id, q);
  return <section className="mx-auto max-w-6xl space-y-5"><PageHeader eyebrow="Private operator workspace" title="Platform Support" />
    <form className="flex flex-wrap gap-3"><input name="q" defaultValue={q} aria-label="Company or ticket number" placeholder="Company or SUP-000001" className="min-w-0 flex-1 rounded-xl border p-3" /><button className="rounded-xl bg-blue-700 px-5 py-3 text-white">Search</button><Link href="/app/platform/support" className="p-3 text-blue-700">Clear</Link></form>
    <div className="rounded-2xl border bg-white p-5">{tickets.map(ticket => <Link key={ticket.id} href={`/app/help/${ticket.id}`} className="flex flex-wrap items-center justify-between gap-3 border-b py-4 hover:bg-blue-50"><span><span className="text-xs text-slate-500">{supportTicketNumber(ticket.number)} · {ticket.tenant.name}</span><strong className="block">{ticket.title}</strong></span><span className={ticket.blocked && ticket.status !== "resolved" ? "text-amber-800" : "text-slate-500"}>{ticket.blocked && ticket.status !== "resolved" ? "Work blocked · " : ""}{ticket.status}</span></Link>)}{!tickets.length ? <p>No matching requests.</p> : null}</div>
    {process.env.EMAIL_DRIVER === "capture" && process.env.APP_ENV === "staging" ? <Link href="/app/platform/support/mail" className="inline-block p-3 text-blue-700">Staging email inbox</Link> : null}
  </section>;
}
