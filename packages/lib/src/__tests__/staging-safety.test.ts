import { describe, expect, it } from "vitest";
import { permitsStagingPassword } from "../staging-safety";
describe("hosted sandbox credentials", () => {
  it("allows local fixtures but refuses their passwords on hosted staging", () => {
    expect(permitsStagingPassword("Password123!", { APP_ENV: "staging", APP_URL: "http://localhost:3340" })).toBe(true);
    expect(permitsStagingPassword("Password123!", { APP_ENV: "staging", APP_URL: "https://sandbox.example.test" })).toBe(false);
    expect(permitsStagingPassword("StagingPassword123!", { APP_ENV: "staging", APP_URL: "http://localhost", VERCEL: "1" })).toBe(false);
    expect(permitsStagingPassword("unique-private-credential", { APP_ENV: "staging" })).toBe(true);
  });
});
