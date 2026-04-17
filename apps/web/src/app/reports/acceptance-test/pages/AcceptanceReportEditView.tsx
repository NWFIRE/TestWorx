import type { ReactNode } from "react";

import { AcceptanceReportAssignmentView } from "./AcceptanceReportAssignmentView";
import type { AcceptanceTestViewModel } from "../types/acceptanceTest";

export function AcceptanceReportEditView({
  model,
  editor
}: {
  model: AcceptanceTestViewModel;
  editor: ReactNode;
}) {
  return (
    <div className="space-y-8">
      <AcceptanceReportAssignmentView model={model} />
      <section className="rounded-[30px] border border-slate-200/80 bg-white p-3 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
        {editor}
      </section>
    </div>
  );
}
