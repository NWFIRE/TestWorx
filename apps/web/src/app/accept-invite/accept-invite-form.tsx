"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { acceptInvitePasswordAction } from "@/app/app/admin/team/actions";
import { initialTeamActionState } from "@/app/app/admin/team/action-state";

type AcceptInviteDetails = {
  email: string;
  name: string | null;
  role: string;
  tenant: { name: string };
  customerCompany: { name: string } | null;
};

const roleLabels: Record<string, string> = {
  tenant_admin: "Tenant admin",
  office_admin: "Office admin",
  technician: "Technician",
  customer_user: "Customer portal user"
};

export function AcceptInviteForm({
  token,
  invite
}: {
  token: string;
  invite: AcceptInviteDetails;
}) {
  const [state, formAction, pending] = useActionState(acceptInvitePasswordAction, initialTeamActionState);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordMismatch = useMemo(
    () => confirmPassword.length > 0 && password !== confirmPassword,
    [confirmPassword, password]
  );

  return (
    <form action={formAction} className="space-y-5 rounded-3xl bg-white p-8 shadow-panel">
      <input name="token" type="hidden" value={token} />

      <div className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Workspace invite</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">{invite.tenant.name}</h2>
          <p className="mt-2 text-sm text-slate-500">
            {roleLabels[invite.role] ?? invite.role}
            {invite.customerCompany ? ` • ${invite.customerCompany.name}` : ""}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Email</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{invite.email}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Suggested name</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{invite.name ?? "Add your name below"}</p>
          </div>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="name">
          Full name
        </label>
        <input
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none transition focus:border-slateblue"
          defaultValue={invite.name ?? ""}
          id="name"
          name="name"
          required
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="password">
          Create password
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
        <p className="mt-2 text-xs text-slate-500">Use at least 8 characters.</p>
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
        {pending ? "Setting up account..." : "Create account"}
      </button>
    </form>
  );
}
