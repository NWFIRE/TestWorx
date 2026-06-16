import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getCustomerIntakeReview, serviceSystemTypeLabels } from "@testworx/lib/server/index";

import { AppPageShell, PageHeader, SectionCard, StatusBadge } from "../../operations-ui";
import {
  approveCustomerIntakeAction,
  rejectCustomerIntakeAction,
  reopenCustomerIntakeAction,
  resendCustomerIntakeFormAction,
  updateCustomerIntakeSubmittedDataAction
} from "../actions";

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

function canResend(status: string) {
  return status === "sent" || status === "expired";
}

function DetailField({
  label,
  value
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">{label}</p>
      <p className="mt-2 text-sm leading-6 text-slate-800">{value?.trim() || "Not provided"}</p>
    </div>
  );
}

function AdjustmentField({
  label,
  name,
  value,
  required,
  type = "text"
}: {
  label: string;
  name: string;
  value: string | null | undefined;
  required?: boolean;
  type?: "email" | "tel" | "text" | "url";
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      <input
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--tenant-primary)]"
        defaultValue={value ?? ""}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}

function AdjustmentTextarea({
  label,
  name,
  value
}: {
  label: string;
  name: string;
  value: string | null | undefined;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      <textarea
        className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--tenant-primary)]"
        defaultValue={value ?? ""}
        name={name}
      />
    </label>
  );
}

export default async function CustomerIntakeDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ intakeId: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app/admin");
  }

  const { intakeId } = await params;
  const query = searchParams ? await searchParams : {};
  const notice = readParam(query, "notice");
  const error = readParam(query, "error");
  const data = await getCustomerIntakeReview({
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  }, intakeId);
  if (!data) {
    notFound();
  }

  const { request, submittedData, duplicateWarnings } = data;
  const systemTypes = submittedData?.systemTypes
    .map((value) => serviceSystemTypeLabels[value] ?? value)
    .join(", ");

  return (
    <AppPageShell density="wide">
      <PageHeader
        eyebrow="Customer intake"
        title={submittedData?.companyName ?? request.recipientEmail}
        description="Review the submitted customer, billing, site, and service request details before creating operational records."
        actions={<StatusBadge label={titleCase(request.status)} tone={statusTone(request.status)} />}
        backNavigation={{ fallbackHref: "/app/admin/customer-intakes", label: "Customer intakes" }}
        contentWidth="full"
      />

      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</div> : null}
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div> : null}

      {duplicateWarnings.length ? (
        <SectionCard className="border-amber-200 bg-amber-50/70">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">Duplicate warning</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Possible existing customer records</h2>
          <div className="mt-4 space-y-2">
            {duplicateWarnings.map((warning) => (
              <div className="rounded-2xl border border-amber-200 bg-white/80 px-4 py-3 text-sm text-amber-900" key={`${warning.type}-${warning.relatedId}`}>
                {warning.label}
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {request.status === "submitted" && submittedData ? (
        <SectionCard>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--text-secondary)]">Admin adjustments</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Correct intake details before approval</h2>
            </div>
          </div>
          <form action={updateCustomerIntakeSubmittedDataAction} className="mt-5 space-y-6">
            <input name="intakeRequestId" type="hidden" value={request.id} />
            <div className="grid gap-4 md:grid-cols-2">
              <AdjustmentField label="Company name" name="companyName" required value={submittedData.companyName} />
              <AdjustmentField label="Company website" name="companyWebsite" type="url" value={submittedData.companyWebsite} />
              <AdjustmentField label="Primary contact" name="primaryContactName" required value={submittedData.primaryContactName} />
              <AdjustmentField label="Primary email" name="primaryContactEmail" required type="email" value={submittedData.primaryContactEmail} />
              <AdjustmentField label="Primary phone" name="primaryContactPhone" required type="tel" value={submittedData.primaryContactPhone} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <AdjustmentField label="Billing contact" name="billingContactName" value={submittedData.billingContactName} />
              <AdjustmentField label="Billing email" name="billingEmail" required type="email" value={submittedData.billingEmail} />
              <AdjustmentField label="Billing phone" name="billingPhone" type="tel" value={submittedData.billingPhone} />
              <AdjustmentField label="Billing address line 1" name="billingAddressLine1" required value={submittedData.billingAddressLine1} />
              <AdjustmentField label="Billing address line 2" name="billingAddressLine2" value={submittedData.billingAddressLine2} />
              <AdjustmentField label="Billing city" name="billingCity" required value={submittedData.billingCity} />
              <AdjustmentField label="Billing state" name="billingState" required value={submittedData.billingState} />
              <AdjustmentField label="Billing ZIP/postal code" name="billingPostalCode" required value={submittedData.billingPostalCode} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <AdjustmentField label="Site name / identifier" name="siteName" value={submittedData.siteName} />
              <AdjustmentField label="Site address line 1" name="siteAddressLine1" required value={submittedData.siteAddressLine1} />
              <AdjustmentField label="Site address line 2" name="siteAddressLine2" value={submittedData.siteAddressLine2} />
              <AdjustmentField label="Site city" name="siteCity" required value={submittedData.siteCity} />
              <AdjustmentField label="Site state" name="siteState" required value={submittedData.siteState} />
              <AdjustmentField label="Site ZIP/postal code" name="sitePostalCode" required value={submittedData.sitePostalCode} />
              <AdjustmentField label="Site contact" name="siteContactName" value={submittedData.siteContactName} />
              <AdjustmentField label="Site phone" name="siteContactPhone" type="tel" value={submittedData.siteContactPhone} />
              <AdjustmentField label="Site email" name="siteContactEmail" type="email" value={submittedData.siteContactEmail} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <AdjustmentField label="Requested service type" name="requestedServiceType" required value={submittedData.requestedServiceType} />
              <AdjustmentField label="Preferred service date" name="preferredServiceDate" value={submittedData.preferredServiceDate} />
              <AdjustmentField label="Preferred time window" name="preferredTimeWindow" value={submittedData.preferredTimeWindow} />
              <AdjustmentField label="Preferred service window" name="preferredServiceWindow" value={submittedData.preferredServiceWindow} />
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700">System types</p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {Object.entries(serviceSystemTypeLabels).map(([value, label]) => (
                  <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700" key={value}>
                    <input
                      className="h-4 w-4"
                      defaultChecked={submittedData.systemTypes.includes(value as (typeof submittedData.systemTypes)[number])}
                      name="systemTypes"
                      type="checkbox"
                      value={value}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <AdjustmentTextarea label="Service notes" name="serviceNotes" value={submittedData.serviceNotes} />

            <button className="btn-brand-primary min-h-12 rounded-2xl px-5 text-sm font-semibold" type="submit">
              Save Intake Adjustments
            </button>
          </form>
        </SectionCard>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
        <div className="space-y-6">
          <SectionCard>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">Company information</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <DetailField label="Company" value={submittedData?.companyName} />
              <DetailField label="Primary contact" value={submittedData?.primaryContactName} />
              <DetailField label="Primary email" value={submittedData?.primaryContactEmail} />
              <DetailField label="Primary phone" value={submittedData?.primaryContactPhone} />
            </div>
          </SectionCard>

          <SectionCard>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">Billing information</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <DetailField label="Billing email" value={submittedData?.billingEmail} />
              <DetailField label="Billing phone" value={submittedData?.billingPhone} />
              <DetailField label="Billing address" value={submittedData ? `${submittedData.billingAddressLine1}${submittedData.billingAddressLine2 ? `, ${submittedData.billingAddressLine2}` : ""}` : null} />
              <DetailField label="Billing city/state/zip" value={submittedData ? `${submittedData.billingCity}, ${submittedData.billingState} ${submittedData.billingPostalCode}` : null} />
            </div>
          </SectionCard>

          <SectionCard>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">Service site</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <DetailField label="Site name" value={submittedData?.siteName || submittedData?.companyName} />
              <DetailField label="Site address" value={submittedData ? `${submittedData.siteAddressLine1}${submittedData.siteAddressLine2 ? `, ${submittedData.siteAddressLine2}` : ""}` : null} />
              <DetailField label="Site city/state/zip" value={submittedData ? `${submittedData.siteCity}, ${submittedData.siteState} ${submittedData.sitePostalCode}` : null} />
              <DetailField label="Site contact" value={submittedData?.siteContactName} />
              <DetailField label="Site phone" value={submittedData?.siteContactPhone} />
              <DetailField label="Site email" value={submittedData?.siteContactEmail} />
            </div>
          </SectionCard>

          <SectionCard>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">Service request</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <DetailField label="Requested service type" value={submittedData?.requestedServiceType} />
              <DetailField label="System types" value={systemTypes} />
              <DetailField label="Preferred service date/time" value={submittedData?.preferredServiceWindow} />
              <DetailField label="Notes" value={submittedData?.serviceNotes} />
            </div>
          </SectionCard>
        </div>

        <aside className="space-y-6">
          <SectionCard>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">Review actions</h2>
            <div className="mt-4 space-y-2 text-sm text-[color:var(--text-muted)]">
              <p>Sent: {formatDate(request.sentAt)}</p>
              <p>Submitted: {formatDate(request.submittedAt)}</p>
              <p>Expires: {formatDate(request.expiresAt)}</p>
              <p>Created by: {request.createdBy.name}</p>
            </div>
            {canResend(request.status) ? (
              <form action={resendCustomerIntakeFormAction} className="mt-5">
                <input name="intakeRequestId" type="hidden" value={request.id} />
                <button className="btn-brand-primary min-h-12 w-full rounded-2xl px-4 text-sm font-semibold" type="submit">
                  Resend Intake Form
                </button>
                <p className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">
                  Refreshes the secure link, extends the expiration, and emails {request.recipientEmail}.
                </p>
              </form>
            ) : null}
            {request.status === "submitted" ? (
              <div className="mt-5 space-y-3">
                <form action={approveCustomerIntakeAction} className="space-y-3">
                  <input name="intakeRequestId" type="hidden" value={request.id} />
                  {duplicateWarnings.length ? (
                    <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      <input className="mt-1 h-4 w-4" name="confirmDuplicateWarnings" type="checkbox" />
                      <span>I reviewed the duplicate warnings and still want to create a new customer.</span>
                    </label>
                  ) : (
                    <input name="confirmDuplicateWarnings" type="hidden" value="on" />
                  )}
                  <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <input className="mt-1 h-4 w-4" name="createWorkOrderDraft" type="checkbox" />
                    <span>Create a work order draft from this service request.</span>
                  </label>
                  <button className="btn-brand-primary min-h-12 w-full rounded-2xl px-4 text-sm font-semibold" type="submit">
                    Approve & Create Customer
                  </button>
                </form>
                <form action={reopenCustomerIntakeAction}>
                  <input name="intakeRequestId" type="hidden" value={request.id} />
                  <button className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700" type="submit">
                    Request Changes / Reopen
                  </button>
                </form>
                <form action={rejectCustomerIntakeAction}>
                  <input name="intakeRequestId" type="hidden" value={request.id} />
                  <button className="min-h-12 w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700" type="submit">
                    Reject
                  </button>
                </form>
              </div>
            ) : request.createdCustomerId ? (
              <Link
                className="btn-brand-primary mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-2xl px-4 text-sm font-semibold"
                href={`/app/admin/clients/${request.createdCustomerId}`}
              >
                Open Created Customer
              </Link>
            ) : null}
          </SectionCard>

          <SectionCard>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">Attachments</h2>
            <div className="mt-4 space-y-3">
              {request.attachments.length ? request.attachments.map((attachment) => (
                <Link
                  className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-[var(--tenant-primary)] hover:bg-white"
                  href={`/api/customer-intakes/attachments/${attachment.id}`}
                  key={attachment.id}
                >
                  <p className="font-semibold text-slate-900">{attachment.fileName}</p>
                  <p className="mt-1 text-xs text-[color:var(--text-muted)]">{attachment.mimeType}</p>
                </Link>
              )) : (
                <p className="text-sm text-[color:var(--text-muted)]">No uploads were attached.</p>
              )}
            </div>
          </SectionCard>
        </aside>
      </section>
    </AppPageShell>
  );
}
