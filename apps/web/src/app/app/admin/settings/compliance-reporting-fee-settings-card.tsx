"use client";

import Link from "next/link";
import { useActionState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { buildSettingsHref } from "./settings-query";

const initialState = { error: null as string | null, success: null as string | null };

const divisionOptions = [
  { value: "fire_extinguishers", label: "Fire Extinguishers" },
  { value: "fire_alarm", label: "Fire Alarm" },
  { value: "fire_sprinkler", label: "Fire Sprinkler" },
  { value: "kitchen_suppression", label: "Kitchen Suppression" }
] as const;

function formatDivisionLabel(value: string) {
  return divisionOptions.find((option) => option.value === value)?.label ?? value.replaceAll("_", " ");
}

type ComplianceReportingFeeSettingsCardProps = {
  rules: Array<{
    id: string;
    division: string;
    city: string | null;
    county: string | null;
    state: string | null;
    zipCode: string | null;
    feeAmount: number;
    active: boolean;
  }>;
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  activeEditor: string | null;
  createRuleAction: (_: { error: string | null; success: string | null }, formData: FormData) => Promise<{ error: string | null; success: string | null }>;
  updateRuleAction: (formData: FormData) => Promise<void>;
  deleteRuleAction: (formData: FormData) => Promise<void>;
};

export function ComplianceReportingFeeSettingsCard({
  rules,
  pagination,
  activeEditor,
  createRuleAction,
  updateRuleAction,
  deleteRuleAction
}: ComplianceReportingFeeSettingsCardProps) {
  const [createState, createFormAction, createPending] = useActionState(createRuleAction, initialState);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const previousPageHref = buildSettingsHref(pathname, searchParams, {
    complianceFeesOpen: 1,
    complianceFeePage: Math.max(pagination.page - 1, 1)
  });
  const nextPageHref = buildSettingsHref(pathname, searchParams, {
    complianceFeesOpen: 1,
    complianceFeePage: Math.min(pagination.page + 1, pagination.totalPages)
  });
  const openCreateHref = buildSettingsHref(pathname, searchParams, {
    complianceFeesOpen: 1,
    complianceFeePage: pagination.page,
    complianceFeeEditor: "create"
  });
  const closeEditorHref = buildSettingsHref(pathname, searchParams, {
    complianceFeesOpen: 1,
    complianceFeePage: pagination.page,
    complianceFeeEditor: null
  });

  return (
    <div className="space-y-6 rounded-[2rem] bg-white p-6 shadow-panel">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Compliance reporting fees</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">Jurisdiction-based reporting fees</h3>
        <p className="mt-2 text-sm text-slate-500">TradeWorx applies these fees automatically by service-location city, state, ZIP code, and report division. Each division resolves independently and shows as its own Compliance Reporting Fee line.</p>
      </div>

      {activeEditor === "create" ? (
        <form action={createFormAction} className="rounded-[1.5rem] border border-slate-200 p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-slate-500">New rule</p>
              <h4 className="mt-1 text-lg font-semibold text-ink">Add a compliance reporting fee</h4>
            </div>
            <Link className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={closeEditorHref}>
              Cancel
            </Link>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="division">Division</label>
              <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue="fire_extinguishers" id="division" name="division">
                {divisionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="feeAmount">Fee amount</label>
              <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="feeAmount" min="0" name="feeAmount" placeholder="25.00" required step="0.01" type="number" />
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="city">City</label>
              <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="city" name="city" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="county">County</label>
              <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="county" name="county" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="state">State</label>
              <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="state" name="state" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="zipCode">ZIP code</label>
              <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="zipCode" name="zipCode" />
            </div>
          </div>
          <label className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <input className="h-5 w-5 rounded border-slate-300" defaultChecked name="active" type="checkbox" />
            Rule is active
          </label>
          {createState.error ? <p className="mt-3 text-sm text-rose-600">{createState.error}</p> : null}
          {createState.success ? <p className="mt-3 text-sm text-emerald-600">{createState.success}</p> : null}
          <button className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={createPending} type="submit">
            {createPending ? "Saving rule..." : "Add compliance fee rule"}
          </button>
        </form>
      ) : (
        <div className="rounded-[1.5rem] border border-slate-200 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-slate-500">New rule</p>
              <h4 className="mt-1 text-lg font-semibold text-ink">Add a compliance reporting fee</h4>
              <p className="mt-2 text-sm text-slate-500">Use one rule per division and jurisdiction. TradeWorx applies the most specific matching city/state/ZIP fee automatically.</p>
            </div>
            <Link className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={openCreateHref}>
              Open new rule
            </Link>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Existing rules</p>
          <h4 className="mt-1 text-lg font-semibold text-ink">{pagination.totalCount} configured</h4>
          {pagination.totalCount > 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              Showing {(pagination.page - 1) * pagination.limit + 1}-{Math.min(pagination.page * pagination.limit, pagination.totalCount)} of {pagination.totalCount}
            </p>
          ) : null}
        </div>
        {rules.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No compliance reporting fee rules yet. Matching locations will default to $0.00 until you add one.</p>
        ) : rules.map((rule) => (
          <div key={rule.id} className="rounded-[1.5rem] border border-slate-200 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-lg font-semibold text-ink">{formatDivisionLabel(rule.division)} / {rule.city ?? rule.zipCode ?? "Jurisdiction rule"}</p>
                <p className="text-sm text-slate-500">
                  {[rule.county, rule.state, rule.zipCode].filter(Boolean).join(" | ") || "Location rule"}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${rule.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                {rule.active ? "Active" : "Inactive"}
              </span>
            </div>
            {activeEditor === rule.id ? (
              <form action={updateRuleAction} className="space-y-4">
                <input name="ruleId" type="hidden" value={rule.id} />
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600">Division</label>
                    <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rule.division} name="division">
                      {divisionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600">Fee amount</label>
                    <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rule.feeAmount} min="0" name="feeAmount" step="0.01" type="number" />
                  </div>
                </div>
                <div className="grid gap-4 lg:grid-cols-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600">City</label>
                    <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rule.city ?? ""} name="city" />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600">County</label>
                    <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rule.county ?? ""} name="county" />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600">State</label>
                    <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rule.state ?? ""} name="state" />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600">ZIP code</label>
                    <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rule.zipCode ?? ""} name="zipCode" />
                  </div>
                </div>
                <div className="grid gap-4 lg:grid-cols-[auto_auto]">
                  <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <input className="h-5 w-5 rounded border-slate-300" defaultChecked={rule.active} name="active" type="checkbox" />
                    Active
                  </label>
                  <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
                    Save rule
                  </button>
                </div>
                <Link className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={closeEditorHref}>
                  Close editor
                </Link>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
                <div className="space-y-1">
                  <p>Division: <span className="font-semibold text-ink">{formatDivisionLabel(rule.division)}</span></p>
                  <p>Compliance Reporting Fee: <span className="font-semibold text-ink">${rule.feeAmount.toFixed(2)}</span></p>
                  <p>Jurisdiction: <span className="font-semibold text-ink">{[rule.city, rule.county, rule.state, rule.zipCode].filter(Boolean).join(", ")}</span></p>
                </div>
                <Link
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue"
                  href={buildSettingsHref(pathname, searchParams, {
                    complianceFeesOpen: 1,
                    complianceFeePage: pagination.page,
                    complianceFeeEditor: rule.id
                  })}
                >
                  Edit rule
                </Link>
              </div>
            )}
            <form action={deleteRuleAction} className="mt-3">
              <input name="ruleId" type="hidden" value={rule.id} />
              <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-600" type="submit">
                Delete rule
              </button>
            </form>
          </div>
        ))}
        {pagination.totalCount > 0 ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>Page {pagination.page} of {pagination.totalPages}</p>
            <div className="flex flex-wrap gap-3">
              {pagination.page > 1 ? (
                <Link className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={previousPageHref}>
                  Previous
                </Link>
              ) : (
                <span className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-300">
                  Previous
                </span>
              )}
              {pagination.page < pagination.totalPages ? (
                <Link className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={nextPageHref}>
                  Next
                </Link>
              ) : (
                <span className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-300">
                  Next
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
