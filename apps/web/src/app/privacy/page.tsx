import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | TradeWorx",
  description: "Privacy Policy for TradeWorx."
};

const updatedOn = "March 24, 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-paper px-6 py-12 text-ink">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">TradeWorx</p>
          <h1 className="text-4xl font-semibold tracking-tight text-ink">Privacy Policy</h1>
          <p className="text-sm text-slate-500">Last updated {updatedOn}</p>
        </header>

        <section className="space-y-4 text-sm leading-7 text-slate-700">
          <p>
            TradeWorx provides inspection scheduling, field reporting, customer portal access, document management, and
            related operational tools for fire and life safety service companies.
          </p>
          <p>
            This Privacy Policy explains what information we collect, how we use it, and the choices available to our
            customers and authorized users.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">Information We Collect</h2>
          <div className="space-y-3 text-sm leading-7 text-slate-700">
            <p>We may collect account, contact, company, inspection, site, asset, document, photo, signature, and billing information.</p>
            <p>We may also collect technical information needed to secure, operate, and improve the platform, such as log data and device/browser details.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">How We Use Information</h2>
          <div className="space-y-3 text-sm leading-7 text-slate-700">
            <p>We use information to provide the TradeWorx service, authenticate users, generate reports and documents, support customer access, process billing, and maintain platform security.</p>
            <p>We may also use information to troubleshoot issues, respond to support requests, and comply with legal obligations.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">Sharing</h2>
          <div className="space-y-3 text-sm leading-7 text-slate-700">
            <p>We do not sell personal information. We may share information with service providers and infrastructure partners that help us host, secure, store, transmit, and support the platform.</p>
            <p>We may also disclose information if required by law or to protect the rights, safety, and security of our customers, users, and services.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">Data Retention and Security</h2>
          <div className="space-y-3 text-sm leading-7 text-slate-700">
            <p>We retain information for as long as reasonably necessary to provide the service, meet contractual and legal requirements, resolve disputes, and enforce agreements.</p>
            <p>We use administrative, technical, and organizational safeguards designed to protect data, but no method of storage or transmission is completely secure.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">Your Choices</h2>
          <div className="space-y-3 text-sm leading-7 text-slate-700">
            <p>Authorized customer administrators can update company, customer, and operational information in the platform. Questions about access, correction, or deletion requests should be directed to the applicable TradeWorx account administrator.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">Contact</h2>
          <p className="text-sm leading-7 text-slate-700">
            For privacy questions, contact TradeWorx at <a className="text-[color:rgb(var(--tenant-primary-rgb))] underline" href="mailto:Support@tradeworx.net">Support@tradeworx.net</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
