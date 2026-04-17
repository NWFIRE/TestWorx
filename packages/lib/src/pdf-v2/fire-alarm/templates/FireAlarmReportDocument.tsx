import { PdfShell } from "../../core/components/PdfShell";
import { ReportHeader } from "../../core/components/ReportHeader";
import { chunkItems } from "../../core/layout/pagination";

import { ControlPanelSection } from "../components/ControlPanelSection";
import { FireAlarmPage1 } from "../components/FireAlarmPage1";
import { FindingsSection } from "../components/FindingsSection";
import { InitiatingDevicesSection } from "../components/InitiatingDevicesSection";
import { NotificationAppliancesSection } from "../components/NotificationAppliancesSection";
import { PhotosAndSignaturesSection } from "../components/PhotosAndSignaturesSection";
import type { FireAlarmReportRenderModel } from "../types/fireAlarmRenderModel";

export function FireAlarmReportDocument({ model }: { model: FireAlarmReportRenderModel }) {
  const initiatingChunks = chunkItems(model.initiatingDevicesSection.rows, 12);
  const notificationChunks = chunkItems(model.notificationAppliancesSection.rows, 14);
  const totalPages = 1 + 1 + initiatingChunks.length + notificationChunks.length + 1 + 1;
  let pageNumber = 1;

  const header = (
    <ReportHeader
      company={model.company}
      report={{
        title: model.report.title,
        reportId: model.report.reportId,
        inspectionDate: model.report.inspectionDate
      }}
    />
  );

  return (
    <>
      <PdfShell header={header} pageNumber={pageNumber++} totalPages={totalPages}>
        <FireAlarmPage1 model={model} />
      </PdfShell>
      <PdfShell header={header} pageNumber={pageNumber++} totalPages={totalPages}>
        <ControlPanelSection model={model} />
      </PdfShell>
      {initiatingChunks.map((chunk, index) => (
        <PdfShell header={header} key={`initiating-${index}`} pageNumber={pageNumber++} totalPages={totalPages}>
          <InitiatingDevicesSection model={model} rows={chunk} title={index === 0 ? "Initiating Devices" : `Initiating Devices (cont.)`} />
        </PdfShell>
      ))}
      {notificationChunks.map((chunk, index) => (
        <PdfShell header={header} key={`notification-${index}`} pageNumber={pageNumber++} totalPages={totalPages}>
          <NotificationAppliancesSection model={model} rows={chunk} title={index === 0 ? "Notification Appliances" : `Notification Appliances (cont.)`} />
        </PdfShell>
      ))}
      <PdfShell header={header} pageNumber={pageNumber++} totalPages={totalPages}>
        <FindingsSection model={model} />
      </PdfShell>
      <PdfShell header={header} pageNumber={pageNumber++} totalPages={totalPages}>
        <PhotosAndSignaturesSection model={model} />
      </PdfShell>
    </>
  );
}
