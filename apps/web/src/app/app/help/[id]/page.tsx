import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@testworx/db";
import { getSupportTicket } from "@testworx/lib/src/subscriber-support";
import { subscriberFeaturesEnabled, supportTicketNumber } from "@testworx/lib/src/subscriber-policy";
import { PageHeader } from "../../admin/operations-ui";
import { ReplyForm, RetryDeliveryForm } from "../forms";

export default async function SupportDetail({ params }: { params: Promise<{ id: string }> }) {
  if (!subscriberFeaturesEnabled()) notFound();
  const session = await auth({ subscriptionRecovery: true });
  if (!session?.user?.id) redirect("/login");
  const ticket = await getSupportTicket(session.user.id, (await params).id);
  if (!ticket) notFound();
  const operator = session.user.role === "platform_admin";
  const deliveries = operator && ticket.reportId ? await prisma.reportDelivery.findMany({ where: { tenantId: ticket.tenantId, reportId: ticket.reportId }, select: { id: true, status: true, failureCode: true, sentAt: true }, take: 20 }) : [];
  const issuedPdf = operator && ticket.reportId ? await prisma.attachment.findFirst({ where: { tenantId: ticket.tenantId, inspectionReportId: ticket.reportId, kind: "pdf", source: "generated" }, select: { id: true } }) : null;
  const auditEvents = operator && ticket.reportId ? await prisma.auditLog.findMany({ where: { tenantId: ticket.tenantId, entityId: { in: [ticket.reportId, ...deliveries.map(delivery => delivery.id)] } }, select: { id: true, action: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 12 }) : [];
  const failedBillingEvents = operator ? await prisma.stripeWebhookEvent.findMany({ where: { tenantId: ticket.tenantId, status: "failed" }, select: { id: true, type: true, stripeEventId: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 5 }) : [];
  const operators = operator ? await prisma.user.findMany({ where: { role: "platform_admin", isActive: true }, select: { id: true, name: true } }) : [];
  return <section className="mx-auto max-w-4xl space-y-5">
    <PageHeader eyebrow={supportTicketNumber(ticket.number)} title={ticket.title} />
    <Link href={operator ? "/app/platform/support" : "/app/help"} className="inline-block py-2 text-blue-700">Back to requests</Link>
    <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
      <div className="flex flex-wrap gap-3 text-sm"><strong>{ticket.status}</strong>{ticket.blocked ? <span className="text-amber-800">Work blocked</span> : null}<span>{ticket.tenant.name}</span><time>{ticket.createdAt.toLocaleString("en-US", { timeZone: "UTC" })} UTC</time></div>
      <p className="whitespace-pre-wrap break-words">{ticket.description}</p>
      {ticket.screenshot ? <a className="inline-block text-blue-700 underline" href={`/api/support/${ticket.id}/screenshot`} target="_blank" rel="noreferrer">View screenshot</a> : null}
      {operator ? <dl className="grid gap-2 rounded-xl bg-slate-50 p-4 text-xs sm:grid-cols-2"><div>Page: {ticket.pagePath}</div><div>Role: {ticket.requesterRole}</div><div>Version: {ticket.appVersion}</div><div>Error: {ticket.errorReference ?? "None supplied"}</div><div>Report: {ticket.reportId ?? "None supplied"}</div></dl> : null}
      {operator && ticket.reportId ? <section className="space-y-4 rounded-xl border p-4"><h2 className="font-semibold">Report delivery</h2><p>Issued PDF: {issuedPdf ? "Present" : "Missing: generation needs review; no automatic regeneration"}</p>{!deliveries.length ? <p>No tracked delivery attempt. Do not assume an email failed.</p> : deliveries.map(delivery => <div key={delivery.id} className="space-y-2"><p>{delivery.status} {delivery.failureCode ? `· ${delivery.failureCode}` : ""}</p>{delivery.status === "failed" ? <RetryDeliveryForm ticketId={ticket.id} deliveryId={delivery.id} /> : null}</div>)}</section> : null}
      {ticket.messages.map(message => <article key={message.id} className={`rounded-xl border p-4 ${message.internal ? "border-amber-200 bg-amber-50" : "border-slate-200"}`}><p className="text-xs text-slate-500">{message.authorName}{message.internal ? " · Internal note" : ""} · {message.createdAt.toISOString()}</p><p className="mt-2 whitespace-pre-wrap break-words">{message.body}</p></article>)}
      <ReplyForm id={ticket.id} operator={operator} resolved={ticket.status === "resolved"} operators={operators} assigned={ticket.assignedOperatorId} />
      {operator && (auditEvents.length || failedBillingEvents.length) ? <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Related system activity</summary><ul className="mt-3 space-y-2 text-xs">{auditEvents.map(event => <li key={event.id}>{event.createdAt.toISOString()} · {event.action}</li>)}{failedBillingEvents.map(event => <li key={event.id}>{event.createdAt.toISOString()} · Billing event failed: {event.type} · {event.stripeEventId}</li>)}</ul></details> : null}
    </div>
  </section>;
}
