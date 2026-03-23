import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getAdminBillingSummaries } from "@testworx/lib";

type AdminBillingSummary = Awaited<ReturnType<typeof getAdminBillingSummaries>>[number];

const statusClasses: Record<string, string> = {
  draft: "bg-amber-50 text-amber-700",
  reviewed: "bg-blue-50 text-blue-700",
  invoiced: "bg-emerald-50 text-emerald-700"
};

export default async function AdminBillingPage() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const summaries = await getAdminBillingSummaries({
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  });
  const openSummaries = summaries.filter((summary) => summary.status !== "invoiced");
  const invoicedSummaries = summaries.filter((summary) => summary.status === "invoiced");

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Billing review</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">Inspection billing summaries</h2>
            <p className="mt-3 max-w-3xl text-slate-500">Review visit-level labor, materials, services, and fees extracted from finalized inspection reports before invoicing.</p>
          </div>
          <Link className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href="/app/admin">
            Back to scheduling
          </Link>
        </div>
      </div>

      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Review queue</p>
            <h3 className="mt-1 text-2xl font-semibold text-ink">Ready for billing review</h3>
          </div>
          <p className="text-sm text-slate-500">{openSummaries.length} {openSummaries.length === 1 ? "summary" : "summaries"}</p>
        </div>

        <div className="space-y-4">
          {openSummaries.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No billing summaries are ready yet. Finalize an inspection report with billable mappings to populate this queue.</p>
          ) : openSummaries.map((summary) => (
            <div key={summary.id} className="rounded-[1.5rem] border border-slate-200 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-ink">{summary.customerName}</p>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${statusClasses[summary.status] ?? "bg-slate-100 text-slate-700"}`}>{summary.status}</span>
                  </div>
                  <p className="text-sm text-slate-500">{summary.siteName} | {format(summary.inspectionDate, "MMM d, yyyy h:mm a")}</p>
                  <p className="text-sm text-slate-500">Reports: {summary.reportTypes.length > 0 ? summary.reportTypes.map((type: AdminBillingSummary["reportTypes"][number]) => type.replaceAll("_", " ")).join(", ") : "Inspection-level billing only"}</p>
                  <div className="grid gap-3 pt-1 md:grid-cols-4">
                    <p className="text-sm text-slate-600">Labor hours: <span className="font-semibold text-ink">{summary.metrics.laborHoursTotal}</span></p>
                    <p className="text-sm text-slate-600">Materials: <span className="font-semibold text-ink">{summary.metrics.materialItemCount}</span></p>
                    <p className="text-sm text-slate-600">Fees: <span className="font-semibold text-ink">{summary.metrics.feeCount}</span></p>
                    <p className="text-sm text-slate-600">Subtotal: <span className="font-semibold text-ink">{summary.subtotal > 0 ? `$${summary.subtotal.toFixed(2)}` : "Pending pricing"}</span></p>
                  </div>
                </div>
                <Link className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={`/app/admin/billing/${summary.inspectionId}`}>
                  Review billing
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Invoiced archive</p>
            <h3 className="mt-1 text-2xl font-semibold text-ink">Already invoiced</h3>
          </div>
          <p className="text-sm text-slate-500">{invoicedSummaries.length} {invoicedSummaries.length === 1 ? "summary" : "summaries"}</p>
        </div>

        <div className="space-y-4">
          {invoicedSummaries.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No inspections have been marked invoiced yet.</p>
          ) : invoicedSummaries.map((summary) => (
            <div key={summary.id} className="rounded-[1.5rem] border border-slate-200 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-ink">{summary.customerName}</p>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${statusClasses[summary.status] ?? "bg-slate-100 text-slate-700"}`}>{summary.status}</span>
                  </div>
                  <p className="text-sm text-slate-500">{summary.siteName} | {format(summary.inspectionDate, "MMM d, yyyy h:mm a")}</p>
                  <p className="text-sm text-slate-500">Reports: {summary.reportTypes.length > 0 ? summary.reportTypes.map((type: AdminBillingSummary["reportTypes"][number]) => type.replaceAll("_", " ")).join(", ") : "Inspection-level billing only"}</p>
                  <div className="grid gap-3 pt-1 md:grid-cols-4">
                    <p className="text-sm text-slate-600">Labor hours: <span className="font-semibold text-ink">{summary.metrics.laborHoursTotal}</span></p>
                    <p className="text-sm text-slate-600">Materials: <span className="font-semibold text-ink">{summary.metrics.materialItemCount}</span></p>
                    <p className="text-sm text-slate-600">Fees: <span className="font-semibold text-ink">{summary.metrics.feeCount}</span></p>
                    <p className="text-sm text-slate-600">Subtotal: <span className="font-semibold text-ink">{summary.subtotal > 0 ? `$${summary.subtotal.toFixed(2)}` : "Pending pricing"}</span></p>
                  </div>
                </div>
                <Link className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={`/app/admin/billing/${summary.inspectionId}`}>
                  View invoice detail
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
