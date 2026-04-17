import { DataTable } from "../../core/components/DataTable";
import { EmptyState } from "../../core/components/EmptyState";
import { MetadataGrid } from "../../core/components/MetadataGrid";
import { SectionHeader } from "../../core/components/SectionHeader";
import { SummaryStrip } from "../../core/components/SummaryStrip";

import type { FireAlarmReportRenderModel } from "../types/fireAlarmRenderModel";

export function ControlPanelSection({ model }: { model: FireAlarmReportRenderModel }) {
  const section = model.controlPanelSection;

  return (
    <section className="pdf-section">
      <SectionHeader subtitle="Inspect panel identification, power supplies, communication path, and overall condition." title="Control Panel" />
      <SummaryStrip
        items={[
          { label: "Result", value: section.result ?? "Pass" },
          { label: "Inspected", value: section.inspected ?? 0 },
          { label: "Deficiencies", value: section.deficiencies ?? 0, tone: (section.deficiencies ?? 0) > 0 ? "danger" : "success" }
        ]}
      />
      <MetadataGrid columns={2} items={section.detailFields} />
      {section.rows.length ? (
        <DataTable
          columns={[
            { key: "location", header: "Location", width: "26%", render: (row) => row.location ?? "", isEmpty: (row) => !row.location },
            { key: "type", header: "Type", width: "20%", render: (row) => row.type ?? "", isEmpty: (row) => !row.type },
            { key: "manufacturer", header: "Manufacturer", width: "16%", render: (row) => row.manufacturer ?? "", isEmpty: (row) => !row.manufacturer, hideIfAllRowsEmpty: true },
            { key: "serviceKey", header: "Service Key", width: "14%", render: (row) => row.serviceKey ?? "", isEmpty: (row) => !row.serviceKey, hideIfAllRowsEmpty: true },
            {
              key: "inspectionSummary",
              header: "Inspection Summary",
              width: "24%",
              render: (row) => <div className="pdf-cell-lines">{row.inspectionSummary?.map((line) => <span key={line}>{line}</span>)}</div>,
              isEmpty: (row) => !(row.inspectionSummary?.length)
            }
          ]}
          density="compact"
          rows={section.rows}
        />
      ) : (
        <EmptyState message="No control panels recorded." />
      )}
    </section>
  );
}
