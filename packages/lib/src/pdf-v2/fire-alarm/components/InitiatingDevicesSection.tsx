import { DataTable } from "../../core/components/DataTable";
import { EmptyState } from "../../core/components/EmptyState";
import { SectionHeader } from "../../core/components/SectionHeader";
import { SummaryStrip } from "../../core/components/SummaryStrip";

import type { FireAlarmReportRenderModel } from "../types/fireAlarmRenderModel";

export function InitiatingDevicesSection({
  model,
  rows,
  title = "Initiating Devices"
}: {
  model: FireAlarmReportRenderModel;
  rows?: FireAlarmReportRenderModel["initiatingDevicesSection"]["rows"];
  title?: string;
}) {
  const section = model.initiatingDevicesSection;
  const tableRows = rows ?? section.rows;

  return (
    <section className="pdf-section">
      <SectionHeader subtitle="Structured device-level inspection results for detectors, pull stations, and supervisory inputs." title={title} />
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
            { key: "location", header: "Location", width: "24%", render: (row) => row.location ?? "", isEmpty: (row) => !row.location, hideIfAllRowsEmpty: true },
            { key: "deviceType", header: "Device Type", width: "24%", render: (row) => row.deviceType },
            { key: "functionalTest", header: "Functional Test", width: "16%", render: (row) => row.functionalTest ?? "", isEmpty: (row) => !row.functionalTest },
            { key: "physicalCondition", header: "Physical Condition", width: "16%", render: (row) => row.physicalCondition ?? "", isEmpty: (row) => !row.physicalCondition },
            { key: "manufacturer", header: "Manufacturer", width: "10%", render: (row) => row.manufacturer ?? "", isEmpty: (row) => !row.manufacturer, hideIfAllRowsEmpty: true },
            { key: "notes", header: "Notes", width: "20%", render: (row) => row.notes ?? "", isEmpty: (row) => !row.notes, hideIfAllRowsEmpty: true }
          ]}
          density="compact"
          rows={tableRows}
        />
      ) : (
        <EmptyState message="No initiating devices recorded." />
      )}
    </section>
  );
}
