import Link from "next/link";
import { format } from "date-fns";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getCustomerInspectionPacketDetail } from "@testworx/lib";

import { InspectionPacketCard } from "../../../inspection-packet-card";

export default async function CustomerInspectionPacketPage({
  params
}: {
  params: Promise<{ inspectionId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    notFound();
  }
  if (session.user.role !== "customer_user") {
    redirect("/app");
  }

  const { inspectionId } = await params;
  const detail = await getCustomerInspectionPacketDetail({
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  }, inspectionId);

  if (!detail) {
    notFound();
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Inspection packet</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">{detail.inspection.site.name}</h2>
            <p className="mt-3 text-slate-500">
              {detail.inspection.customerCompany.name} | {format(detail.inspection.scheduledStart, "MMM d, yyyy h:mm a")}
            </p>
          </div>
          <Link
            className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue"
            href="/app/customer"
          >
            Back to portal
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl bg-white p-5 shadow-panel">
          <p className="text-sm text-slate-500">Scheduled visit</p>
          <p className="mt-2 text-lg font-semibold text-ink">{format(detail.inspection.scheduledStart, "MMM d, yyyy h:mm a")}</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-panel">
          <p className="text-sm text-slate-500">Completed reports</p>
          <p className="mt-2 text-lg font-semibold text-ink">{detail.reportSummaries.length}</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-panel">
          <p className="text-sm text-slate-500">PDF documents</p>
          <p className="mt-2 text-lg font-semibold text-ink">{detail.packetDocuments.length}</p>
        </div>
      </div>

      <InspectionPacketCard
        description="Download every customer-authorized PDF tied to this completed inspection from one place."
        documents={detail.packetDocuments}
        emptyDescription="No customer-authorized PDFs are available for this completed inspection yet."
        emptyTitle="No packet documents available"
      />

      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        <h3 className="text-2xl font-semibold text-ink">Completed reports</h3>
        <div className="mt-4 space-y-3">
          {detail.reportSummaries.map((report) => (
            <Link
              key={report.id}
              className="flex flex-col gap-2 rounded-[1.5rem] border border-slate-200 p-4 transition hover:border-slate-300 hover:bg-slate-50/70 md:flex-row md:items-center md:justify-between"
              href={report.href}
            >
              <div>
                <p className="font-semibold text-ink">{report.displayLabel}</p>
                <p className="mt-1 text-sm text-slate-500">
                  Finalized {format(report.finalizedAt ?? detail.inspection.scheduledStart, "MMM d, yyyy h:mm a")}
                </p>
              </div>
              <span className="text-sm font-semibold text-slateblue">View report details</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
