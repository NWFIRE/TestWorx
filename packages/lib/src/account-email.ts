import { Resend } from "resend";

import { getOptionalEmailEnv } from "./env";
import { buildQuoteEmailDefaultMessage, buildQuoteEmailGreeting } from "./quote-email";

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

type EmailShellBranding = {
  companyName: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logoDataUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
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

type QuoteReminderEmailPayload = BaseEmailPayload & {
  quoteNumber: string;
  customerName: string;
  siteName?: string | null;
  quoteUrl: string;
  quoteTotal?: string | null;
  reminderTitle: string;
  subjectLine: string;
  messageBody: string;
  actionLabel?: string;
  expiresAt?: Date | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function textToHtmlParagraphs(input: string) {
  return input
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => escapeHtml(paragraph).replaceAll("\n", "<br />"));
}

function buildBrandedShell({
  eyebrow,
  title,
  body,
  actionHref,
  actionLabel,
  footer,
  branding
}: {
  eyebrow: string;
  title: string;
  body: string[];
  actionHref?: string;
  actionLabel?: string;
  footer?: string;
  branding?: EmailShellBranding;
}) {
  const primaryColor = branding?.primaryColor?.trim() || "#173a63";
  const accentColor = branding?.accentColor?.trim() || "#2563eb";
  const companyName = branding?.companyName?.trim() || "";
  const logoMarkup = branding?.logoDataUrl
    ? `<img alt="${escapeHtml(companyName || "Company logo")}" src="${branding.logoDataUrl}" style="display:block;max-height:36px;max-width:164px;width:auto;height:auto;" />`
    : "";
  const contactBits = [branding?.phone?.trim(), branding?.email?.trim(), branding?.website?.trim()].filter(Boolean);

  return `
    <div style="background:#f3f6fb;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbe3ef;border-radius:28px;overflow:hidden;">
        <div style="padding:28px 32px 20px;background:linear-gradient(135deg,${primaryColor},${accentColor});color:#ffffff;">
          ${
            companyName || logoMarkup
              ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;">
                  <div>${logoMarkup}</div>
                  ${companyName ? `<div style="font-size:13px;line-height:1.5;font-weight:600;text-align:right;opacity:0.92;">${escapeHtml(companyName)}</div>` : ""}
                </div>`
              : ""
          }
          <div style="font-size:11px;letter-spacing:0.24em;text-transform:uppercase;opacity:0.78;">${escapeHtml(eyebrow)}</div>
          <h1 style="margin:12px 0 0;font-size:28px;line-height:1.15;font-weight:700;">${title}</h1>
        </div>
        <div style="padding:28px 32px 32px;">
          ${body.map((paragraph) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">${paragraph}</p>`).join("")}
          ${
            actionHref && actionLabel
              ? `<div style="margin:28px 0;">
                  <a href="${actionHref}" style="display:inline-block;background:${accentColor};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:14px 20px;border-radius:16px;">${escapeHtml(actionLabel)}</a>
                </div>
                <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#64748b;">If the button above does not work, copy and paste this link into your browser:</p>
                <p style="margin:0 0 24px;font-size:12px;line-height:1.6;word-break:break-all;color:${accentColor};">${escapeHtml(actionHref)}</p>`
              : ""
          }
          ${
            companyName || contactBits.length
              ? `<div style="margin-top:24px;padding-top:18px;border-top:1px solid #e2e8f0;">
                  ${companyName ? `<p style="margin:0 0 6px;font-size:13px;font-weight:700;line-height:1.6;color:#0f172a;">${escapeHtml(companyName)}</p>` : ""}
                  ${contactBits.length ? `<p style="margin:0;font-size:12px;line-height:1.7;color:#64748b;">${contactBits.map((item) => escapeHtml(item ?? "")).join(" &bull; ")}</p>` : ""}
                </div>`
              : ""
          }
          ${footer ? `<p style="margin:${companyName || contactBits.length ? "16px" : "0"} 0 0;font-size:12px;line-height:1.6;color:#64748b;">${footer}</p>` : ""}
        </div>
      </div>
    </div>
  `;
}

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
  return buildBrandedShell({
    eyebrow,
    title,
    body,
    actionHref,
    actionLabel,
    footer
  });
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
      title: payload.portalInvite ? "You've been invited to the customer portal" : "You've been invited to TradeWorx",
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
  const greeting = buildQuoteEmailGreeting(payload.recipientName);
  const proposalMessage = payload.messageBody.trim() || buildQuoteEmailDefaultMessage();
  const proposalWindow = payload.expiresAt
    ? `Please review it by ${payload.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`
    : null;
  const companySignoff = payload.tenantName.trim();

  return sendWithResend({
    to: payload.recipientEmail,
    subject: payload.subjectLine,
    attachments: [payload.attachment],
    html: buildShell({
      eyebrow: "Proposal ready",
      title: "Your proposal is ready for review",
      body: [
        greeting,
        "Your proposal is ready for review.",
        proposalMessage,
        proposalWindow ?? "Use the secure link below to review the proposal online and approve it when you're ready.",
        "If you have any questions, simply reply to this email and our team will be happy to assist.",
        companySignoff ? `Thank you,<br />${companySignoff}` : "Thank you,"
      ],
      actionHref: payload.quoteUrl,
      actionLabel: "Review Proposal",
      footer: "The attached PDF is included for convenience, but the secure proposal link is the fastest way to review details and approve online."
    })
  });
}

export async function sendQuoteReminderEmail(payload: QuoteReminderEmailPayload) {
  return sendWithResend({
    to: payload.recipientEmail,
    subject: payload.subjectLine,
    html: buildShell({
      eyebrow: "Quote reminder",
      title: payload.reminderTitle,
      body: [
        `Hi ${payload.recipientName},`,
        `We're following up on quote ${payload.quoteNumber} from ${payload.tenantName} for ${payload.customerName}${payload.siteName ? ` at ${payload.siteName}` : ""}.`,
        payload.quoteTotal ? `Quote total: ${payload.quoteTotal}.` : "",
        payload.messageBody,
        payload.expiresAt ? `This quote is set to expire on ${payload.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.` : ""
      ].filter(Boolean),
      actionHref: payload.quoteUrl,
      actionLabel: payload.actionLabel ?? "View quote",
      footer: "Use the secure online quote page to review details, download the PDF, and approve or decline when you're ready."
    })
  });
}

export async function sendInspectionReminderEmail(payload: BaseEmailPayload & {
  subjectLine: string;
  bodyText: string;
  branding: EmailShellBranding;
}) {
  return sendWithResend({
    to: payload.recipientEmail,
    subject: payload.subjectLine,
    html: buildBrandedShell({
      eyebrow: "Inspection reminder",
      title: "Your fire inspection is due this month",
      body: textToHtmlParagraphs(payload.bodyText),
      footer: "If your inspection has already been completed or scheduled, please disregard this message.",
      branding: payload.branding
    })
  });
}
