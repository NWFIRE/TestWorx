"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { completePasswordResetAction, initialActionState } from "@/app/app/admin/team/actions";

type ResetDetails = {
  user: {
    email: string;
    name: string | null;
    tenant: { name: string } | null;
  };
};

export function ResetPasswordForm({
  token,
  reset
}: {
  token: string;
  reset: ResetDetails;
}) {
  const [state, formAction, pending] = useActionState(completePasswordResetAction, initialActionState);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordMismatch = useMemo(
    () => confirmPassword.length > 0 && password !== confirmPassword,
    [confirmPassword, password]
  );

  return (
    <form action={formAction} className="space-y-5 rounded-3xl bg-white p-8 shadow-panel">
      <input name="token" type="hidden" value={token} />

      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Password reset</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">{reset.user.tenant?.name ?? "TradeWorx workspace"}</h2>
        <p className="mt-2 text-sm text-slate-500">
          {reset.user.name ?? reset.user.email}
          {" • "}
          {reset.user.email}
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="password">
          New password
        </label>
        <input
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none transition focus:border-slateblue"
          id="password"
          minLength={8}
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="confirm-password">
          Confirm password
        </label>
        <input
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none transition focus:border-slateblue"
          id="confirm-password"
          minLength={8}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          type="password"
        />
      </div>

      {passwordMismatch ? <p className="text-sm text-rose-600">Passwords must match before you continue.</p> : null}
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      {state.success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <p>{state.success}</p>
          <Link className="mt-3 inline-flex font-semibold text-slateblue" href="/login">
            Continue to sign in
          </Link>
        </div>
      ) : null}

      <button
        className="w-full rounded-2xl bg-slateblue px-4 py-3 font-semibold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending || passwordMismatch}
        type="submit"
      >
        {pending ? "Updating password..." : "Update password"}
      </button>
    </form>
  );
}
