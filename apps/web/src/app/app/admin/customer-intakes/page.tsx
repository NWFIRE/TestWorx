import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getCustomerIntakeWorkspace } from "@testworx/lib/server/index";

import { AppPageShell, KPIStatCard, PageHeader, SectionCard, StatusBadge } from "../operations-ui";
import { sendCustomerIntakeFormAction } from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : "";
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function statusTone(status: string) {
  if (status === "submitted") {
    return "amber" as const;
  }
  if (status === "approved") {
    return "emerald" as const;
  }
  if (status === "rejected" || status === "expired") {
    return "rose" as const;
  }
  return "blue" as const;
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export default async function CustomerIntakesPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app/admin");
  }

  const params = searchParams ? await searchParams : {};
  const notice = readParam(params, "notice");
  const error = readParam(params, "error");
  const data = await getCustomerIntakeWorkspace({
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  });

  return (
    <AppPageShell density="wide">
      <PageHeader
        eyebrow="Customer intake"
        title="Pending customer setup"
        description="Send secure branded intake forms, review submitted customer details, and approve new customer records before they enter operations."
        actions={
          <Link
            className="inline-flex min-h-11 items-center rounded-2xl border border-[color:var(--border-default)] bg-white px-4 py-3 text-sm font-semibold text-[color:var(--text-secondary)]"
            href="/app/admin/clients"
          >
            Back to clients
          </Link>
        }
        contentWidth="full"
      />

      {notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <KPIStatCard label="Pending review" note="Submitted forms waiting for office approval." tone="amber" value={data.counts.pending} />
        <KPIStatCard label="Sent links" note="Secure forms sent but not submitted yet." tone="blue" value={data.counts.sent} />
        <KPIStatCard label="Approved" note="Intakes converted into customer records." tone="emerald" value={data.counts.approved} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <SectionCard>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--tenant-primary)]">Send form</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">New customer intake</h2>
            <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
              Send a secure hosted setup form to a new customer before creating their account.
            </p>
          </div>
          <form action={sendCustomerIntakeFormAction} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Recipient email</span>
              <input
                className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-[var(--tenant-primary)] focus:ring-2 focus:ring-[color:rgb(var(--tenant-primary-rgb)/0.14)]"
                name="recipientEmail"
                placeholder="customer@example.com"
                required
                type="email"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Contact name</span>
              <input
                className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-[var(--tenant-primary)] focus:ring-2 focus:ring-[color:rgb(var(--tenant-primary-rgb)/0.14)]"
                name="recipientName"
                placeholder="Optional"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Optional note</span>
              <textarea
                className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--tenant-primary)] focus:ring-2 focus:ring-[color:rgb(var(--tenant-primary-rgb)/0.14)]"
                name="optionalMessage"
                placeholder="Add context for the customer if needed."
              />
            </label>
            <button className="btn-brand-primary pressable min-h-12 w-full rounded-2xl px-5 text-sm font-semibold" type="submit">
              Send Intake Form
            </button>
          </form>
        </SectionCard>

        <SectionCard>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--text-secondary)]">Review queue</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Customer intake requests</h2>
            </div>
            <p className="text-sm text-[color:var(--text-muted)]">{data.requests.length} recent requests</p>
          </div>
          <div className="mt-5 space-y-3">
            {data.requests.length ? data.requests.map((request) => {
              const submitted = request.submittedDataJson && typeof request.submittedDataJson === "object"
                ? request.submittedDataJson as Record<string, unknown>
                : null;
              const companyName = typeof submitted?.companyName === "string" ? submitted.companyName : "Awaiting customer details";
              const contactName = typeof submitted?.primaryContactName === "string" ? submitted.primaryContactName : request.recipientName;
              const requestedServiceType = typeof submitted?.requestedServiceType === "string" ? submitted.requestedServiceType : "Not submitted yet";
              return (
                <Link
                  className="block rounded-[24px] border border-slate-200 bg-slate-50/70 p-4 transition hover:border-[var(--tenant-primary)] hover:bg-white"
                  href={`/app/admin/customer-intakes/${request.id}`}
                  key={request.id}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">{companyName}</p>
                      <p className="mt-1 text-sm text-[color:var(--text-muted)]">{contactName || request.recipientEmail}</p>
                      <p className="mt-2 text-sm text-[color:var(--text-secondary)]">{requestedServiceType}</p>
                    </div>
                    <StatusBadge label={titleCase(request.status)} tone={statusTone(request.status)} />
                  </div>
                  <div className="mt-4 grid gap-2 text-xs text-[color:var(--text-muted)] sm:grid-cols-3">
                    <span>Sent: {formatDate(request.sentAt)}</span>
                    <span>Submitted: {formatDate(request.submittedAt)}</span>
                    <span>Files: {request.attachments.length}</span>
                  </div>
                </Link>
              );
            }) : (
              <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-[color:var(--text-muted)]">
                No customer intake requests yet.
              </div>
            )}
          </div>
        </SectionCard>
      </section>
    </AppPageShell>
  );
}
