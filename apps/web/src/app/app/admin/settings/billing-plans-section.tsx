type BillingPlan = {
  code: string;
  label: string;
  badge?: string;
  headline: string;
  description: string;
  highlight: string;
  features: string[];
  upgradeTriggers: string[];
  ctaLabel: string;
  highlighted: boolean;
  contactSales?: boolean;
  limits?: {
    users?: string;
    jobs?: string;
    automation?: string;
  };
  monthlyPriceCents: number;
  stripePriceId: string | null;
};

type BillingAddon = {
  id: string;
  name: string;
  description: string;
};

export function BillingPlansSection({
  addons,
  canManageSubscription,
  currentPlanCode,
  plans,
  startBillingCheckoutAction
}: {
  addons: BillingAddon[];
  canManageSubscription: boolean;
  currentPlanCode: string | null | undefined;
  plans: BillingPlan[];
  startBillingCheckoutAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <section className="space-y-5">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel sm:p-7">
        <div className="max-w-3xl">
          <p className="text-sm uppercase tracking-[0.28em] text-slate-500">Plans</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Choose the plan that fits how your service business runs now and where it is headed next.</h3>
          <p className="mt-3 text-sm leading-7 text-slate-500 sm:text-base">
            TradeWorx is structured to support a clear progression from getting organized, to automating growth, to operating with tighter control and compliance oversight.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrentPlan = currentPlanCode === plan.code;
            const cardClassName = plan.highlighted
              ? "border-[color:rgb(var(--tenant-primary-rgb)/0.28)] bg-[linear-gradient(180deg,rgba(var(--tenant-primary-rgb),0.08),rgba(255,255,255,0.98))] shadow-[0_28px_70px_rgba(15,23,42,0.12)]"
              : plan.contactSales
                ? "border-slate-300 bg-[linear-gradient(180deg,#ffffff,rgba(241,245,249,0.92))] shadow-[0_20px_48px_rgba(15,23,42,0.08)]"
                : "border-slate-200 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.06)]";

            return (
              <article
                key={plan.code}
                className={`pressable-surface flex h-full flex-col rounded-[2rem] border p-6 transition duration-200 hover:-translate-y-1 sm:p-7 ${cardClassName}`}
              >
                <div className="flex min-h-[4rem] flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-2xl font-semibold tracking-tight text-ink">{plan.label}</h4>
                      {plan.badge ? (
                        <span className="badge-brand-accent rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]">
                          {plan.badge}
                        </span>
                      ) : null}
                      {isCurrentPlan ? (
                        <span className="badge-brand-primary rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]">
                          Current plan
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-4 text-sm font-medium leading-6 text-slate-500">{plan.highlight}</p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-4xl font-semibold tracking-tight text-ink">${(plan.monthlyPriceCents / 100).toFixed(0)}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">per month</p>
                  </div>
                </div>

                <div className="mt-6">
                  <p className="text-xl font-semibold leading-tight text-ink">{plan.headline}</p>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{plan.description}</p>
                </div>

                {plan.limits ? (
                  <dl className="mt-6 grid gap-3 rounded-[1.5rem] border border-slate-200/80 bg-white/70 p-4 text-sm xl:grid-cols-3">
                    {plan.limits.users ? (
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Team fit</dt>
                        <dd className="mt-2 text-slate-700">{plan.limits.users}</dd>
                      </div>
                    ) : null}
                    {plan.limits.jobs ? (
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Ops scope</dt>
                        <dd className="mt-2 text-slate-700">{plan.limits.jobs}</dd>
                      </div>
                    ) : null}
                    {plan.limits.automation ? (
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Workflow depth</dt>
                        <dd className="mt-2 text-slate-700">{plan.limits.automation}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}

                <div className="mt-6 space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Included</p>
                  <ul className="space-y-2.5 text-sm text-slate-700">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-3">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--tenant-primary)]" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 space-y-3 border-t border-slate-200/80 pt-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Why teams upgrade</p>
                  <ul className="space-y-2.5 text-sm text-slate-600">
                    {plan.upgradeTriggers.map((trigger) => (
                      <li key={trigger} className="flex gap-3">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--tenant-accent)]" />
                        <span>{trigger}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {canManageSubscription ? (
                  <form action={startBillingCheckoutAction} className="mt-8">
                    <input name="planCode" type="hidden" value={plan.code} />
                    <button
                      className={`pressable ${plan.highlighted ? "pressable-filled btn-brand-primary" : "btn-brand-secondary"} min-h-12 w-full rounded-[1.25rem] border px-4 py-3 text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-50`}
                      disabled={!plan.stripePriceId}
                      type="submit"
                    >
                      {plan.ctaLabel}
                    </button>
                  </form>
                ) : (
                  <div className="mt-8 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    Tenant admins can start checkout or coordinate plan changes from this workspace.
                  </div>
                )}

                {plan.contactSales ? (
                  <p className="mt-3 text-xs leading-6 text-slate-500">Enterprise rollouts include coordination for onboarding, rollout planning, and operational support.</p>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.95))] p-6 shadow-panel sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-500">Add-ons</p>
            <h4 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Expand the platform as operations become more specialized.</h4>
            <p className="mt-2 text-sm leading-7 text-slate-500">These modules add depth where your team needs more automation, compliance support, or customer-facing polish.</p>
          </div>
          <p className="text-sm font-medium text-slate-500">Available as optional expansion, not bundled clutter.</p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {addons.map((addon) => (
            <div key={addon.id} className="rounded-[1.5rem] border border-slate-200 bg-white/90 p-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
              <p className="text-base font-semibold text-ink">{addon.name}</p>
              <p className="mt-2 text-sm leading-7 text-slate-500">{addon.description}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-white/80 px-5 py-4 text-sm leading-7 text-slate-600">
          Need help deciding? Professional is the right fit for most active field service companies. Enterprise is best when operational control, compliance complexity, and rollout support matter as much as core workflow depth.
        </div>
      </div>
    </section>
  );
}
