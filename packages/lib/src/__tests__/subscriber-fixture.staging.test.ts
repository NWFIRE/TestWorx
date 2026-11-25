import { describe, it } from "vitest";
const staging = process.env.APP_ENV === "staging" && process.env.DATABASE_URL === "postgresql://perf@127.0.0.1:55439/tradeworx_subscriber";
describe.skipIf(!staging)("isolated subscriber fixtures", () => {
  it("generates two-company branded reports using the real report renderer", async () => {
    const { prepareSubscriberFixtures } = await import("../../../../scripts/staging/fixtures");
    await prepareSubscriberFixtures();
  }, 120000);
});
