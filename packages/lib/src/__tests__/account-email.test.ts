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
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@example.com:5432/test");
    vi.stubEnv("AUTH_SECRET", "test-auth-secret-value");
    vi.stubEnv("NEXTAUTH_URL", "https://www.tradeworx.net");
    vi.stubEnv("APP_URL", "https://www.tradeworx.net");
    vi.stubEnv("STORAGE_DRIVER", "inline");
    vi.stubEnv("RESEND_API_KEY", "resend_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "configured-sender@tradeworx.net");
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

  it("uses the quote mailbox for quote emails", async () => {
    const { sendQuoteEmail } = await import("../account-email");

    await sendQuoteEmail({
      recipientEmail: "customer@example.com",
      ccEmails: ["accounting@example.com", "manager@example.com"],
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
        from: "quotes@tradeworx.net",
        cc: ["accounting@example.com", "manager@example.com"]
      })
    );
  });

  it("uses the hello mailbox for customer intake emails", async () => {
    const { sendCustomerIntakeRequestEmail } = await import("../account-email");

    await sendCustomerIntakeRequestEmail({
      recipientEmail: "customer@example.com",
      recipientName: "Taylor Customer",
      tenantName: "Northwest Fire & Safety",
      intakeUrl: "https://www.tradeworx.net/intake/customer/token",
      senderName: "Office Admin",
      expiresAt: new Date("2026-05-01T00:00:00.000Z"),
      branding: {
        companyName: "Northwest Fire & Safety"
      }
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "hello@tradeworx.net"
      })
    );
  });

  it("uses the hello mailbox for customer reminder emails", async () => {
    const { sendCustomerBrandedEmail } = await import("../account-email");

    await sendCustomerBrandedEmail({
      recipientEmail: "customer@example.com",
      recipientName: "Taylor Customer",
      tenantName: "Northwest Fire & Safety",
      subjectLine: "Inspection reminder",
      bodyText: "Your inspection is due.",
      eyebrow: "Inspection reminder",
      title: "Your fire inspection is due",
      branding: {
        companyName: "Northwest Fire & Safety"
      }
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "hello@tradeworx.net"
      })
    );
  });
});
