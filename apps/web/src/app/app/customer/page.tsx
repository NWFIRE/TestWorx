import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { buildTenantBrandingCss, getCustomerPortalData, inspectionTypeRegistry } from "@testworx/lib";

export default async function CustomerPage() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (session.user.role !== "customer_user") {
    redirect("/app");
  }

  const data = await getCustomerPortalData({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId });
  const theme = buildTenantBrandingCss(data.branding);
  const reports = data.reports as unknown as Array<{
    id: string;
    updatedAt: Date;
    finalizedAt: Date | null;
    inspection: { site: { name: string }; documents: Array<{ id: string }> };
    task: { inspectionType: keyof typeof inspectionTypeRegistry };
    attachments: Array<{ id: string }>;
  }>;

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] p-6 text-white shadow-panel" style={{ background: `linear-gradient(135deg, ${theme["--tenant-primary"]} 0%, ${theme["--tenant-accent"]} 100%)` }}>
        <p className="text-sm uppercase tracking-[0.25em] text-white/70">Customer portal</p>
        <h2 className="mt-2 text-3xl font-semibold">{data.branding.legalBusinessName || data.tenantName}</h2>
        <p className="mt-3 max-w-2xl text-white/80">Review finalized reports, download branded PDF packets, and access any customer-authorized inspection attachments.</p>
        <p className="mt-4 text-sm text-white/75">{[data.branding.phone, data.branding.email, data.branding.website].filter(Boolean).join(" | ")}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Sites</p><p className="mt-2 text-3xl font-semibold">{data.siteCount}</p></div>
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Finalized reports</p><p className="mt-2 text-3xl font-semibold">{data.reportCount}</p></div>
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Open deficiencies</p><p className="mt-2 text-3xl font-semibold">{data.openDeficiencyCount}</p></div>
      </div>
      <div className="space-y-4 rounded-[2rem] bg-white p-6 shadow-panel">
        <div>
          <h3 className="text-2xl font-semibold text-ink">Available reports</h3>
          <p className="mt-2 text-sm text-slate-500">Each report includes a structured summary plus downloadable PDFs when available.</p>
        </div>
        {reports.length === 0 ? (
          <p className="rounded-[1.5rem] border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No finalized reports are available yet.</p>
        ) : (
          reports.map((report) => (
            <div key={report.id} className="rounded-[1.5rem] border border-slate-200 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-ink">{report.inspection.site.name}</p>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Finalized</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{inspectionTypeRegistry[report.task.inspectionType].label} â€¢ {format(report.finalizedAt ?? report.updatedAt, "MMM d, yyyy")}</p>
                  <p className="mt-1 text-sm text-slate-500">{report.attachments.length + report.inspection.documents.length} PDF attachment{report.attachments.length + report.inspection.documents.length === 1 ? "" : "s"} available</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  {report.attachments[0] ? (
                    <a className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={`/api/attachments/${report.attachments[0].id}`}>
                      Download PDF
                    </a>
                  ) : report.inspection.documents[0] ? (
                    <a className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={`/api/inspection-documents/${report.inspection.documents[0].id}`}>
                      Download PDF
                    </a>
                  ) : null}
                  <Link className="inline-flex rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white" href={`/app/customer/reports/${report.id}`}>
                    View details
                  </Link>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
