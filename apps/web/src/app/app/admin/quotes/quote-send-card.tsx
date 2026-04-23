"use client";

import { useState, useTransition } from "react";

import { ActionButton } from "@/app/action-button";
import { useToast } from "@/app/toast-provider";
import { buildQuoteEmailDefaultMessage, buildQuoteEmailSubject } from "@testworx/lib";

import { CopyQuoteLinkButton } from "./copy-quote-link-button";
import { regenerateQuoteLinkAction, sendQuoteAction } from "./actions";

type QuoteSendCardProps = {
  quoteId: string;
  quoteNumber: string;
  companyName: string;
  recipientEmail: string | null;
  deliverySubject: string | null;
  deliveryBody: string | null;
  hostedQuoteUrl: string | null;
  sentAt: Date | null;
};

export function QuoteSendCard(props: QuoteSendCardProps) {
  const [pending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<"send" | "link" | null>(null);
  const [state, setState] = useState({
    recipientEmail: props.recipientEmail ?? "",
    ccEmails: "",
    subject: props.deliverySubject ?? buildQuoteEmailSubject({ companyName: props.companyName, quoteNumber: props.quoteNumber }),
    message: props.deliveryBody ?? buildQuoteEmailDefaultMessage(),
    hostedQuoteUrl: props.hostedQuoteUrl,
    sentAt: props.sentAt
  });
  const { showToast } = useToast();

  function handleSend() {
    setActiveAction("send");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("quoteId", props.quoteId);
      formData.set("recipientEmail", state.recipientEmail);
      formData.set("ccEmails", state.ccEmails);
      formData.set("subject", state.subject);
      formData.set("message", state.message);
      const result = await sendQuoteAction(formData);
      const detail = result?.detail;
      if (result?.ok && detail) {
        setState((current) => ({
          ...current,
          recipientEmail: detail.recipientEmail ?? current.recipientEmail,
          subject: detail.deliverySubject ?? current.subject,
          message: detail.deliveryBody ?? current.message,
          hostedQuoteUrl: detail.hostedQuoteUrl ?? current.hostedQuoteUrl,
          sentAt: detail.sentAt ?? current.sentAt
        }));
        showToast({ title: result.message ?? "Quote sent", tone: "success" });
      } else if (result?.error) {
        showToast({ title: result.error, tone: "error" });
      }
      setActiveAction(null);
    });
  }

  function handleRegenerateLink() {
    setActiveAction("link");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("quoteId", props.quoteId);
      const result = await regenerateQuoteLinkAction(formData);
      const detail = result?.detail;
      if (result?.ok && detail) {
        setState((current) => ({
          ...current,
          hostedQuoteUrl: detail.hostedQuoteUrl ?? current.hostedQuoteUrl
        }));
        showToast({ title: result.message ?? "Hosted quote link refreshed", tone: "success" });
      } else if (result?.error) {
        showToast({ title: result.error, tone: "error" });
      }
      setActiveAction(null);
    });
  }

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <h2 className="text-xl font-semibold text-slate-950">Send quote</h2>
      <p className="mt-2 text-sm text-slate-500">Email the customer a secure hosted quote link with the branded PDF attached. The email CTA opens the online approval experience first.</p>
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">Recipient</span>
          <input className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900" onChange={(event) => setState((current) => ({ ...current, recipientEmail: event.target.value }))} type="email" value={state.recipientEmail} />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">CC</span>
          <input
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
            onChange={(event) => setState((current) => ({ ...current, ccEmails: event.target.value }))}
            placeholder="accounting@example.com, manager@example.com"
            value={state.ccEmails}
          />
          <span className="mt-2 block text-xs text-slate-500">Separate multiple CC addresses with commas.</span>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">Subject</span>
          <input className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900" onChange={(event) => setState((current) => ({ ...current, subject: event.target.value }))} value={state.subject} />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">Message</span>
          <textarea className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900" onChange={(event) => setState((current) => ({ ...current, message: event.target.value }))} value={state.message} />
        </label>
        <ActionButton className="w-full" onClick={handleSend} pending={pending && activeAction === "send"} pendingLabel="Sending..." tone="primary">
          {state.sentAt ? "Resend quote" : "Send quote"}
        </ActionButton>
      </div>
      {state.hostedQuoteUrl ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Hosted quote link</p>
          <p className="break-all text-sm text-slate-600">{state.hostedQuoteUrl}</p>
          <div className="flex flex-wrap gap-3">
            <CopyQuoteLinkButton href={state.hostedQuoteUrl} />
            <a className="pressable inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" href={state.hostedQuoteUrl} rel="noreferrer" target="_blank">
              Open hosted quote
            </a>
          </div>
        </div>
      ) : null}
      <ActionButton className="mt-4 w-full" onClick={handleRegenerateLink} pending={pending && activeAction === "link"} pendingLabel="Refreshing...">
        Regenerate secure link
      </ActionButton>
    </section>
  );
}
