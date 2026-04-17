import Link from "next/link";
import { format } from "date-fns";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { buildReportPreview, describeRepeaterValueLines, getCustomerFacingSiteLabel, getCustomerReportDetail, isCustomerVisibleField, type ReportFieldDefinition } from "@testworx/lib/server/index";

import { InspectionPacketCard } from "../../../inspection-packet-card";
import { buildAcceptanceTestViewModel } from "../../../../reports/acceptance-test/buildAcceptanceTestViewModel";
import { AcceptanceReportView } from "../../../../reports/acceptance-test/pages/AcceptanceReportView";

type CustomerReportView = {
  updatedAt: Date;
  finalizedAt: Date | null;
  inspection: {
    scheduledStart: Date;
    customerCompany: { name: string };
    site: { name: string };
  };
  task: { inspectionType: string };
  technician: { name: string } | null;
  deficiencies: Array<{
    id: string;
    title: string;
    description: string;
    severity: string;
    status: string;
    location: string | null;
    notes: string | null;
    photoStorageKey: string | null;
  }>;
};

function formatFieldValue(value: string | number | boolean | Array<Record<string, string | number | boolean | null>> | null | undefined) {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? "No items recorded" : `${value.length} item${value.length === 1 ? "" : "s"} recorded`;
  }

  if (value === null || value === undefined || value === "") {
    return "Not recorded";
  }

  if (typeof value === "string" && (value.startsWith("blob:") || value.startsWith("data:image/"))) {
    return "Photo attached";
  }

  return String(value);
}

function isRepeaterField(
  field: ReportFieldDefinition
): field is Extract<ReportFieldDefinition, { type: "repeater" }> {
  return field.type === "repeater";
}

export default async function CustomerReportDetailPage({ params }: { params: Promise<{ reportId: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    notFound();
  }
  if (session.user.role !== "customer_user") {
    redirect("/app");
  }

  const { reportId } = await params;
  const detail = await getCustomerReportDetail({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, reportId);
  if (!detail) {
    notFound();
  }

  const reportView = detail.report as unknown as CustomerReportView;
  const customerFacingSiteName = getCustomerFacingSiteLabel(reportView.inspection.site.name);
  const packetDocuments = (detail as typeof detail & {
    packetDocuments?: Array<{
      id: string;
      source: "attachment" | "inspection_document";
      category: "report_pdf" | "signed_document" | "inspection_pdf";
      categoryLabel: string;
      title: string;
      fileName: string;
      customerVisible: boolean;
      happenedAt: Date;
      downloadPath: string;
    }>;
  }).packetDocuments ?? [];
  const preview = buildReportPreview(detail.draft);

  if (detail.report.task.inspectionType === "wet_chemical_acceptance_test") {
    const signaturesByKind = Object.fromEntries(detail.report.signatures.map((signature) => [signature.kind, signature])) as Record<
      string,
      { signerName: string; imageDataUrl: string; signedAt: Date }
    >;
    const model = buildAcceptanceTestViewModel({
      tenant: {
        name: detail.report.inspection.tenant.name,
        branding: detail.report.inspection.tenant.branding
      },
      customerCompany: detail.report.inspection.customerCompany,
      site: {
        ...detail.report.inspection.site,
        name: customerFacingSiteName ?? detail.report.inspection.site.name
      },
      inspection: detail.report.inspection,
      task: {
        inspectionType: detail.report.task.inspectionType
      },
      report: {
        id: detail.report.id,
        finalizedAt: detail.report.finalizedAt,
        technicianName: detail.report.technician?.name ?? null,
        status: "finalized",
        assignedTo: detail.report.task.assignedTechnician?.name ?? null
      },
      draft: detail.draft,
      deficiencies: detail.report.deficiencies,
      photos: [],
      technicianSignature: signaturesByKind.technician ?? null,
      customerSignature: signaturesByKind.customer ?? null
    });

    return (
      <section className="space-y-6">
        <AcceptanceReportView model={model} />
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <InspectionPacketCard
            description="This report is part of a completed inspection packet. Download every customer-authorized PDF tied to the visit from one place."
            documents={packetDocuments}
            emptyDescription="No customer-authorized PDFs are available for this completed inspection."
            emptyTitle="No packet documents available"
            title="Inspection packet documents"
          />
          <div className="space-y-6">
            <Link
              className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slateblue"
              href={`/app/customer/inspections/${detail.report.inspectionId}`}
            >
              Open full inspection packet
            </Link>
            <div className="rounded-[2rem] bg-white p-6 shadow-panel">
              <h3 className="text-2xl font-semibold text-ink">Technician notes</h3>
              <p className="mt-4 text-sm leading-6 text-slate-600">{detail.draft.overallNotes || "No technician notes were recorded."}</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Report detail</p>
        <h2 className="mt-2 text-3xl font-semibold text-ink">{customerFacingSiteName ?? reportView.inspection.customerCompany.name}</h2>
        <p className="mt-3 text-slate-500">{detail.template.label} finalized {format(reportView.finalizedAt ?? reportView.updatedAt, "MMM d, yyyy h:mm a")}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Customer</p><p className="mt-2 text-lg font-semibold text-ink">{reportView.inspection.customerCompany.name}</p></div>
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Scheduled</p><p className="mt-2 text-lg font-semibold text-ink">{format(reportView.inspection.scheduledStart, "MMM d, yyyy h:mm a")}</p></div>
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Technician</p><p className="mt-2 text-lg font-semibold text-ink">{reportView.technician?.name ?? "Not recorded"}</p></div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Inspection status</p><p className="mt-2 text-lg font-semibold text-ink">{preview.inspectionStatus === "deficiencies_found" ? "Deficiencies Found" : "Pass"}</p></div>
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Progress</p><p className="mt-2 text-lg font-semibold text-ink">{Math.round(preview.reportCompletion * 100)}% complete</p></div>
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Detected deficiencies</p><p className="mt-2 text-lg font-semibold text-ink">{preview.deficiencyCount}</p></div>
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Manual deficiencies</p><p className="mt-2 text-lg font-semibold text-ink">{preview.manualDeficiencyCount}</p></div>
      </div>
      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        <h3 className="text-2xl font-semibold text-ink">Structured findings</h3>
        <div className="mt-4 space-y-4">
          {detail.template.sections.map((section: { id: string; label: string; description: string; fields: ReportFieldDefinition[] }) => {
            const sectionState = detail.draft.sections[section.id];
            return (
              <div key={section.id} className="rounded-[1.5rem] border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold text-ink">{section.label}</p>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">{sectionState?.status?.replaceAll("_", " ") ?? "pending"}</span>
                </div>
                <p className="mt-2 text-sm text-slate-500">{section.description}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {section.fields.filter((field) => isCustomerVisibleField(field, sectionState?.fields ?? {})).map((field) => (
                    <div key={field.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{field.label}</p>
                      {isRepeaterField(field) ? (
                        <div className="mt-2 space-y-1">
                          {describeRepeaterValueLines(field, sectionState?.fields?.[field.id]).map((line, index) => (
                            <p key={`${field.id}-${index}`} className={`text-sm ${line.startsWith("  ") ? "pl-4 text-slate-600" : "font-medium text-ink"}`}>
                              {line.trimStart()}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm font-medium text-ink">{formatFieldValue(sectionState?.fields?.[field.id])}</p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm text-slate-600">{sectionState?.notes || "No additional notes recorded."}</p>
              </div>
            );
          })}
        </div>
      </div>
      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        <h3 className="text-2xl font-semibold text-ink">Detected deficiency list</h3>
        <div className="mt-4 space-y-3">
          {preview.detectedDeficiencies.length === 0 ? (
            <p className="rounded-[1.5rem] border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No row-level deficiencies were detected from inspection results.</p>
          ) : (
            preview.detectedDeficiencies.map((item) => (
              <div key={`${item.sectionId}-${item.rowKey}`} className="rounded-[1.5rem] border border-amber-100 bg-amber-50/60 p-4">
                <p className="font-semibold text-ink">{item.sectionLabel}</p>
                <p className="mt-2 text-sm text-slate-600">{item.rowLabel}</p>
                <p className="mt-2 text-sm text-slate-500">{item.description}</p>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[2rem] bg-white p-6 shadow-panel">
          <h3 className="text-2xl font-semibold text-ink">Deficiencies</h3>
          <div className="mt-4 space-y-3">
            {reportView.deficiencies.length === 0 ? (
              <p className="rounded-[1.5rem] border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No deficiencies were recorded on this report.</p>
            ) : (
              reportView.deficiencies.map((deficiency) => (
                <div key={deficiency.id} className="rounded-[1.5rem] border border-rose-100 bg-rose-50/50 p-4">
                  <p className="font-semibold text-ink">{deficiency.title}</p>
                  <p className="mt-2 text-sm text-slate-600">{deficiency.description}</p>
                  {deficiency.location ? <p className="mt-2 text-sm text-slate-500">Location: {deficiency.location}</p> : null}
                  {deficiency.notes ? <p className="mt-2 text-sm text-slate-500">Notes: {deficiency.notes}</p> : null}
                  {deficiency.photoStorageKey ? (
                    <a className="mt-3 inline-flex text-sm font-semibold text-slateblue" href={`/api/deficiencies/${deficiency.id}/photo`}>
                      View photo evidence
                    </a>
                  ) : null}
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">{deficiency.severity} severity | {deficiency.status}</p>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="space-y-6">
          <InspectionPacketCard
            description="This report is part of a completed inspection packet. Download every customer-authorized PDF tied to the visit from one place."
            documents={packetDocuments}
            emptyDescription="No customer-authorized PDFs are available for this completed inspection."
            emptyTitle="No packet documents available"
            title="Inspection packet documents"
          />
          <Link
            className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slateblue"
            href={`/app/customer/inspections/${detail.report.inspectionId}`}
          >
            Open full inspection packet
          </Link>
          <div className="rounded-[2rem] bg-white p-6 shadow-panel">
            <h3 className="text-2xl font-semibold text-ink">Technician notes</h3>
            <p className="mt-4 text-sm leading-6 text-slate-600">{detail.draft.overallNotes || "No technician notes were recorded."}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
