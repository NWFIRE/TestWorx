import type { getAdminFieldServiceRequests } from "@testworx/lib/server/index";

type Request = Awaited<ReturnType<typeof getAdminFieldServiceRequests>>["requests"][number];

export function ResolvedRequestDetails({ request, timezone, statusLabel, typeLabel }: {
  request: Request;
  timezone: string;
  statusLabel: string;
  typeLabel: string;
}) {
  const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: timezone });
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white text-sm">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-2xl p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
        <span className="min-w-0 flex-1 break-words">
          <span className="block font-semibold text-slate-900">{request.title}</span>
          <span className="block text-slate-500">{request.customerCompany.name} · {request.requestedBy.name}</span>
        </span>
        <span className="text-xs font-semibold text-slate-600">{statusLabel}</span>
        <span className="font-semibold text-blue-700 group-open:hidden">View details</span>
        <span className="hidden font-semibold text-blue-700 group-open:inline">Hide details</span>
      </summary>
      <div className="space-y-4 border-t border-slate-200 p-4">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div><dt className="font-semibold text-slate-900">Request type</dt><dd className="mt-1 text-slate-600">{typeLabel}</dd></div>
          <div><dt className="font-semibold text-slate-900">Priority</dt><dd className="mt-1 text-slate-600">{request.priority === "urgent" ? "Urgent" : "Normal"}</dd></div>
          <div><dt className="font-semibold text-slate-900">Customer / location</dt><dd className="mt-1 break-words text-slate-600">{request.customerCompany.name}{request.site ? <><br />{request.site.name}<br />{[request.site.addressLine1, request.site.city, request.site.state].filter(Boolean).join(", ")}</> : <><br />No specific site selected</>}</dd></div>
          <div><dt className="font-semibold text-slate-900">Requested by</dt><dd className="mt-1 break-words text-slate-600">{request.requestedBy.name}<br />{request.requestedBy.email}<br />{dateFormat.format(new Date(request.createdAt))}</dd></div>
        </dl>
        <div><h4 className="font-semibold text-slate-900">Request details</h4><p className="mt-1 whitespace-pre-wrap break-words text-slate-700">{request.description}</p></div>
        {request.equipmentContext ? <div><h4 className="font-semibold text-slate-900">Equipment / location notes</h4><p className="mt-1 whitespace-pre-wrap break-words text-slate-700">{request.equipmentContext}</p></div> : null}
        {request.preferredTiming ? <div><h4 className="font-semibold text-slate-900">Preferred timing</h4><p className="mt-1 whitespace-pre-wrap break-words text-slate-700">{request.preferredTiming}</p></div> : null}
        <div className="rounded-xl bg-slate-50 p-3"><h4 className="font-semibold text-slate-900">Office note</h4><p className="mt-1 whitespace-pre-wrap break-words text-slate-700">{request.adminNote || "No office note recorded."}</p>
          <p className="mt-3 text-xs text-slate-500">{statusLabel}{request.reviewedBy?.name ? ` by ${request.reviewedBy.name}` : ""}{request.reviewedAt ? ` · ${dateFormat.format(new Date(request.reviewedAt))}` : ""}</p>
        </div>
      </div>
    </details>
  );
}
