import { describe, expect, it } from "vitest";

import { getQuoteTermsContent, quoteDepositRequirementBody } from "../quote-terms";

describe("quote terms", () => {
  it("omits the deposit requirement unless explicitly selected", () => {
    const terms = getQuoteTermsContent();

    expect(terms.emphasisTitle).toBeUndefined();
    expect(terms.emphasisBody).toBeUndefined();
  });

  it("includes the deposit requirement when selected", () => {
    const terms = getQuoteTermsContent({ includeDepositRequirement: true });

    expect(terms.emphasisTitle).toBe("Deposit Requirement");
    expect(terms.emphasisBody).toBe(quoteDepositRequirementBody);
  });
});
