import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { fieldServiceRequestStatusLabels, fieldServiceRequestTypeLabels, getFieldServiceRequestFormData } from "@testworx/lib/server/index";
import { FieldRequestForm } from "./field-request-form";

export default async function TechnicianRequestsPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");
  if (session.user.role !== "technician") redirect("/app");
  const data = await getFieldServiceRequestFormData({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId });

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-8">
      <header className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white to-blue-50 p-5 shadow-sm sm:p-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-blue-700">Field request</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-slate-950">Request office support</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Send the office team the complete field context for a service ticket, work order, follow-up, or quote.</p>
      </header>
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <FieldRequestForm customers={data.customers} />
      </section>
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Submitted</p><h2 className="mt-1 text-xl font-bold text-slate-950">Recent requests</h2></div>
          <span className="text-sm text-slate-500">{data.requests.length}</span>
        </div>
        <div className="space-y-3">
          {data.requests.length ? data.requests.map((request) => (
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4" key={request.id}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-slate-950">{request.title}</p><p className="mt-1 text-sm text-slate-500">{request.customerCompany.name}{request.site ? ` · ${request.site.name}` : ""}</p></div><span className={request.status === "pending" ? "rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800" : request.status === "resolved" ? "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800" : "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"}>{fieldServiceRequestStatusLabels[request.status]}</span></div>
              <p className="mt-3 text-xs font-medium text-slate-500">{fieldServiceRequestTypeLabels[request.requestType]} · {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: data.timezone }).format(request.createdAt)}</p>
              {request.adminNote ? <p className="mt-3 rounded-xl bg-white p-3 text-sm text-slate-700"><span className="font-semibold">Office note:</span> {request.adminNote}</p> : null}
            </article>
          )) : <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">No requests submitted yet.</p>}
        </div>
      </section>
    </div>
  );
}
