import { redirect } from "next/navigation";

import { isChecklistHeavyMobileInspectionType } from "@testworx/lib";

import { MobileFireAlarmReportScreen } from "../../../../mobile-fire-alarm-report-screen";
import { MobileChecklistReportScreen } from "../../../../mobile-checklist-report-screen";
import { loadTechnicianReportData } from "../load-technician-report-data";

export default async function TechnicianReportReviewPage({ params }: { params: Promise<{ inspectionId: string; taskId: string }> }) {
  const { inspectionId, taskId } = await params;
  const { report, data } = await loadTechnicianReportData(inspectionId, taskId);

  if (report.task.inspectionType === "fire_alarm") {
    return <MobileFireAlarmReportScreen data={data} inspectionId={inspectionId} mode="review" taskId={taskId} />;
  }

  if (!isChecklistHeavyMobileInspectionType(report.task.inspectionType)) {
    redirect(`/app/tech/reports/${encodeURIComponent(inspectionId)}/${encodeURIComponent(taskId)}`);
  }
  return <MobileChecklistReportScreen data={data} inspectionId={inspectionId} mode="review" taskId={taskId} />;
}
