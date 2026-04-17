import { AcceptanceReportView } from "./AcceptanceReportView";
import type { AcceptanceTestViewModel } from "../types/acceptanceTest";

export function AcceptanceReportAssignmentView({ model }: { model: AcceptanceTestViewModel }) {
  return (
    <div className="space-y-6">
      {model.report.status && model.report.status !== "Finalized" ? (
        <section className="rounded-[28px] border border-blue-200 bg-blue-50/70 px-5 py-4 text-sm text-blue-900">
          <p className="font-semibold">Assignment-ready acceptance test</p>
          <p className="mt-2 leading-6">
            {model.report.assignedTo
              ? `This report is currently assigned to ${model.report.assignedTo}.`
              : "This report is ready to be assigned and completed in the field."}
          </p>
        </section>
      ) : null}
      <AcceptanceReportView model={model} />
    </div>
  );
}
