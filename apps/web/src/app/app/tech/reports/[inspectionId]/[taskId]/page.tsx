import { isChecklistHeavyMobileInspectionType } from "@testworx/lib";

import { ReportEditor } from "../../../report-editor";
import { MobileChecklistReportScreen } from "../../../mobile-checklist-report-screen";
import { MobileFireAlarmReportScreen } from "../../../mobile-fire-alarm-report-screen";
import { buildAcceptanceTestViewModel } from "../../../../../reports/acceptance-test/buildAcceptanceTestViewModel";
import { AcceptanceReportEditView } from "../../../../../reports/acceptance-test/pages/AcceptanceReportEditView";
import { loadTechnicianReportData } from "./load-technician-report-data";

export default async function TechnicianReportPage({ params }: { params: Promise<{ inspectionId: string; taskId: string }> }) {
  const { inspectionId, taskId } = await params;
  const { report, data } = await loadTechnicianReportData(inspectionId, taskId);

  if (report.task.inspectionType === "wet_chemical_acceptance_test") {
    const finalizedAtDate = report.finalizedAt ? new Date(report.finalizedAt) : null;
    const editor = <ReportEditor data={data} />;
    const model = buildAcceptanceTestViewModel({
      tenant: {
        name: report.inspection.tenant.name,
        branding: report.inspection.tenant.branding
      },
      customerCompany: report.inspection.customerCompany,
      site: report.inspection.site,
      inspection: report.inspection,
      task: {
        inspectionType: report.task.inspectionType
      },
      report: {
        id: report.id,
        finalizedAt: finalizedAtDate,
        technicianName: null,
        status: report.status,
        assignedTo: report.task.assignedTechnician?.name ?? report.inspection.assignedTechnician?.name ?? null
      },
      draft: report.draft,
      deficiencies: [],
      photos: [],
      technicianSignature: report.draft.signatures.technician ?? null,
      customerSignature: report.draft.signatures.customer ?? null
    });

    return <AcceptanceReportEditView model={model} editor={editor} />;
  }

  if (report.task.inspectionType === "fire_alarm") {
    return <MobileFireAlarmReportScreen data={data} inspectionId={inspectionId} mode="edit" taskId={taskId} />;
  }

  if (isChecklistHeavyMobileInspectionType(report.task.inspectionType)) {
    return <MobileChecklistReportScreen data={data} inspectionId={inspectionId} mode="checklist" taskId={taskId} />;
  }

  return <ReportEditor data={data} />;
}
