import Link from "next/link";

import { getPasswordResetDetails } from "@testworx/lib";

import { ResetPasswordForm } from "./reset-password-form";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const token = readParam(resolvedSearchParams, "token");
  const reset = token ? await getPasswordResetDetails(token) : null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(30,58,95,0.15),_transparent_35%),linear-gradient(135deg,_#F8FAFC,_#E2E8F0)] px-6 py-10">
      <div className="mx-auto grid min-h-[85vh] max-w-6xl gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex flex-col justify-between rounded-[2rem] bg-slateblue p-8 text-white shadow-panel">
          <div className="space-y-6">
            <span className="inline-flex rounded-full border border-white/25 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70">TradeWorx</span>
            <h1 className="max-w-xl text-4xl font-semibold leading-tight md:text-5xl">Reset access without slowing down the field team.</h1>
            <p className="max-w-2xl text-base text-white/75 md:text-lg">
              Admin-issued reset links keep account recovery secure while letting your technicians, office staff, and portal users get back into the workspace quickly.
            </p>
          </div>
          <div className="rounded-3xl bg-white/10 p-6 backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-white/60">Secure recovery</p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75">
              Reset links are single-use and expire automatically. If this link no longer works, ask an administrator to issue a new one from Team and Portal Access.
            </p>
          </div>
        </section>
        <section className="flex items-center justify-center">
          <div className="w-full max-w-md">
            <div className="mb-6">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Account recovery</p>
              <h2 className="mt-2 text-3xl font-semibold text-ink">Set a new password</h2>
            </div>
            {reset ? (
              <ResetPasswordForm reset={reset} token={token} />
            ) : (
              <div className="space-y-4 rounded-3xl bg-white p-8 shadow-panel">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  This reset link is invalid or has expired.
                </div>
                <p className="text-sm text-slate-600">Ask your administrator for a fresh reset link if you still need access restored.</p>
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
