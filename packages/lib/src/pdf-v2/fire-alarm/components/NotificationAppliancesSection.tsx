import { DataTable } from "../../core/components/DataTable";
import { EmptyState } from "../../core/components/EmptyState";
import { SectionHeader } from "../../core/components/SectionHeader";
import { SummaryStrip } from "../../core/components/SummaryStrip";

import type { FireAlarmReportRenderModel } from "../types/fireAlarmRenderModel";

export function NotificationAppliancesSection({
  model,
  rows,
  title = "Notification Appliances"
}: {
  model: FireAlarmReportRenderModel;
  rows?: FireAlarmReportRenderModel["notificationAppliancesSection"]["rows"];
  title?: string;
}) {
  const section = model.notificationAppliancesSection;
  const tableRows = rows ?? section.rows;

  return (
    <section className="pdf-section">
      <SectionHeader subtitle="Notification appliance performance with modality-aware audible and visible results." title={title} />
      <SummaryStrip
        items={[
          { label: "Result", value: section.result ?? "Pass" },
          { label: "Inspected", value: section.inspected ?? 0 },
          { label: "Deficiencies", value: section.deficiencies ?? 0, tone: (section.deficiencies ?? 0) > 0 ? "danger" : "success" }
        ]}
      />
      {tableRows.length ? (
        <DataTable
          columns={[
            { key: "applianceType", header: "Appliance Type", width: "24%", render: (row) => row.applianceType },
            { key: "quantity", header: "Quantity", width: "10%", align: "center", render: (row) => row.quantity ?? "", isEmpty: (row) => row.quantity === undefined, hideIfAllRowsEmpty: true },
            { key: "audibleOperation", header: "Audible Operation", width: "18%", render: (row) => row.audibleOperation ?? "", isEmpty: (row) => !row.audibleOperation, hideIfAllRowsEmpty: true },
            { key: "visibleOperation", header: "Visible Operation", width: "18%", render: (row) => row.visibleOperation ?? "", isEmpty: (row) => !row.visibleOperation, hideIfAllRowsEmpty: true },
            { key: "location", header: "Location", width: "18%", render: (row) => row.location ?? "", isEmpty: (row) => !row.location, hideIfAllRowsEmpty: true },
            { key: "notes", header: "Notes", width: "22%", render: (row) => row.notes ?? "", isEmpty: (row) => !row.notes, hideIfAllRowsEmpty: true }
          ]}
          density="compact"
          rows={tableRows}
        />
      ) : (
        <EmptyState message="No notification appliances recorded." />
      )}
    </section>
  );
}
