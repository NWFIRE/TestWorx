import "server-only";

import type { PdfInput } from "@testworx/lib/pdf-v2/types";
import { cleanText } from "@testworx/lib/pdf-v2/core/formatting/text";
import { buildAcceptanceTestRenderModel } from "@testworx/lib/pdf-v2/acceptance-test/adapter/buildAcceptanceTestRenderModel";

import type { AcceptanceTestViewModel } from "./types/acceptanceTest";

type AcceptanceViewSource = PdfInput & {
  report: PdfInput["report"] & {
    status?: string | null;
    assignedTo?: string | null;
  };
};

export function buildAcceptanceTestViewModel(input: AcceptanceViewSource): AcceptanceTestViewModel {
  const model = buildAcceptanceTestRenderModel(input);
  const testFields = input?.draft?.sections?.["test-results"]?.fields ?? {};

  return {
    ...model,
    tests: model.tests.map((test) => ({
      ...test,
      displayResult: cleanText(testFields[test.key]) ? test.displayResult : "Pending"
    }))
  };
}
