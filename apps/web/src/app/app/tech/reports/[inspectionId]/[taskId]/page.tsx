import { MobileSmartReportScreen } from "../../../mobile-smart-report-screen";
import { loadTechnicianReportData } from "./load-technician-report-data";

export default async function TechnicianReportPage({ params }: { params: Promise<{ inspectionId: string; taskId: string }> }) {
  const { inspectionId, taskId } = await params;
  const { data } = await loadTechnicianReportData(inspectionId, taskId);

  return <MobileSmartReportScreen data={data} inspectionId={inspectionId} mode="edit" taskId={taskId} />;
}
