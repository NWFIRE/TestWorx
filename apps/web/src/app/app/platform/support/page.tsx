import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { listSupportTickets, listDeliveryDiagnostics, requireSupportOperator } from "@testworx/lib/src/subscriber-support";
import { subscriberFeaturesEnabled, supportTicketNumber } from "@testworx/lib/src/subscriber-policy";
import { PageHeader } from "../../admin/operations-ui";

export default async function PlatformSupport({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  if (!subscriberFeaturesEnabled()) notFound();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  try { await requireSupportOperator(session.user.id); } catch { notFound(); }
  const q = (await searchParams).q ?? "";
  const tickets = await listSupportTickets(session.user.id, q);
  const deliveries = await listDeliveryDiagnostics(session.user.id, q);
  return <section className="mx-auto max-w-6xl space-y-5"><PageHeader eyebrow="Private operator workspace" title="Platform Support" />
    <form className="flex flex-wrap gap-3"><input name="q" defaultValue={q} aria-label="Company or ticket number" placeholder="Company, ticket, report or delivery reference" className="min-w-0 flex-1 rounded-xl border p-3" /><button className="rounded-xl bg-blue-700 px-5 py-3 text-white">Search</button><Link href="/app/platform/support" className="p-3 text-blue-700">Clear</Link></form>
    <section className="rounded-2xl border bg-white p-5" aria-label="Delivery diagnostics"><h2 className="font-semibold">Report delivery operations</h2>
      {deliveries.map(delivery => <article key={delivery.id} className="space-y-2 border-b py-4 text-sm break-words">
        <strong>{delivery.tenant.name}</strong><p>Reference: {delivery.id} · Report: {delivery.reportId}</p>
        <p>{delivery.status === "failed" ? "Confirmed failure before delivery" : "Delivery outcome unknown: operator review required"}</p>
        <p>Last confirmed result: {delivery.attachmentId ? "Issued PDF selected; retained unchanged." : "Issued attachment unavailable."} {delivery.attemptedAt ? `Attempt started ${delivery.attemptedAt.toISOString()}.` : "No attempt recorded."}</p>
        {delivery.providerMessageId ? <p>Provider reference: {delivery.providerMessageId}</p> : null}
        <p>{delivery.status === "failed" ? "Resolve the configuration or file issue, then retry through a report-linked support request." : "Check the provider and audit history before any retry. No resend is offered for an uncertain outcome."}</p>
        <p className="text-slate-600">Diagnostic: {delivery.failureCode ?? "interrupted_attempt"}</p>
      </article>)}
      {!deliveries.length ? <p className="mt-3 text-sm text-slate-600">No matching failed or uncertain tracked deliveries.</p> : null}
    </section>
    <div className="rounded-2xl border bg-white p-5">{tickets.map(ticket => <Link key={ticket.id} href={`/app/help/${ticket.id}`} className="flex flex-wrap items-center justify-between gap-3 border-b py-4 hover:bg-blue-50"><span><span className="text-xs text-slate-500">{supportTicketNumber(ticket.number)} · {ticket.tenant.name}</span><strong className="block">{ticket.title}</strong></span><span className={ticket.blocked && ticket.status !== "resolved" ? "text-amber-800" : "text-slate-500"}>{ticket.blocked && ticket.status !== "resolved" ? "Work blocked · " : ""}{ticket.status}</span></Link>)}{!tickets.length ? <p>No matching requests.</p> : null}</div>
    {process.env.EMAIL_DRIVER === "capture" && process.env.APP_ENV === "staging" ? <Link href="/app/platform/support/mail" className="inline-block p-3 text-blue-700">Staging email inbox</Link> : null}
  </section>;
}
