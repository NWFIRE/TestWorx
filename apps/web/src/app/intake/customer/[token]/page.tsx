import type { ReactNode } from "react";
import Image from "next/image";

import {
  buildTenantBrandingCss,
  customerIntakeFormSystemTypes,
  getPublicCustomerIntakeRequest,
  serviceSystemTypeLabels
} from "@testworx/lib/server/index";

import { CustomerIntakeForm, IntakeConfirmation } from "./customer-intake-form";

type SearchParams = Record<string, string | string[] | undefined>;

type PublicBranding = {
  logoDataUrl: string;
  legalBusinessName: string;
  phone: string;
  email: string;
  website: string;
  primaryColor: string;
  accentColor: string;
};

const fallbackBranding: PublicBranding = {
  logoDataUrl: "",
  legalBusinessName: "Northwest Fire & Safety",
  phone: "580-540-3119",
  email: "accounting@nwfireandsafety.com",
  website: "https://www.nwfireandsafety.com",
  primaryColor: "#1E3A5F",
  accentColor: "#C2410C"
};

function readParam(params: SearchParams, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : "";
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(value);
}

function PublicShell({
  branding,
  children
}: {
  branding: PublicBranding;
  children: ReactNode;
}) {
  return (
    <main
      className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgb(var(--tenant-primary-rgb)/0.10),transparent_34%),linear-gradient(180deg,#f8fafc,#eef3f8)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8"
      style={buildTenantBrandingCss(branding)}
    >
      <div className="mx-auto max-w-[960px] space-y-6">
        {children}
        <SecurityFooter branding={branding} />
      </div>
    </main>
  );
}

function StateCard({
  branding,
  children,
  eyebrow = "Customer setup",
  title
}: {
  branding: PublicBranding;
  children: ReactNode;
  eyebrow?: string;
  title: string;
}) {
  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-9">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <BrandMark branding={branding} />
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
          Secure customer setup
        </div>
      </div>
      <p className="mt-8 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--tenant-primary)]">{eyebrow}</p>
      <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl">{title}</h1>
      <div className="mt-4 max-w-2xl text-base leading-7 text-slate-600">{children}</div>
    </section>
  );
}

function BrandMark({ branding }: { branding: PublicBranding }) {
  return (
    <div className="flex items-center gap-4">
      {branding.logoDataUrl ? (
        <Image
          alt={branding.legalBusinessName}
          className="h-auto max-h-12 w-auto max-w-44 rounded-2xl bg-white object-contain"
          height={48}
          src={branding.logoDataUrl}
          width={176}
        />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--tenant-primary-soft)] text-sm font-black text-[var(--tenant-primary)]">
          NW
        </div>
      )}
      <div>
        <p className="text-sm font-semibold text-slate-950">{branding.legalBusinessName}</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--tenant-primary)]">Fire protection & life safety</p>
      </div>
    </div>
  );
}

function SecurityFooter({ branding }: { branding: PublicBranding }) {
  return (
    <footer className="rounded-[26px] border border-slate-200 bg-white/75 px-5 py-5 text-sm leading-6 text-slate-600 shadow-[0_14px_40px_rgba(15,23,42,0.04)] backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-slate-950">{branding.legalBusinessName}</p>
          <p>This secure form is used only to collect customer setup and service request information.</p>
          <p>If you were not expecting this request, you can close this page.</p>
        </div>
        <div className="space-y-1 sm:text-right">
          {branding.phone ? <p>{branding.phone}</p> : null}
          {branding.email ? <p>{branding.email}</p> : null}
          {branding.website ? (
            <a className="font-semibold text-[var(--tenant-primary)]" href={branding.website}>
              {branding.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          ) : null}
        </div>
      </div>
    </footer>
  );
}

export default async function CustomerIntakePage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { token } = await params;
  const query = searchParams ? await searchParams : {};
  const request = await getPublicCustomerIntakeRequest(token);
  const branding = request?.branding ?? fallbackBranding;
  const submittedFromForm = readParam(query, "submitted") === "1";
  const error = readParam(query, "error");

  if (!request) {
    return (
      <PublicShell branding={branding}>
        <StateCard branding={branding} title="This setup link is not valid">
          <p>Please check the link or contact Northwest Fire & Safety.</p>
          <a className="mt-6 inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-[var(--tenant-primary)] px-6 font-semibold text-[var(--tenant-primary-contrast)]" href={`tel:${branding.phone}`}>
            Call {branding.phone}
          </a>
        </StateCard>
      </PublicShell>
    );
  }

  if (submittedFromForm) {
    return (
      <PublicShell branding={branding}>
        <IntakeConfirmation branding={branding} submittedData={request.submittedData} />
      </PublicShell>
    );
  }

  if (request.status === "expired") {
    return (
      <PublicShell branding={branding}>
        <StateCard branding={branding} title="This setup link has expired">
          <p>Please contact Northwest Fire & Safety and we&apos;ll send you a new secure link.</p>
          <a className="mt-6 inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-[var(--tenant-primary)] px-6 font-semibold text-[var(--tenant-primary-contrast)]" href={`tel:${branding.phone}`}>
            Call {branding.phone}
          </a>
        </StateCard>
      </PublicShell>
    );
  }

  if (request.status !== "sent") {
    return (
      <PublicShell branding={branding}>
        <StateCard branding={branding} title="This customer setup has already been submitted">
          <p>Our team has received your information and will follow up with next steps.</p>
        </StateCard>
      </PublicShell>
    );
  }

  return (
    <PublicShell branding={branding}>
      <CustomerIntakeForm
        branding={branding}
        error={error}
        expirationDate={formatDate(request.expiresAt)}
        systemOptions={customerIntakeFormSystemTypes.map((value) => ({
          value,
          label: serviceSystemTypeLabels[value]
        }))}
        token={token}
      />
    </PublicShell>
  );
}
