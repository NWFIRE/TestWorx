"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { submitProblem, replyToProblem, retryDeliveryAction } from "./actions";

const field = "mt-2 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900";
const button = "min-h-11 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50";

export function RetryDeliveryForm({ ticketId, deliveryId }: { ticketId: string; deliveryId: string }) {
  const [state, action, pending] = useActionState(retryDeliveryAction, { error: "" });
  return <form action={action} className="space-y-3"><input type="hidden" name="ticketId" value={ticketId} /><input type="hidden" name="deliveryId" value={deliveryId} /><button disabled={pending} className={button}>{pending ? "Checking delivery..." : "Retry failed delivery"}</button>{state.error ? <p role="alert">{state.error}</p> : "saved" in state && state.saved ? <p role="status">Delivery confirmed.</p> : null}</form>;
}

export function ProblemForm({ pagePath, errorReference, reportId }: { pagePath: string; errorReference: string; reportId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(submitProblem, { error: "" });
  const ticketId = "ticketId" in state ? state.ticketId : null;
  useEffect(() => {
    if (ticketId) router.replace(`/app/help/${ticketId}`);
  }, [router, ticketId]);
  return <form action={action} className="space-y-5">
    <input type="hidden" name="pagePath" value={pagePath} /><input type="hidden" name="errorReference" value={errorReference} />
    <label className="block text-sm font-medium">Subject<input className={field} name="title" minLength={5} maxLength={160} required /></label>
    <label className="block text-sm font-medium">What happened?<textarea className={field} name="description" rows={5} minLength={10} maxLength={6000} required placeholder="What were you trying to do, and what happened instead? Do not include passwords or payment details." /></label>
    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="blocked" className="h-5 w-5" />This is blocking my work</label>
    <label className="block text-sm font-medium">Report reference (optional)<input name="reportId" defaultValue={reportId} className={field} maxLength={100} /></label>
    <label className="block text-sm font-medium">Screenshot (optional, PNG or JPEG up to 2 MB)<input name="screenshot" type="file" accept="image/png,image/jpeg" className={field} /></label>
    <p className="text-xs text-slate-500">Company, role, page, time, and application version are included automatically. Screenshots are visible only to you and TradeWorx support.</p>
    {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
    <button className={button} disabled={pending || !!ticketId}>{pending ? "Sending..." : ticketId ? "Request sent" : "Send request"}</button>
  </form>;
}

export function ReplyForm({ id, operator, resolved, operators, assigned }: { id: string; operator: boolean; resolved: boolean; operators: { id: string; name: string }[]; assigned: string | null }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(replyToProblem, { error: "" });
  useEffect(() => {
    if ("saved" in state && state.saved) router.refresh();
  }, [router, state]);
  return <form action={action} className="space-y-4">
    <input type="hidden" name="ticketId" value={id} />
    <label className="block text-sm font-medium">Message<textarea className={field} name="body" rows={4} maxLength={6000} /></label>
    {operator ? <label className="block text-sm">Assigned operator<select className={field} name="assigneeId" defaultValue={assigned ?? ""}><option value="">Unassigned</option>{operators.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label> : null}
    <div className="flex flex-wrap gap-3">
      <button name="action" value="reply" className={button} disabled={pending}>Send reply</button>
      {operator ? <><button name="action" value="note" className={button} disabled={pending}>Internal note</button><button name="action" value="assign" className={button} disabled={pending}>Assign</button></> : null}
      {(operator || resolved) ? <button name="action" value={resolved ? "reopen" : "resolve"} className={button} disabled={pending}>{resolved ? "Reopen request" : "Mark resolved"}</button> : null}
    </div>
    {state.error ? <p role="alert" className="text-red-700">{state.error}</p> : "saved" in state && state.saved ? <p role="status" className="text-green-800">Request updated.</p> : null}
  </form>;
}
