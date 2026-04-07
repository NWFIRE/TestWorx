import { Resend } from "resend";

import { getOptionalEmailEnv } from "./env";

export type TransactionalEmailDeliveryResult = {
  sent: boolean;
  provider: "resend";
  messageId: string | null;
  error: string | null;
  reason: "sent" | "missing_config" | "provider_error";
};

type BaseEmailPayload = {
  recipientEmail: string;
  recipientName: string;
  tenantName: string;
};

type EmailAttachment = {
  fileName: string;
  content: string;
};

type WorkspaceInviteEmailPayload = BaseEmailPayload & {
  inviteUrl: string;
  inviterName: string;
  roleLabel: string;
  customerCompanyName?: string | null;
  portalInvite?: boolean;
};

type PasswordResetEmailPayload = BaseEmailPayload & {
  resetUrl: string;
};

type QuoteEmailPayload = BaseEmailPayload & {
  quoteNumber: string;
  customerName: string;
  siteName?: string | null;
  quoteUrl: string;
  subjectLine: string;
  messageBody: string;
  attachment: EmailAttachment;
  expiresAt?: Date | null;
};

function buildShell({
  eyebrow,
  title,
  body,
  actionHref,
  actionLabel,
  footer
}: {
  eyebrow: string;
  title: string;
  body: string[];
  actionHref: string;
  actionLabel: string;
  footer: string;
}) {
  return `
    <div style="background:#f3f6fb;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ef;border-radius:28px;overflow:hidden;">
        <div style="padding:32px 32px 20px;background:linear-gradient(135deg,#173a63,#295f9a);color:#ffffff;">
          <div style="font-size:11px;letter-spacing:0.24em;text-transform:uppercase;opacity:0.78;">${eyebrow}</div>
          <h1 style="margin:12px 0 0;font-size:28px;line-height:1.15;font-weight:700;">${title}</h1>
        </div>
        <div style="padding:28px 32px 32px;">
          ${body.map((paragraph) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">${paragraph}</p>`).join("")}
          <div style="margin:28px 0;">
            <a href="${actionHref}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:14px 20px;border-radius:16px;">${actionLabel}</a>
          </div>
          <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#64748b;">If the button above does not work, copy and paste this link into your browser:</p>
          <p style="margin:0 0 24px;font-size:12px;line-height:1.6;word-break:break-all;color:#2563eb;">${actionHref}</p>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">${footer}</p>
        </div>
      </div>
    </div>
  `;
}

async function sendWithResend(input: { to: string; subject: string; html: string; attachments?: EmailAttachment[] }): Promise<TransactionalEmailDeliveryResult> {
  const env = getOptionalEmailEnv();
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    return {
      sent: false,
      provider: "resend",
      messageId: null,
      error: "Outbound email is not configured.",
      reason: "missing_config"
    };
  }

  const resend = new Resend(env.RESEND_API_KEY);

  try {
    const result = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: input.to,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments?.map((attachment) => ({
        filename: attachment.fileName,
        content: attachment.content
      }))
    });

    if (result.error) {
      return {
        sent: false,
        provider: "resend",
        messageId: null,
        error: result.error.message,
        reason: "provider_error"
      };
    }

    return {
      sent: true,
      provider: "resend",
      messageId: result.data?.id ?? null,
      error: null,
      reason: "sent"
    };
  } catch (error) {
    return {
      sent: false,
      provider: "resend",
      messageId: null,
      error: error instanceof Error ? error.message : "Unable to send email.",
      reason: "provider_error"
    };
  }
}

export async function sendWorkspaceInviteEmail(payload: WorkspaceInviteEmailPayload) {
  const subject = payload.portalInvite
    ? `${payload.tenantName} invited you to the TradeWorx customer portal`
    : `${payload.tenantName} invited you to TradeWorx`;

  return sendWithResend({
    to: payload.recipientEmail,
    subject,
    html: buildShell({
      eyebrow: payload.portalInvite ? "Customer portal invite" : "Workspace invite",
      title: payload.portalInvite ? "You’ve been invited to the customer portal" : "You’ve been invited to TradeWorx",
      body: [
        `Hi ${payload.recipientName},`,
        `${payload.inviterName} invited you to join ${payload.tenantName} as ${payload.roleLabel}.`,
        payload.customerCompanyName
          ? `This invite is linked to ${payload.customerCompanyName} so you enter the correct customer portal workspace.`
          : "Use the secure button below to create your password and finish setup."
      ],
      actionHref: payload.inviteUrl,
      actionLabel: "Accept invite",
      footer: "This invite is single-use and expires automatically for security."
    })
  });
}

export async function sendWorkspacePasswordResetEmail(payload: PasswordResetEmailPayload) {
  return sendWithResend({
    to: payload.recipientEmail,
    subject: `Reset your ${payload.tenantName} TradeWorx password`,
    html: buildShell({
      eyebrow: "Password reset",
      title: "Reset your password",
      body: [
        `Hi ${payload.recipientName},`,
        `A workspace administrator created a secure password reset for your ${payload.tenantName} TradeWorx account.`,
        "Use the button below to choose a new password and return to the app."
      ],
      actionHref: payload.resetUrl,
      actionLabel: "Reset password",
      footer: "This reset link is single-use and expires automatically for security."
    })
  });
}

export async function sendQuoteEmail(payload: QuoteEmailPayload) {
  return sendWithResend({
    to: payload.recipientEmail,
    subject: payload.subjectLine,
    attachments: [payload.attachment],
    html: buildShell({
      eyebrow: "Customer quote",
      title: `Quote ${payload.quoteNumber} is ready`,
      body: [
        `Hi ${payload.recipientName},`,
        `A new quote is ready from ${payload.tenantName} for ${payload.customerName}${payload.siteName ? ` at ${payload.siteName}` : ""}.`,
        payload.messageBody,
        payload.expiresAt ? `This quote is available for review through ${payload.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.` : "Use the secure link below to review the quote online, download the PDF, and approve or decline it when you're ready."
      ],
      actionHref: payload.quoteUrl,
      actionLabel: "View quote",
      footer: "The attached PDF is a customer-ready copy of the quote, but the secure online quote page is the fastest way to review details and approve or decline it."
    })
  });
}
