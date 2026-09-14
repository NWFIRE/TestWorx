"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import type { MarketingInquiryKind, MarketingInquiryResult } from "@testworx/lib/marketing-inquiries-shared";

const inputClass = "mt-2 min-h-12 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100";

export function InquiryForm({ kind, initialPlan }: { kind: MarketingInquiryKind; initialPlan: string }) {
  const [result, setResult] = useState<MarketingInquiryResult | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const requestId = useRef<string | null>(null);
  const errorFor = (name: string) => result?.fieldErrors?.[name]?.[0];
  const feedback = (name: string) => errorFor(name) ? <span id={`${name}-error`} className="mt-1 block text-sm text-red-700">{errorFor(name)}</span> : null;
  const attributes = (name: string) => ({ "aria-invalid": Boolean(errorFor(name)), "aria-describedby": errorFor(name) ? `${name}-error` : undefined });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setResult(null);
    const data = new FormData(event.currentTarget);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);
    try {
      requestId.current ??= crypto.randomUUID();
      const response = await fetch("/api/marketing/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          ...Object.fromEntries(data),
          kind,
          requestId: requestId.current,
          consent: data.get("consent") === "on"
        })
      });
      const responseData: MarketingInquiryResult = await response.json();
      setResult(response.ok && responseData.ok ? { ok: true } : { ...responseData, ok: false });
    } catch {
      setResult({ ok: false, error: "We couldn't confirm your request was sent. Your details are still here. Please try again or email hello@tradeworx.net." });
    } finally {
      clearTimeout(timer);
      inFlight.current = false;
      setPending(false);
    }
  }

  if (result?.ok) {
    return <div role="status" className="rounded-xl border border-emerald-200 bg-white p-7 sm:p-10">
      <CheckCircle2 aria-hidden="true" className="h-10 w-10 text-emerald-700" />
      <h2 className="mt-5 text-2xl font-bold">{kind === "trial" ? "Your trial request is sent." : "Your demo request is sent."}</h2>
      <p className="mt-4 leading-7 text-slate-600">{kind === "trial" ? "Our team will contact you to arrange trial access and help you get started. No account or subscription has been created yet." : "Our team will contact you to agree on a demo time. Your appointment is not booked until we confirm it with you."}</p>
      <Link href="/" className="mt-7 inline-flex min-h-12 items-center rounded-md bg-blue-700 px-5 font-semibold text-white">Back to TradeWorx</Link>
    </div>;
  }

  return <form onSubmit={submit} className="min-w-0 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-label={kind === "trial" ? "Free trial request" : "Demo request"}>
    <h2 className="text-2xl font-bold">Tell us about your team</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">Fields marked with an asterisk are required.</p>
    <fieldset disabled={pending} className="mt-6 min-w-0 space-y-5 disabled:opacity-70">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block min-w-0 text-sm font-semibold">Your name *<input className={inputClass} name="name" autoComplete="name" required maxLength={100} {...attributes("name")} />{feedback("name")}</label>
        <label className="block min-w-0 text-sm font-semibold">Company *<input className={inputClass} name="company" autoComplete="organization" required maxLength={160} {...attributes("company")} />{feedback("company")}</label>
      </div>
      <label className="block text-sm font-semibold">Email *<input type="email" className={inputClass} name="email" autoComplete="email" required maxLength={254} {...attributes("email")} />{feedback("email")}</label>
      <label className="block text-sm font-semibold">Phone <span className="font-normal text-slate-500">(optional)</span><input type="tel" className={inputClass} name="phone" autoComplete="tel" maxLength={40} {...attributes("phone")} />{feedback("phone")}</label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block min-w-0 text-sm font-semibold">Team size<select name="teamSize" defaultValue="not_sure" className={inputClass}><option value="not_sure">Not sure yet</option><option value="1-5">1-5 people</option><option value="6-15">6-15 people</option><option value="16-50">16-50 people</option><option value="51+">51+ people</option></select></label>
        <label className="block min-w-0 text-sm font-semibold">Interested plan<select name="plan" defaultValue={initialPlan} className={inputClass}><option value="not_sure">Help me choose</option><option value="starter">Starter</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></label>
      </div>
      {kind === "demo" ? <label className="block text-sm font-semibold">Preferred availability and time zone <span className="font-normal text-slate-500">(optional)</span><input name="availability" placeholder="e.g. Tuesday afternoons, Central time" maxLength={200} className={inputClass} {...attributes("availability")} />{feedback("availability")}</label> : <input type="hidden" name="availability" value="" />}
      <label className="block text-sm font-semibold">What would you like help with? <span className="font-normal text-slate-500">(optional)</span><textarea name="message" rows={4} maxLength={2000} className={`${inputClass} resize-y`} placeholder="Tell us about your inspection and service workflows." {...attributes("message")} />{feedback("message")}</label>
      <div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className="flex items-start gap-3 text-sm leading-6 text-slate-600"><input className="mt-1 h-4 w-4 shrink-0" name="consent" type="checkbox" required {...attributes("consent")} /><span>I agree to be contacted about this request. Read our <Link className="text-blue-700 underline" href="/privacy">privacy policy</Link>.</span></label>
      {feedback("consent")}
      {result?.error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">{result.error}</p> : null}
      <button type="submit" className="min-h-12 w-full rounded-md bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-wait" disabled={pending}>{pending ? "Sending request..." : kind === "trial" ? "Request my free trial" : "Request a demo"}</button>
    </fieldset>
    <p className="mt-4 text-sm text-slate-500" aria-live="polite">{pending ? "Please wait while we send your request." : "Prefer email? "}{!pending ? <a href="mailto:hello@tradeworx.net" className="text-blue-700 underline">hello@tradeworx.net</a> : null}</p>
  </form>;
}
