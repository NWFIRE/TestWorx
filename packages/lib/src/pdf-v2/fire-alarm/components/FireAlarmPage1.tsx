import React from "react";

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
      <ComplianceBlock
        codes={model.compliance.references.map((reference) => reference.formattedReference)}
        references={model.compliance.references}
        title={model.compliance.title}
      />
      <IdentityBand {...model.identity} />
      <MetadataGrid columns={3} items={model.page1Metadata} />
      <MetadataGrid columns={3} items={model.monitoringInfo} />
      <MetricGrid columns={4} items={model.systemSummary} />
    </>
  );
}
