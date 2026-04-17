import { ComplianceBlock } from "../../core/components/ComplianceBlock";
import { IdentityBand } from "../../core/components/IdentityBand";
import { MetadataGrid } from "../../core/components/MetadataGrid";
import { MetricGrid } from "../../core/components/MetricGrid";
import { OutcomeHero } from "../../core/components/OutcomeHero";

import type { FireAlarmReportRenderModel } from "../types/fireAlarmRenderModel";

export function FireAlarmPage1({ model }: { model: FireAlarmReportRenderModel }) {
  return (
    <>
      <OutcomeHero
        completionPercent={model.report.completionPercent}
        deficiencyCount={model.deficiencies.length}
        narrative={model.report.narrative}
        result={model.report.result ?? "Pass"}
      />
      <ComplianceBlock codes={model.compliance.codes} />
      <IdentityBand {...model.identity} />
      <MetadataGrid columns={3} items={model.page1Metadata} />
      <MetricGrid columns={4} items={model.systemSummary} />
    </>
  );
}
