import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { fieldServiceRequestStatusLabels, fieldServiceRequestTypeLabels, getAdminFieldServiceRequests } from "@testworx/lib/server/index";
import { AppPageShell, KPIStatCard, PageHeader, SectionCard } from "../operations-ui";
import { RequestReviewForm } from "./review-form";

export default async function AdminServiceRequestsPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) redirect("/app");
  const data = await getAdminFieldServiceRequests({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId });
  const active = data.requests.filter((request) => request.status === "pending" || request.status === "acknowledged");
  const history = data.requests.filter((request) => request.status === "resolved" || request.status === "declined").slice(0, 30);

  return (
    <AppPageShell>
      <PageHeader eyebrow="Field operations" title="Service requests" />
      <div className="grid gap-4 sm:grid-cols-2">
        <KPIStatCard label="Needs review" value={data.counts.pending} tone="amber" />
        <KPIStatCard label="Urgent" value={data.counts.urgent} tone="rose" />
      </div>
      <SectionCard>
        <div className="mb-5"><p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Office queue</p><h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Requests from the field</h2><p className="mt-1 text-sm text-slate-500">Review the technician’s context before creating or dispatching work.</p></div>
        <div className="space-y-4">
          {active.length ? active.map((request) => (
            <article className={request.priority === "urgent" ? "rounded-[24px] border border-amber-300 bg-amber-50/60 p-5" : "rounded-[24px] border border-slate-200 bg-slate-50/70 p-5"} key={request.id}>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className={request.priority === "urgent" ? "rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-white" : "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"}>{request.priority === "urgent" ? "Urgent" : "Normal"}</span><span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">{fieldServiceRequestTypeLabels[request.requestType]}</span><span className="text-xs font-medium text-slate-500">{fieldServiceRequestStatusLabels[request.status]}</span></div>
                  <h3 className="mt-3 text-xl font-bold text-slate-950">{request.title}</h3>
                  <p className="mt-1 font-semibold text-slate-700">{request.customerCompany.name}{request.site ? ` · ${request.site.name}` : ""}</p>
                  {request.site ? <p className="mt-1 text-sm text-slate-500">{request.site.addressLine1}, {request.site.city}, {request.site.state}</p> : null}
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{request.description}</p>
                  {request.equipmentContext ? <div className="mt-4 rounded-2xl bg-white p-4 text-sm text-slate-700"><span className="font-semibold">Equipment / location:</span> {request.equipmentContext}</div> : null}
                  {request.preferredTiming ? <p className="mt-3 text-sm text-slate-600"><span className="font-semibold">Preferred timing:</span> {request.preferredTiming}</p> : null}
                  <p className="mt-4 text-xs font-medium text-slate-500">Submitted by {request.requestedBy.name} · {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: data.timezone }).format(request.createdAt)}</p>
                </div>
                <RequestReviewForm>
                  <input name="requestId" type="hidden" value={request.id} />
                  <label className="block text-sm font-semibold text-slate-700">Office note<textarea className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" defaultValue={request.adminNote ?? ""} name="adminNote" placeholder="Next step, assignment, or disposition" /></label>
                  <div className="grid grid-cols-3 gap-2"><button className="min-h-11 rounded-xl border border-blue-200 bg-blue-50 px-2 text-xs font-semibold text-blue-800" name="status" type="submit" value="acknowledged">Acknowledge</button><button className="min-h-11 rounded-xl bg-emerald-700 px-2 text-xs font-semibold text-white" name="status" type="submit" value="resolved">Resolve</button><button className="min-h-11 rounded-xl border border-slate-200 px-2 text-xs font-semibold text-slate-700" name="status" type="submit" value="declined">Decline</button></div>
                  <Link className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 text-sm font-semibold text-slate-700" href={`/app/admin/inspections?create=1&customerCompanyId=${encodeURIComponent(request.customerCompanyId)}${request.siteId ? `&siteId=${encodeURIComponent(request.siteId)}` : ""}`}>Create scheduled work</Link>
                </RequestReviewForm>
              </div>
            </article>
          )) : <div className="rounded-[24px] border border-dashed border-emerald-300 bg-emerald-50/60 p-7 text-center"><p className="font-semibold text-emerald-900">The field request queue is clear.</p><p className="mt-1 text-sm text-emerald-700">New technician requests will appear here automatically.</p></div>}
        </div>
      </SectionCard>
      {history.length ? <SectionCard><details><summary className="cursor-pointer font-semibold text-slate-800">Resolved request history ({history.length})</summary><div className="mt-4 space-y-2">{history.map((request) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-sm" key={request.id}><div><p className="font-semibold text-slate-900">{request.title}</p><p className="text-slate-500">{request.customerCompany.name} · {request.requestedBy.name}</p></div><span className="text-xs font-semibold text-slate-600">{fieldServiceRequestStatusLabels[request.status]}</span></div>)}</div></details></SectionCard> : null}
    </AppPageShell>
  );
}
