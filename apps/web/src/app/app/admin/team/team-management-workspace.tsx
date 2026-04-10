"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { BrandLoader } from "@/app/brand-loader";
import { customerAllowanceKeys, internalAllowanceKeys, type TeamAllowanceMap } from "@testworx/lib";

import {
  AppPageShell,
  EmptyState as SharedEmptyState,
  FilterBar,
  KPIStatCard,
  PageHeader,
  SectionCard,
  StatusBadge as SharedStatusBadge
} from "../operations-ui";

import {
  createCustomerInviteAction,
  createTeamInviteAction,
  issuePasswordResetAction,
  removeUserAction,
  resendInviteAction,
  revokeInviteAction,
  setUserActiveStateAction,
  updateInviteAllowancesAction,
  updateUserAllowancesAction
} from "./actions";
import { initialTeamActionState } from "./action-state";

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
type UserLookupResponse = {
  items: WorkspaceUser[];
  page: number;
  hasMore: boolean;
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
  amendmentAccess: "Inspection review",
  customerPortalAdmin: "Portal access"
};

const customerAllowanceLabelMap: Record<(typeof customerAllowanceKeys)[number], string> = {
  reportDownload: "Download reports",
  documentDownload: "Download documents",
  deficiencyVisibility: "View deficiencies",
  portalAdmin: "Portal admin"
};

function getRoleDefaultAllowances(role: "tenant_admin" | "office_admin" | "technician" | "customer_user"): TeamAllowanceMap {
  return {
    accountAdmin: role === "tenant_admin" || role === "office_admin",
    schedulingAccess: role === "tenant_admin" || role === "office_admin",
    billingAccess: role === "tenant_admin" || role === "office_admin",
    settingsAccess: role === "tenant_admin" || role === "office_admin",
    reportReviewAccess: role === "tenant_admin" || role === "office_admin" || role === "technician",
    deficiencyAccess: role === "tenant_admin" || role === "office_admin",
    amendmentAccess: role === "tenant_admin" || role === "office_admin",
    customerPortalAdmin: role === "tenant_admin" || role === "office_admin",
    reportDownload: role === "customer_user",
    documentDownload: role === "customer_user",
    deficiencyVisibility: role === "customer_user",
    portalAdmin: false
  };
}

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
  return (
    <SharedStatusBadge
      label={label}
      tone={tone === "active" ? "emerald" : tone === "pending" ? "blue" : tone === "revoked" ? "rose" : tone === "expired" ? "amber" : "slate"}
    />
  );
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
    <KPIStatCard label={label} note={note} value={value} />
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
  const [state, formAction, pending] = useActionState(customerMode ? createCustomerInviteAction : createTeamInviteAction, initialTeamActionState);
  const [selectedRole, setSelectedRole] = useState<"tenant_admin" | "office_admin" | "technician" | "customer_user">(
    customerMode ? "customer_user" : "technician"
  );
  const defaultAllowances = useMemo<TeamAllowanceMap>(() => getRoleDefaultAllowances(selectedRole), [selectedRole]);

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
              <select
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slateblue"
                name="role"
                onChange={(event) => setSelectedRole(event.target.value as "tenant_admin" | "office_admin" | "technician")}
                value={selectedRole}
              >
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
            key={`${customerMode ? "customer" : "internal"}-${selectedRole}`}
            allowanceKeys={customerMode ? customerAllowanceKeys : internalAllowanceKeys}
            labelMap={customerMode ? customerAllowanceLabelMap : internalAllowanceLabelMap}
            values={defaultAllowances}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">
            {pending ? "Creating invite..." : customerMode ? "Create portal invite" : "Create team invite"}
          </button>
          <p className="text-sm text-slate-500">The system will send a secure email invite automatically. A fallback link appears only if delivery fails.</p>
        </div>
      </form>
      <div className="mt-4">
        <ResultCallout error={state.error} success={state.success} url={state.inviteUrl} urlLabel="Copy fallback invite link" />
      </div>
    </div>
  );
}

function UserRow({ user, customerMode = false }: { user: WorkspaceUser; customerMode?: boolean }) {
  const [allowanceState, allowanceFormAction, allowancePending] = useActionState(updateUserAllowancesAction, initialTeamActionState);
  const [statusState, statusFormAction, statusPending] = useActionState(setUserActiveStateAction, initialTeamActionState);
  const [resetState, resetFormAction, resetPending] = useActionState(issuePasswordResetAction, initialTeamActionState);
  const [removeState, removeFormAction, removePending] = useActionState(removeUserAction, initialTeamActionState);

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
        <ResultCallout error={resetState.error} success={resetState.success} url={resetState.resetUrl} urlLabel="Copy fallback reset link" />
        <ResultCallout error={removeState.error} success={removeState.success} />
      </div>
    </div>
  );
}

function InviteRow({ invite, customerMode = false }: { invite: WorkspaceInvite; customerMode?: boolean }) {
  const [resendState, resendFormAction, resendPending] = useActionState(resendInviteAction, initialTeamActionState);
  const [revokeState, revokeFormAction, revokePending] = useActionState(revokeInviteAction, initialTeamActionState);
  const [allowanceState, allowanceFormAction, allowancePending] = useActionState(updateInviteAllowancesAction, initialTeamActionState);

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
              Resend email
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
        <ResultCallout error={resendState.error} success={resendState.success} url={resendState.inviteUrl} urlLabel="Copy fallback invite link" />
        <ResultCallout error={revokeState.error} success={revokeState.success} />
        <ResultCallout error={allowanceState.error} success={allowanceState.success} />
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <SharedEmptyState description={description} title={title} />;
}

const userLookupCache = new Map<string, UserLookupResponse>();

function buildUserLookupCacheKey(kind: "internal" | "customer", query: string, page: number, status: "all" | "active" | "inactive") {
  return `team-user-lookup:${kind}:${status}:${page}:${query.trim().toLowerCase()}`;
}

function AsyncUserLookupSection({
  kind,
  title,
  description,
  statusFilter = "all"
}: {
  kind: "internal" | "customer";
  title: string;
  description: string;
  statusFilter?: "all" | "active" | "inactive";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<WorkspaceUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<WorkspaceUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
      setPage(0);
    }, 200);

    return () => window.clearTimeout(timer);
  }, [query]);

  async function loadUsers(nextPage: number, replace = false) {
    const cacheKey = buildUserLookupCacheKey(kind, debouncedQuery, nextPage, statusFilter);
    const cached =
      userLookupCache.get(cacheKey)
      ?? (() => {
        if (typeof window === "undefined") {
          return null;
        }

        const raw = window.sessionStorage.getItem(cacheKey);
        if (!raw) {
          return null;
        }

        try {
          const parsed = JSON.parse(raw) as UserLookupResponse;
          userLookupCache.set(cacheKey, parsed);
          return parsed;
        } catch {
          return null;
        }
      })();

    const applyPayload = (payload: UserLookupResponse) => {
      setItems((current) => (replace ? payload.items : [...current, ...payload.items]));
      setHasMore(payload.hasMore);
      setError(null);
      setHasLoaded(true);
    };

    if (cached) {
      applyPayload(cached);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        kind,
        q: debouncedQuery,
        page: String(nextPage),
        limit: "8",
        status: statusFilter
      });
      const response = await fetch(`/api/team/users?${params.toString()}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store"
      });

      const payload = (await response.json()) as UserLookupResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load users.");
      }

      if (requestId !== requestIdRef.current) {
        return;
      }

      userLookupCache.set(cacheKey, payload);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(cacheKey, JSON.stringify(payload));
      }
      applyPayload(payload);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : "Unable to load users.");
      if (replace) {
        setItems([]);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadUsers(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debouncedQuery, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
        <p className="text-sm uppercase tracking-[0.24em] text-slate-400">{kind === "internal" ? "Team" : "Customer portal"}</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">{description}</p>

        <div className="mt-5 space-y-3">
          <button
            className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-700"
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            <span className="truncate">
              {selectedUser
                ? `${selectedUser.name} • ${selectedUser.email}`
                : kind === "internal"
                  ? "Browse or search internal members"
                  : "Browse or search portal users"}
            </span>
            <span className="ml-4 shrink-0 text-slate-400">{open ? "Close" : "Open"}</span>
          </button>

          {open ? (
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
              <label className="mb-2 block text-sm font-medium text-slate-600">
                {kind === "internal" ? "Internal Members" : "Portal Users"}
              </label>
              <input
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slateblue"
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => {
                  setOpen(true);
                  if (!hasLoaded && !loading) {
                    void loadUsers(0, true);
                  }
                }}
                placeholder={kind === "internal" ? "Search name or email" : "Search name, email, or customer"}
                value={query}
              />

              <div className="mt-3 max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50">
                {loading && items.length === 0 ? (
                  <div className="inline-flex items-center gap-2 px-4 py-4 text-sm text-slate-500">
                    <BrandLoader label="Loading users" size="sm" tone="muted" />
                    Loading users…
                  </div>
                ) : error ? (
                  <div className="space-y-3 px-4 py-4 text-sm text-rose-600">
                    <p>{error}</p>
                    <button
                      className="inline-flex rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700"
                      onClick={() => void loadUsers(0, true)}
                      type="button"
                    >
                      Try again
                    </button>
                  </div>
                ) : items.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-slate-500">No users matched that search.</div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {items.map((user) => (
                      <button
                        key={user.id}
                        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-white"
                        onClick={() => {
                          setSelectedUser(user);
                          setOpen(false);
                        }}
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-900">{user.name}</span>
                          <span className="mt-1 block truncate text-xs text-slate-500">{user.email}</span>
                          {user.customerCompany ? (
                            <span className="mt-1 block truncate text-xs text-slate-400">{user.customerCompany.name}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-xs text-slate-400">{user.isActive ? "Active" : "Inactive"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {hasMore ? (
                <div className="mt-3">
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
                    disabled={loading}
                    onClick={() => {
                      const nextPage = page + 1;
                      setPage(nextPage);
                      void loadUsers(nextPage, false);
                    }}
                    type="button"
                  >
                    {loading && items.length > 0 ? (
                      <span className="inline-flex items-center gap-2">
                        <BrandLoader label="Loading more users" size="sm" tone="muted" />
                        Loading more…
                      </span>
                    ) : "Load more"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {selectedUser ? (
        <UserRow customerMode={kind === "customer"} user={selectedUser} />
      ) : (
        <EmptyState
          description={
            kind === "internal"
              ? "Open the member lookup to search and manage a specific internal account without loading the entire team list."
              : "Open the portal lookup to search and manage a specific customer-facing account without loading the full portal user list."
          }
          title={kind === "internal" ? "Select an internal member" : "Select a portal user"}
        />
      )}
    </div>
  );
}

export function TeamManagementWorkspace({
  summary,
  customerCompanies,
  filters,
  teamInvites,
  customerInvites
}: {
  summary: { teamMembers: number; customerPortalUsers: number; pendingInvites: number; inactiveUsers: number };
  customerCompanies: CustomerOption[];
  filters: { query: string; status: string; role: string };
  teamInvites: WorkspaceInvite[];
  customerInvites: WorkspaceInvite[];
}) {
  const pendingTeamInvites = teamInvites.filter((invite) => invite.derivedStatus === "pending");
  const historicalTeamInvites = teamInvites.filter((invite) => invite.derivedStatus !== "pending");
  const pendingCustomerInvites = customerInvites.filter((invite) => invite.derivedStatus === "pending");
  const historicalCustomerInvites = customerInvites.filter((invite) => invite.derivedStatus !== "pending");

  return (
    <AppPageShell>
      <PageHeader
        description="Invite internal users, grant portal access, adjust allowances, and handle account resets from one polished operations workspace."
        eyebrow="Account workspace"
        title="Team and customer portal access"
      />

      <FilterBar
        description="Use lightweight workspace filters while keeping internal team and customer portal access clearly separated."
        title="Filters"
      >
        <form className="grid w-full gap-3 lg:grid-cols-[1.5fr_1fr_1fr_auto]" method="get">
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
          <button className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-5 py-3 text-sm font-semibold text-white" type="submit">
            Apply filters
          </button>
        </form>
      </FilterBar>

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
          <AsyncUserLookupSection
            description="Search and load internal accounts only when needed, with async lookup and pagination for larger workspaces."
            kind="internal"
            statusFilter={filters.status === "active" || filters.status === "inactive" ? filters.status : "all"}
            title="Internal members"
          />
          <SectionCard>
            <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Internal invite queue</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Pending team invites</h2>
            <p className="mt-2 text-sm text-slate-500">Pending internal invites stay visible here even when the member lookup is filtered to active or inactive users.</p>
          </SectionCard>
          {pendingTeamInvites.length > 0 ? (
            <>
              {pendingTeamInvites.map((invite) => <InviteRow key={invite.id} invite={invite} />)}
            </>
          ) : (
            <EmptyState
              description="New internal invites will appear here until they are accepted, revoked, or expire."
              title="No pending internal invites"
            />
          )}
          {historicalTeamInvites.length > 0 ? (
            <>
              <SectionCard>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">History</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">Internal invite history</h2>
              </SectionCard>
              {historicalTeamInvites.map((invite) => <InviteRow key={invite.id} invite={invite} />)}
            </>
          ) : null}
        </div>

        <div className="space-y-4">
          <AsyncUserLookupSection
            description="Search and load customer-facing accounts on demand so the portal section stays fast even with large customer user lists."
            kind="customer"
            statusFilter={filters.status === "active" || filters.status === "inactive" ? filters.status : "all"}
            title="Portal access"
          />
          <SectionCard>
            <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Customer invite queue</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Pending portal invites</h2>
            <p className="mt-2 text-sm text-slate-500">Customer portal invites stay visible here with company context while the portal user lookup remains async and lightweight.</p>
          </SectionCard>
          {pendingCustomerInvites.length > 0 ? (
            <>
              {pendingCustomerInvites.map((invite) => <InviteRow key={invite.id} customerMode invite={invite} />)}
            </>
          ) : (
            <EmptyState
              description="New customer portal invites will appear here until the recipient completes setup or the invite is revoked."
              title="No pending portal invites"
            />
          )}
          {historicalCustomerInvites.length > 0 ? (
            <>
              <SectionCard>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">History</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">Portal invite history</h2>
              </SectionCard>
              {historicalCustomerInvites.map((invite) => <InviteRow key={invite.id} customerMode invite={invite} />)}
            </>
          ) : null}
        </div>
      </section>
    </AppPageShell>
  );
}
