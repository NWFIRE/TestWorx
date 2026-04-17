import { MetricGrid } from "../../core/components/MetricGrid";
import { PdfShell } from "../../core/components/PdfShell";
import { ReportHeader } from "../../core/components/ReportHeader";
import { SummaryStrip } from "../../core/components/SummaryStrip";

import { AcceptancePage1 } from "../components/AcceptancePage1";
import { CommentsSection } from "../components/CommentsSection";
import { InstallerSection } from "../components/InstallerSection";
import { PropertySection } from "../components/PropertySection";
import { SignaturesSection } from "../components/SignaturesSection";
import { SystemInfoSection } from "../components/SystemInfoSection";
import { TestResultsSection } from "../components/TestResultsSection";
import { WitnessSection } from "../components/WitnessSection";
import type { AcceptanceTestRenderModel } from "../types/acceptanceTestRenderModel";

function buildHeader(model: AcceptanceTestRenderModel) {
  return (
    <ReportHeader
      company={{
        name: model.company.name,
        logoUrl: model.company.logoUrl,
        phone: model.company.phone,
        email: model.company.email,
        website: model.company.website,
        address: [model.company.addressLine1, model.company.cityStateZip].filter(Boolean).join(", ")
      }}
      report={{
        title: model.report.title,
        reportId: model.report.reportId ?? "",
        inspectionDate: model.report.completionDate ?? ""
      }}
    />
  );
}

export function AcceptanceTestDocument({ model }: { model: AcceptanceTestRenderModel }) {
  const needsSecondPage = Boolean(model.comments && model.comments.length > 500);
  const header = buildHeader(model);

  return (
    <>
      <PdfShell header={header} pageNumber={1} totalPages={needsSecondPage ? 2 : 1}>
        <AcceptancePage1 model={model} />
        <PropertySection model={model} />
        <InstallerSection model={model} />
        <SystemInfoSection model={model} />
        <TestResultsSection model={model} />
        <SummaryStrip
          items={[
            { label: "Total Tests", value: model.summary.total },
            { label: "Passed", value: model.summary.passed, tone: "success" },
            { label: "Failed", value: model.summary.failed, tone: model.summary.failed > 0 ? "danger" : "default" }
          ]}
        />
        <WitnessSection model={model} />
        {!needsSecondPage ? (
          <>
            <CommentsSection model={model} />
            <SignaturesSection model={model} />
          </>
        ) : null}
      </PdfShell>
      {needsSecondPage ? (
        <PdfShell header={header} pageNumber={2} totalPages={2}>
          <MetricGrid
            columns={3}
            items={[
              { label: "Report Result", value: model.report.result, tone: model.report.result === "Pass" ? "success" : model.report.result === "Fail" ? "danger" : "warning" },
              { label: "Passed", value: model.summary.passed, tone: "success" },
              { label: "Failed", value: model.summary.failed, tone: model.summary.failed > 0 ? "danger" : "default" }
            ]}
          />
          <CommentsSection model={model} />
          <SignaturesSection model={model} />
        </PdfShell>
      ) : null}
    </>
  );
}
