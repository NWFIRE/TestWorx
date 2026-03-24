import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | TradeWorx",
  description: "Terms of Service for TradeWorx."
};

const updatedOn = "March 24, 2026";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-paper px-6 py-12 text-ink">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">TradeWorx</p>
          <h1 className="text-4xl font-semibold tracking-tight text-ink">Terms of Service</h1>
          <p className="text-sm text-slate-500">Last updated {updatedOn}</p>
        </header>

        <section className="space-y-4 text-sm leading-7 text-slate-700">
          <p>
            These Terms of Service govern access to and use of the TradeWorx platform by customer organizations and their
            authorized users.
          </p>
          <p>
            By accessing or using TradeWorx, you agree to these terms on behalf of yourself and, if applicable, the
            company or organization you represent.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">Use of the Service</h2>
          <div className="space-y-3 text-sm leading-7 text-slate-700">
            <p>TradeWorx may be used only for lawful business purposes related to inspections, scheduling, reporting, documents, customer communications, and related workflows.</p>
            <p>Customers are responsible for the actions of their users, the accuracy of submitted data, and maintaining the confidentiality of account credentials.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">Customer Data</h2>
          <div className="space-y-3 text-sm leading-7 text-slate-700">
            <p>Customers retain responsibility for the data they upload or create in TradeWorx, including inspections, reports, attachments, signatures, and customer records.</p>
            <p>TradeWorx may process customer data as needed to provide, support, secure, and improve the service.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">Integrations</h2>
          <div className="space-y-3 text-sm leading-7 text-slate-700">
            <p>TradeWorx may connect to third-party services such as QuickBooks and payment providers. Use of those integrations may also be subject to the third party&apos;s terms and policies.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">Availability and Changes</h2>
          <div className="space-y-3 text-sm leading-7 text-slate-700">
            <p>We may update, improve, suspend, or discontinue features from time to time. We aim to operate the service reliably, but uninterrupted availability is not guaranteed.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">Disclaimer and Limitation</h2>
          <div className="space-y-3 text-sm leading-7 text-slate-700">
            <p>TradeWorx is provided on an as-available and as-provided basis to the maximum extent permitted by law. Except as expressly agreed in writing, we disclaim implied warranties, including merchantability, fitness for a particular purpose, and non-infringement.</p>
            <p>To the maximum extent permitted by law, TradeWorx will not be liable for indirect, incidental, special, consequential, or punitive damages, or for loss of profits, revenue, data, or business opportunity.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">Termination</h2>
          <div className="space-y-3 text-sm leading-7 text-slate-700">
            <p>We may suspend or terminate access for violations of these terms, security risks, nonpayment where applicable, or misuse of the service.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">Contact</h2>
          <p className="text-sm leading-7 text-slate-700">
            For questions about these terms, contact TradeWorx at <a className="text-[color:rgb(var(--tenant-primary-rgb))] underline" href="mailto:Support@tradeworx.net">Support@tradeworx.net</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
