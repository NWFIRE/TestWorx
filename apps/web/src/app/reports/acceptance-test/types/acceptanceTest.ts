import type { AcceptanceTestRenderModel } from "@testworx/lib/pdf-v2/acceptance-test/types/acceptanceTestRenderModel";

export type AcceptanceTestViewModel = Omit<AcceptanceTestRenderModel, "tests"> & {
  tests: Array<
    Omit<AcceptanceTestRenderModel["tests"][number], "displayResult"> & {
      displayResult: "Pass" | "Fail" | "Pending";
    }
  >;
};
