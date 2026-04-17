import { Badge } from "../../core/components/Badge";
import { DataTable } from "../../core/components/DataTable";
import { SectionHeader } from "../../core/components/SectionHeader";

import type { AcceptanceTestRenderModel } from "../types/acceptanceTestRenderModel";

export function TestResultsSection({ model }: { model: AcceptanceTestRenderModel }) {
  return (
    <section className="pdf-section">
      <SectionHeader title="Acceptance Test Results" subtitle="NFPA 17A acceptance checkpoints normalized to one clear result system." />
      <DataTable
        density="compact"
        rows={model.tests}
        columns={[
          {
            key: "label",
            header: "Test",
            width: "58%",
            render: (row) => row.label
          },
          {
            key: "code",
            header: "Code",
            width: "16%",
            render: (row) => row.code ?? "",
            isEmpty: (row) => !row.code,
            hideIfAllRowsEmpty: true
          },
          {
            key: "result",
            header: "Result",
            width: "26%",
            render: (row) => <Badge tone={row.displayResult === "Pass" ? "success" : "danger"}>{row.displayResult}</Badge>
          }
        ]}
      />
    </section>
  );
}
