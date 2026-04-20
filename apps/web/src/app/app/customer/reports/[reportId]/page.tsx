import Link from "next/link";
import { format } from "date-fns";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { buildReportPreview, describeRepeaterValueLines, getCustomerFacingSiteLabel, getCustomerReportDetail, isCustomerVisibleField, type ReportFieldDefinition } from "@testworx/lib/server/index";

import { InspectionPacketCard } from "../../../inspection-packet-card";
import { AppPageShell, PageHeader, SectionCard, StatusBadge, WorkspaceSplit } from "../../../admin/operations-ui";
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

function formatHostedInspectionOutcome(
  inspectionStatus: "pass" | "deficiencies_found"
) {
  return inspectionStatus === "deficiencies_found" ? "Deficiencies Found" : "Pass";
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
      source: "attachment" | "inspection_document" | "report";
      category: "hosted_report" | "report_pdf" | "signed_document" | "inspection_pdf";
      categoryLabel: string;
      title: string;
      fileName: string;
      customerVisible: boolean;
      happenedAt: Date;
      downloadPath: string | null;
      viewPath: string;
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
        assignedTo: null
      },
      draft: detail.draft,
      deficiencies: detail.report.deficiencies,
      photos: [],
      technicianSignature: signaturesByKind.technician ?? null,
      customerSignature: signaturesByKind.customer ?? null
    });

    return (
      <AppPageShell density="wide">
        <PageHeader
          backNavigation={{ label: "Back to portal", fallbackHref: `/app/customer/inspections/${detail.report.inspectionId}` }}
          eyebrow="Customer report"
          title={detail.template.label}
          description="Review inspection results, packet documents, and technician notes from one polished hosted report workspace."
          contentWidth="full"
          actions={(
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              href={`/app/customer/inspections/${detail.report.inspectionId}`}
            >
              Open full inspection packet
            </Link>
          )}
        />

        <SectionCard>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge label="Finalized" tone="emerald" />
            <StatusBadge label={model.report.result} tone={model.report.result === "Fail" ? "rose" : model.report.result === "Partial" ? "amber" : "emerald"} />
            <p className="text-sm text-slate-500">{reportView.inspection.customerCompany.name}</p>
            <p className="text-sm text-slate-500">{customerFacingSiteName ?? reportView.inspection.site.name}</p>
            <p className="text-sm text-slate-500">Completed {format(reportView.finalizedAt ?? reportView.updatedAt, "MMM d, yyyy h:mm a")}</p>
          </div>
        </SectionCard>

        <WorkspaceSplit variant="content-heavy">
          <AcceptanceReportView model={model} />
          <div className="space-y-6">
            <InspectionPacketCard
              description="Open hosted reports and download every customer-authorized document tied to this inspection from one place."
              documents={packetDocuments}
              emptyDescription="No hosted reports or customer-authorized packet documents are available for this completed inspection."
              emptyTitle="No packet documents available"
              title="Inspection packet documents"
            />
            <SectionCard>
              <h2 className="text-xl font-semibold text-slate-950">Technician notes</h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">{detail.draft.overallNotes || "No technician notes were recorded."}</p>
            </SectionCard>
          </div>
        </WorkspaceSplit>
      </AppPageShell>
    );
  }

  return (
    <AppPageShell density="wide">
      <PageHeader
        backNavigation={{ label: "Back to portal", fallbackHref: `/app/customer/inspections/${detail.report.inspectionId}` }}
        eyebrow="Customer report"
        title={detail.template.label}
        description="Review the hosted inspection report, results, deficiencies, and packet documents from one customer-ready workspace."
        contentWidth="full"
        actions={(
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            href={`/app/customer/inspections/${detail.report.inspectionId}`}
          >
            Open full inspection packet
          </Link>
        )}
      />

      <SectionCard>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge label="Finalized" tone="emerald" />
          <StatusBadge label={formatHostedInspectionOutcome(preview.inspectionStatus)} tone={preview.inspectionStatus === "deficiencies_found" ? "amber" : "emerald"} />
          <p className="text-sm text-slate-500">{reportView.inspection.customerCompany.name}</p>
          <p className="text-sm text-slate-500">{customerFacingSiteName ?? reportView.inspection.site.name}</p>
          <p className="text-sm text-slate-500">Completed {format(reportView.finalizedAt ?? reportView.updatedAt, "MMM d, yyyy h:mm a")}</p>
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SectionCard>
          <p className="text-sm text-slate-500">Customer</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{reportView.inspection.customerCompany.name}</p>
        </SectionCard>
        <SectionCard>
          <p className="text-sm text-slate-500">Scheduled visit</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{format(reportView.inspection.scheduledStart, "MMM d, yyyy")}</p>
          <p className="mt-1 text-sm text-slate-500">{format(reportView.inspection.scheduledStart, "h:mm a")}</p>
        </SectionCard>
        <SectionCard>
          <p className="text-sm text-slate-500">Technician</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{reportView.technician?.name ?? "Not recorded"}</p>
        </SectionCard>
        <SectionCard>
          <p className="text-sm text-slate-500">Progress</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{Math.round(preview.reportCompletion * 100)}%</p>
          <p className="mt-1 text-sm text-slate-500">Report completion</p>
        </SectionCard>
      </div>

      <WorkspaceSplit variant="content-heavy">
        <div className="space-y-6">
          <SectionCard>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--tenant-primary)]">Report Summary</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Inspection overview</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">This hosted inspection report summarizes customer-visible findings, completion results, and any recorded deficiencies.</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5 text-sm text-slate-600">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Detected deficiencies</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">{preview.deficiencyCount}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Manual deficiencies</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">{preview.manualDeficiencyCount}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Outcome</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">{formatHostedInspectionOutcome(preview.inspectionStatus)}</p>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Structured findings</h2>
            <div className="mt-4 space-y-4">
              {detail.template.sections.map((section: { id: string; label: string; description: string; fields: ReportFieldDefinition[] }) => {
                const sectionState = detail.draft.sections[section.id];
                return (
                  <div key={section.id} className="rounded-[24px] border border-slate-200 bg-slate-50/45 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-slate-950">{section.label}</p>
                      <StatusBadge label={sectionState?.status?.replaceAll("_", " ") ?? "pending"} tone="slate" />
                    </div>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{section.description}</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {section.fields.filter((field) => isCustomerVisibleField(field, sectionState?.fields ?? {})).map((field) => (
                        <div key={field.id} className="rounded-[20px] border border-slate-200 bg-white p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{field.label}</p>
                          {isRepeaterField(field) ? (
                            <div className="mt-3 space-y-2">
                              {describeRepeaterValueLines(field, sectionState?.fields?.[field.id]).map((line, index) => (
                                <p key={`${field.id}-${index}`} className={`text-sm ${line.startsWith("  ") ? "pl-4 text-slate-600" : "font-medium text-slate-900"}`}>
                                  {line.trimStart()}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-3 text-sm font-medium text-slate-900">{formatFieldValue(sectionState?.fields?.[field.id])}</p>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-sm leading-7 text-slate-600">{sectionState?.notes || "No additional notes recorded."}</p>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Detected deficiency list</h2>
            <div className="mt-4 space-y-3">
              {preview.detectedDeficiencies.length === 0 ? (
                <p className="rounded-[20px] border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No row-level deficiencies were detected from inspection results.</p>
              ) : (
                preview.detectedDeficiencies.map((item) => (
                  <div key={`${item.sectionId}-${item.rowKey}`} className="rounded-[20px] border border-amber-200 bg-amber-50/60 p-4">
                    <p className="font-semibold text-slate-950">{item.sectionLabel}</p>
                    <p className="mt-2 text-sm text-slate-700">{item.rowLabel}</p>
                    <p className="mt-2 text-sm text-slate-600">{item.description}</p>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Deficiencies</h2>
            <div className="mt-4 space-y-3">
              {reportView.deficiencies.length === 0 ? (
                <p className="rounded-[20px] border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No deficiencies were recorded on this report.</p>
              ) : (
                reportView.deficiencies.map((deficiency) => (
                  <div key={deficiency.id} className="rounded-[20px] border border-rose-200 bg-rose-50/55 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-950">{deficiency.title}</p>
                      <StatusBadge label={deficiency.status} tone="rose" />
                    </div>
                    <p className="mt-2 text-sm leading-7 text-slate-700">{deficiency.description}</p>
                    {deficiency.location ? <p className="mt-2 text-sm text-slate-600">Location: {deficiency.location}</p> : null}
                    {deficiency.notes ? <p className="mt-2 text-sm text-slate-600">Notes: {deficiency.notes}</p> : null}
                    {deficiency.photoStorageKey ? (
                      <a className="mt-3 inline-flex text-sm font-semibold text-slateblue" href={`/api/deficiencies/${deficiency.id}/photo`}>
                        View photo evidence
                      </a>
                    ) : null}
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">{deficiency.severity} severity</p>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <InspectionPacketCard
            description="Open hosted reports and download every customer-authorized document tied to the visit from one place."
            documents={packetDocuments}
            emptyDescription="No hosted reports or customer-authorized packet documents are available for this completed inspection."
            emptyTitle="No packet documents available"
            title="Inspection packet documents"
          />

          <SectionCard>
            <h2 className="text-xl font-semibold text-slate-950">Technician notes</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">{detail.draft.overallNotes || "No technician notes were recorded."}</p>
          </SectionCard>
        </div>
      </WorkspaceSplit>
    </AppPageShell>
  );
}
