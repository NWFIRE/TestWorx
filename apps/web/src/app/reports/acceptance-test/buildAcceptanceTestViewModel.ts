import "server-only";

import { cleanText } from "@testworx/lib/pdf-v2/core/formatting/text";
import { buildAcceptanceTestRenderModel } from "@testworx/lib/pdf-v2/acceptance-test/adapter/buildAcceptanceTestRenderModel";

import type { AcceptanceTestViewModel } from "./types/acceptanceTest";

type AcceptanceViewSource = Parameters<typeof buildAcceptanceTestRenderModel>[0] & {
  draft?: {
    sections?: Record<string, { fields?: Record<string, unknown> }>;
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
