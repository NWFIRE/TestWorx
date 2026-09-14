import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({ Resend: vi.fn().mockImplementation(() => ({ emails: { send } })) }));

const valid = {
  requestId: "eb78dc82-616f-4d99-8b66-437ef9a2d559",
  kind: "trial",
  name: "Taylor Example",
  company: "Example Services",
  email: "Taylor@Example.com",
  phone: "",
  plan: "pro",
  teamSize: "6-15",
  availability: "",
  message: "We need inspection scheduling.",
  consent: true,
  website: ""
};

describe("marketing inquiries", () => {
  beforeEach(() => {
    vi.resetModules();
    send.mockReset().mockResolvedValue({ data: { id: "email_1" }, error: null });
    vi.stubEnv("RESEND_API_KEY", "test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "noreply@tradeworx.net");
    vi.stubEnv("MARKETING_INQUIRY_EMAIL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sends trial details to the fixed business recipient, not the visitor", async () => {
    const { submitMarketingInquiry } = await import("../marketing-inquiries");
    expect(await submitMarketingInquiry(valid, "test-ip")).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: "noreply@tradeworx.net", to: "hello@tradeworx.net", replyTo: "taylor@example.com", subject: "TradeWorx: Free trial request",
      text: expect.stringContaining("Interested plan: pro")
    }), expect.objectContaining({ idempotencyKey: expect.stringContaining(valid.requestId) }));
    expect(send.mock.calls[0][0]).not.toHaveProperty("html");
  });

  it("sends demo availability and supports a configured recipient", async () => {
    vi.stubEnv("MARKETING_INQUIRY_EMAIL", "sales@example.com");
    const { submitMarketingInquiry } = await import("../marketing-inquiries");
    await submitMarketingInquiry({ ...valid, kind: "demo", availability: "Tuesday, Central time" }, "test-ip");
    expect(send.mock.calls[0][0]).toMatchObject({ to: "sales@example.com", subject: "TradeWorx: Demo request", text: expect.stringContaining("Tuesday, Central time") });
  });

  it.each([
    { email: "bad-email" }, { name: "  " }, { company: "" }, { consent: false },
    { kind: "admin" }, { plan: "invalid" }, { website: "spam" }, { requestId: "invalid" },
    { message: "x".repeat(2001) }, { to: "attacker@example.com" }, { name: "Injected\r\nHeader" }
  ])("rejects invalid data without sending: %j", async (invalid) => {
    const { submitMarketingInquiry } = await import("../marketing-inquiries");
    expect((await submitMarketingInquiry({ ...valid, ...invalid }, "test-ip")).ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(["missing-key", "invalid-sender", "invalid-recipient", "provider-error", "missing-id", "exception"])("does not claim success for %s", async (failure) => {
    if (failure === "missing-key") vi.stubEnv("RESEND_API_KEY", "");
    if (failure === "invalid-sender") vi.stubEnv("RESEND_FROM_EMAIL", "bad");
    if (failure === "invalid-recipient") vi.stubEnv("MARKETING_INQUIRY_EMAIL", "bad");
    if (failure === "provider-error") send.mockResolvedValue({ data: null, error: { message: "Private provider details" } });
    if (failure === "missing-id") send.mockResolvedValue({ data: {}, error: null });
    if (failure === "exception") send.mockRejectedValue(new Error("private failure"));
    const { submitMarketingInquiry } = await import("../marketing-inquiries");
    const result = await submitMarketingInquiry(valid, "test-ip");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("try again");
    expect(result.error).not.toContain("private");
  });

  it("reuses provider idempotency keys for retries but not changed content", async () => {
    const { submitMarketingInquiry } = await import("../marketing-inquiries");
    await submitMarketingInquiry(valid, "test-ip");
    await submitMarketingInquiry(valid, "test-ip");
    await submitMarketingInquiry({ ...valid, message: "Updated request" }, "test-ip");
    expect(send.mock.calls[0][1].idempotencyKey).toBe(send.mock.calls[1][1].idempotencyKey);
    expect(send.mock.calls[0][1].idempotencyKey).not.toBe(send.mock.calls[2][1].idempotencyKey);
  });

  it("limits repeated emails even across client addresses", async () => {
    const { submitMarketingInquiry } = await import("../marketing-inquiries");
    for (let i = 0; i < 5; i++) expect((await submitMarketingInquiry(valid, `ip-${i}`)).ok).toBe(true);
    expect((await submitMarketingInquiry(valid, "another-ip")).error).toContain("Too many requests");
    expect(send).toHaveBeenCalledTimes(5);
  });

  it("expires throttles after an hour and isolates keys", async () => {
    const { createInquiryLimiter } = await import("../marketing-inquiries");
    const allow = createInquiryLimiter();
    expect(allow("one", 1, 0)).toBe(true);
    expect(allow("one", 1, 1)).toBe(false);
    expect(allow("two", 1, 1)).toBe(true);
    expect(allow("one", 1, 3600000)).toBe(true);
  });
});
