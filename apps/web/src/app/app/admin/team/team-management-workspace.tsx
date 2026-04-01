"use client";

import { useActionState, useMemo } from "react";

import { customerAllowanceKeys, internalAllowanceKeys, type TeamAllowanceMap } from "@testworx/lib";

import {
  createCustomerInviteAction,
  createTeamInviteAction,
  initialActionState,
  issuePasswordResetAction,
  removeUserAction,
  resendInviteAction,
  revokeInviteAction,
  setUserActiveStateAction,
  updateInviteAllowancesAction,
  updateUserAllowancesAction
} from "./actions";

type AllowanceLabel = { key: string; label: string };
type CustomerOption = { id: string; name: string };
type WorkspaceUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | Date | null;
  createdAt: string | Date;
  customerCompany?: { id: string; name: string } | null;
  allowances: TeamAllowanceMap;
  allowanceLabels: AllowanceLabel[];
};
type WorkspaceInvite = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  sentAt: string | Date;
  acceptedAt: string | Date | null;
  expiresAt: string | Date;
  derivedStatus: string;
  invitedBy?: { id: string; name: string | null } | null;
  customerCompany?: { id: string; name: string } | null;
  allowances: TeamAllowanceMap;
  allowanceLabels: AllowanceLabel[];
};

const roleLabels: Record<string, string> = {
  tenant_admin: "Tenant admin",
  office_admin: "Office admin",
  technician: "Technician",
  customer_user: "Customer portal"
};

const internalAllowanceLabelMap: Record<(typeof internalAllowanceKeys)[number], string> = {
  accountAdmin: "Team admin",
  schedulingAccess: "Scheduling",
  billingAccess: "Billing",
  settingsAccess: "Settings",
  reportReviewAccess: "Reports",
  deficiencyAccess: "Deficiencies",
  amendmentAccess: "Amendments",
  customerPortalAdmin: "Portal access"
};

const customerAllowanceLabelMap: Record<(typeof customerAllowanceKeys)[number], string> = {
  reportDownload: "Download reports",
  documentDownload: "Download documents",
  deficiencyVisibility: "View deficiencies",
  portalAdmin: "Portal admin"
};

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function StatusBadge({ label, tone }: { label: string; tone: "active" | "pending" | "inactive" | "revoked" | "expired" }) {
  const toneClass =
    tone === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "pending"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : tone === "revoked"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : tone === "expired"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-slate-200 bg-slate-50 text-slate-600";

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>{label}</span>;
}

function ResultCallout({ error, success, url, urlLabel }: { error?: string | null; success?: string | null; url?: string | null; urlLabel?: string }) {
  if (!error && !success && !url) {
    return null;
  }

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
      {error ? <p>{error}</p> : null}
      {success ? <p>{success}</p> : null}
      {url ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 rounded-xl bg-white/80 px-3 py-2 text-xs text-slate-700 break-all">{url}</code>
          <CopyButton label={urlLabel ?? "Copy link"} value={url} />
        </div>
      ) : null}
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slateblue"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          // no-op fallback
        }
      }}
      type="button"
    >
      {label}
    </button>
  );
}

function SummaryCard({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <p className="text-sm uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{note}</p>
    </div>
  );
}

function AllowanceFieldset({
  allowanceKeys,
  labelMap,
  values
}: {
  allowanceKeys: readonly string[];
  labelMap: Record<string, string>;
  values: TeamAllowanceMap;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {allowanceKeys.map((key) => (
        <label key={key} className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <input className="h-4 w-4 rounded border-slate-300" defaultChecked={values[key as keyof TeamAllowanceMap]} name={key} type="checkbox" />
          <span>{labelMap[key]}</span>
        </label>
      ))}
    </div>
  );
}

function InviteFormCard({
  title,
  description,
  customerCompanies,
  customerMode = false
}: {
  title: string;
  description: string;
  customerCompanies: CustomerOption[];
  customerMode?: boolean;
}) {
  const [state, formAction, pending] = useActionState(customerMode ? createCustomerInviteAction : createTeamInviteAction, initialActionState);
  const defaultAllowances = useMemo<TeamAllowanceMap>(() => ({
    accountAdmin: false,
    schedulingAccess: true,
    billingAccess: !customerMode,
    settingsAccess: !customerMode,
    reportReviewAccess: !customerMode,
    deficiencyAccess: true,
    amendmentAccess: !customerMode,
    customerPortalAdmin: !customerMode,
    reportDownload: customerMode,
    documentDownload: customerMode,
    deficiencyVisibility: customerMode,
    portalAdmin: false
  }), [customerMode]);

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
      <div className="max-w-2xl">
        <p className="text-sm uppercase tracking-[0.24em] text-slate-400">{customerMode ? "Customer portal access" : "Team invites"}</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
      </div>
      <form action={formAction} className="mt-5 space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600">Name</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slateblue" name="name" required />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600">Email</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slateblue" name="email" required type="email" />
          </div>
          {customerMode ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">Customer company</label>
              <select className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slateblue" name="customerCompanyId" required>
                <option value="">Select customer</option>
                {customerCompanies.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">Role</label>
              <select className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slateblue" defaultValue="technician" name="role">
                <option value="tenant_admin">Tenant admin</option>
                <option value="office_admin">Office admin</option>
                <option value="technician">Technician</option>
              </select>
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-600">Allowances</p>
          <AllowanceFieldset
            allowanceKeys={customerMode ? customerAllowanceKeys : internalAllowanceKeys}
            labelMap={customerMode ? customerAllowanceLabelMap : internalAllowanceLabelMap}
            values={defaultAllowances}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">
            {pending ? "Creating invite..." : customerMode ? "Create portal invite" : "Create team invite"}
          </button>
          <p className="text-sm text-slate-500">The system will generate a secure onboarding link you can send or copy immediately.</p>
        </div>
      </form>
      <div className="mt-4">
        <ResultCallout error={state.error} success={state.success} url={state.inviteUrl} urlLabel="Copy invite link" />
      </div>
    </div>
  );
}

function UserRow({ user, customerMode = false }: { user: WorkspaceUser; customerMode?: boolean }) {
  const [allowanceState, allowanceFormAction, allowancePending] = useActionState(updateUserAllowancesAction, initialActionState);
  const [statusState, statusFormAction, statusPending] = useActionState(setUserActiveStateAction, initialActionState);
  const [resetState, resetFormAction, resetPending] = useActionState(issuePasswordResetAction, initialActionState);
  const [removeState, removeFormAction, removePending] = useActionState(removeUserAction, initialActionState);

  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-ink">{user.name}</h3>
            <StatusBadge label={user.isActive ? "Active" : "Inactive"} tone={user.isActive ? "active" : "inactive"} />
            <StatusBadge label={roleLabels[user.role] ?? user.role} tone="pending" />
          </div>
          <p className="mt-1 text-sm text-slate-500">{user.email}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {user.allowanceLabels.length > 0 ? user.allowanceLabels.map((item) => (
              <span key={item.key} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">{item.label}</span>
            )) : (
              <span className="text-xs text-slate-400">No additional allowances</span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
            <span>Last active: {formatDateTime(user.lastLoginAt)}</span>
            <span>Created: {formatDateTime(user.createdAt)}</span>
            {user.customerCompany ? <span>Customer: {user.customerCompany.name}</span> : null}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:w-[28rem]">
          <form action={statusFormAction}>
            <input name="userId" type="hidden" value={user.id} />
            <input name="nextState" type="hidden" value={user.isActive ? "inactive" : "active"} />
            <button className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60" disabled={statusPending} type="submit">
              {user.isActive ? "Deactivate" : "Reactivate"}
            </button>
          </form>
          <form action={resetFormAction}>
            <input name="userId" type="hidden" value={user.id} />
            <button className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60" disabled={resetPending} type="submit">
              Reset password
            </button>
          </form>
          <form action={removeFormAction}>
            <input name="userId" type="hidden" value={user.id} />
            <button className="w-full rounded-xl border border-rose-200 px-3 py-2.5 text-sm font-semibold text-rose-700 disabled:opacity-60" disabled={removePending} type="submit">
              Remove
            </button>
          </form>
        </div>
      </div>

      <form action={allowanceFormAction} className="mt-5 space-y-4 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
        <input name="userId" type="hidden" value={user.id} />
        <p className="text-sm font-semibold text-slate-700">Allowances</p>
        <AllowanceFieldset
          allowanceKeys={customerMode ? customerAllowanceKeys : internalAllowanceKeys}
          labelMap={customerMode ? customerAllowanceLabelMap : internalAllowanceLabelMap}
          values={user.allowances}
        />
        <button className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slateblue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={allowancePending} type="submit">
          Save allowances
        </button>
      </form>

      <div className="mt-4 space-y-3">
        <ResultCallout error={allowanceState.error} success={allowanceState.success} />
        <ResultCallout error={statusState.error} success={statusState.success} />
        <ResultCallout error={resetState.error} success={resetState.success} url={resetState.resetUrl} urlLabel="Copy reset link" />
        <ResultCallout error={removeState.error} success={removeState.success} />
      </div>
    </div>
  );
}

function InviteRow({ invite, customerMode = false }: { invite: WorkspaceInvite; customerMode?: boolean }) {
  const [resendState, resendFormAction, resendPending] = useActionState(resendInviteAction, initialActionState);
  const [revokeState, revokeFormAction, revokePending] = useActionState(revokeInviteAction, initialActionState);
  const [allowanceState, allowanceFormAction, allowancePending] = useActionState(updateInviteAllowancesAction, initialActionState);

  const tone = invite.derivedStatus === "pending" ? "pending" : invite.derivedStatus === "revoked" ? "revoked" : "expired";

  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-ink">{invite.name || invite.email}</h3>
            <StatusBadge label={invite.derivedStatus === "pending" ? "Pending invite" : invite.derivedStatus === "revoked" ? "Revoked" : "Expired"} tone={tone} />
            <StatusBadge label={roleLabels[invite.role] ?? invite.role} tone="pending" />
          </div>
          <p className="mt-1 text-sm text-slate-500">{invite.email}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {invite.allowanceLabels.length > 0 ? invite.allowanceLabels.map((item) => (
              <span key={item.key} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">{item.label}</span>
            )) : (
              <span className="text-xs text-slate-400">No additional allowances</span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
            <span>Invited: {formatDateTime(invite.sentAt)}</span>
            <span>Expires: {formatDateTime(invite.expiresAt)}</span>
            <span>Invited by: {invite.invitedBy?.name || "Unknown"}</span>
            {invite.customerCompany ? <span>Customer: {invite.customerCompany.name}</span> : null}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:w-[22rem]">
          <form action={resendFormAction}>
            <input name="inviteId" type="hidden" value={invite.id} />
            <button className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60" disabled={resendPending || invite.derivedStatus !== "pending"} type="submit">
              Resend invite
            </button>
          </form>
          <form action={revokeFormAction}>
            <input name="inviteId" type="hidden" value={invite.id} />
            <button className="w-full rounded-xl border border-rose-200 px-3 py-2.5 text-sm font-semibold text-rose-700 disabled:opacity-60" disabled={revokePending || invite.derivedStatus !== "pending"} type="submit">
              Revoke
            </button>
          </form>
        </div>
      </div>

      <form action={allowanceFormAction} className="mt-5 space-y-4 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
        <input name="inviteId" type="hidden" value={invite.id} />
        <p className="text-sm font-semibold text-slate-700">Allowances</p>
        <AllowanceFieldset
          allowanceKeys={customerMode ? customerAllowanceKeys : internalAllowanceKeys}
          labelMap={customerMode ? customerAllowanceLabelMap : internalAllowanceLabelMap}
          values={invite.allowances}
        />
        <button className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slateblue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={allowancePending} type="submit">
          Save invite allowances
        </button>
      </form>

      <div className="mt-4 space-y-3">
        <ResultCallout error={resendState.error} success={resendState.success} url={resendState.inviteUrl} urlLabel="Copy invite link" />
        <ResultCallout error={revokeState.error} success={revokeState.success} />
        <ResultCallout error={allowanceState.error} success={allowanceState.success} />
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{description}</p>
    </div>
  );
}

export function TeamManagementWorkspace({
  summary,
  customerCompanies,
  filters,
  teamMembers,
  teamInvites,
  customerPortalUsers,
  customerInvites
}: {
  summary: { teamMembers: number; customerPortalUsers: number; pendingInvites: number; inactiveUsers: number };
  customerCompanies: CustomerOption[];
  filters: { query: string; status: string; role: string };
  teamMembers: WorkspaceUser[];
  teamInvites: WorkspaceInvite[];
  customerPortalUsers: WorkspaceUser[];
  customerInvites: WorkspaceInvite[];
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Account workspace</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink md:text-4xl">Team and customer portal access</h1>
            <p className="mt-3 text-sm text-slate-500 md:text-base">Invite internal users, grant portal access, adjust allowances, and handle account resets from one polished operations workspace.</p>
          </div>
          <form className="grid gap-3 sm:grid-cols-3" method="get">
            <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slateblue" defaultValue={filters.query} name="q" placeholder="Search people, email, customer" />
            <select className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slateblue" defaultValue={filters.status} name="status">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending invites</option>
              <option value="expired">Expired invites</option>
              <option value="revoked">Revoked invites</option>
            </select>
            <select className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slateblue" defaultValue={filters.role} name="role">
              <option value="all">All roles</option>
              <option value="tenant_admin">Tenant admin</option>
              <option value="office_admin">Office admin</option>
              <option value="technician">Technician</option>
              <option value="customer_user">Customer portal</option>
            </select>
            <button className="sm:col-span-3 inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-5 py-3 text-sm font-semibold text-white" type="submit">
              Apply filters
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Internal team" note="Active and inactive staff accounts in this workspace." value={summary.teamMembers} />
        <SummaryCard label="Portal users" note="Customer-facing portal accounts and linked access." value={summary.customerPortalUsers} />
        <SummaryCard label="Pending invites" note="Outstanding onboarding links waiting to be accepted." value={summary.pendingInvites} />
        <SummaryCard label="Inactive users" note="Accounts kept for history but blocked from sign-in." value={summary.inactiveUsers} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <InviteFormCard
          customerCompanies={customerCompanies}
          description="Invite tenant admins, office admins, and technicians with role-based defaults and scoped feature access."
          title="Invite internal team members"
        />
        <InviteFormCard
          customerCompanies={customerCompanies}
          customerMode
          description="Grant clean customer portal access linked to the correct customer company, with customer-facing allowances only."
          title="Invite customer portal users"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Team</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Internal members</h2>
            <p className="mt-2 text-sm text-slate-500">Manage admins and technicians without leaving the operational workspace.</p>
          </div>
          {teamMembers.length > 0 ? teamMembers.map((user) => <UserRow key={user.id} user={user} />) : (
            <EmptyState description="No internal team members matched these filters. Try broadening the filter or create a new invite above." title="No team members found" />
          )}
          {teamInvites.length > 0 ? (
            <>
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Pending and historical</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">Team invites</h2>
              </div>
              {teamInvites.map((invite) => <InviteRow key={invite.id} invite={invite} />)}
            </>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Customer portal</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Portal access</h2>
            <p className="mt-2 text-sm text-slate-500">Give customers access to reports, documents, and deficiency visibility with clear customer-company context.</p>
          </div>
          {customerPortalUsers.length > 0 ? customerPortalUsers.map((user) => <UserRow key={user.id} customerMode user={user} />) : (
            <EmptyState description="No customer portal users matched these filters. Invite a portal contact above to get started." title="No portal users found" />
          )}
          {customerInvites.length > 0 ? (
            <>
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Pending and historical</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">Portal invites</h2>
              </div>
              {customerInvites.map((invite) => <InviteRow key={invite.id} customerMode invite={invite} />)}
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
