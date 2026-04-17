import Link from "next/link";

import { getInvitationAcceptanceDetails } from "@testworx/lib/server/index";

import { AcceptInviteForm } from "./accept-invite-form";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

export default async function AcceptInvitePage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const token = readParam(resolvedSearchParams, "token");
  const invite = token ? await getInvitationAcceptanceDetails(token) : null;

  return (
    <main
      className="min-h-screen px-4 py-6 sm:px-6 sm:py-10"
      style={{
        backgroundImage:
          "radial-gradient(circle at top, rgb(var(--tenant-primary-rgb) / 0.15), transparent 35%), linear-gradient(135deg, #F8FAFC, #E2E8F0)"
      }}
    >
      <div className="mx-auto grid min-h-[85vh] max-w-6xl gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex flex-col justify-between rounded-[2rem] bg-slateblue p-6 text-white shadow-panel sm:p-8">
          <div className="space-y-6">
            <span className="inline-flex rounded-full border border-white/25 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70">TradeWorx</span>
            <h1 className="max-w-xl text-3xl font-semibold leading-tight sm:text-4xl md:text-5xl">Join your workspace with a secure invite.</h1>
            <p className="max-w-2xl text-base text-white/75 md:text-lg">
              Finish account setup, create your password, and step directly into your company workspace without extra admin back-and-forth.
            </p>
          </div>
          <div className="rounded-3xl bg-white/10 p-5 backdrop-blur sm:p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-white/60">Onboarding</p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75">
              Invite links are single-use and expire automatically. If your link has expired, ask your administrator to resend it from the Team and Portal Access workspace.
            </p>
          </div>
        </section>
        <section className="flex items-center justify-center">
          <div className="w-full max-w-md">
            <div className="mb-6">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Account setup</p>
              <h2 className="mt-2 text-3xl font-semibold text-ink">Accept your invite</h2>
            </div>
            {invite ? (
              <AcceptInviteForm invite={invite} token={token} />
            ) : (
              <div className="space-y-4 rounded-3xl bg-white p-8 shadow-panel">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  This invite link is invalid, expired, or has already been used.
                </div>
                <p className="text-sm text-slate-600">Ask your office administrator to create or resend a fresh invite from the Team and Portal Access page.</p>
                <Link className="inline-flex rounded-2xl bg-slateblue px-4 py-3 font-semibold text-white" href="/login">
                  Back to sign in
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

