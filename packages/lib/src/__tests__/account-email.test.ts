import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: sendMock
    }
  }))
}));

describe("account email sender selection", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("RESEND_API_KEY", "resend_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "quotes@tradeworx.net");
    sendMock.mockResolvedValue({ data: { id: "msg_1" }, error: null });

    const { resetServerEnvForTests } = await import("../env");
    resetServerEnvForTests();
  });

  it("uses noreply for non-quote transactional emails", async () => {
    const { sendWorkspaceInviteEmail } = await import("../account-email");

    await sendWorkspaceInviteEmail({
      recipientEmail: "customer@example.com",
      recipientName: "Taylor Customer",
      tenantName: "TradeWorx",
      inviteUrl: "https://www.tradeworx.net/invite/token",
      inviterName: "Office Admin",
      roleLabel: "Customer"
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "noreply@tradeworx.net"
      })
    );
  });

  it("keeps the configured sender for quote emails", async () => {
    const { sendQuoteEmail } = await import("../account-email");

    await sendQuoteEmail({
      recipientEmail: "customer@example.com",
      recipientName: "Taylor Customer",
      tenantName: "TradeWorx",
      quoteNumber: "Q-2026-0001",
      customerName: "Taylor Customer",
      quoteUrl: "https://www.tradeworx.net/quote/token",
      subjectLine: "Your proposal is ready",
      messageBody: "Please review the attached quote.",
      attachment: {
        fileName: "quote.pdf",
        content: "JVBERi0xLjQK"
      }
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "quotes@tradeworx.net"
      })
    );
  });
});
