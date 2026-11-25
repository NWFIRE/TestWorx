import Link from "next/link";
import Stripe from "stripe";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@testworx/db";
import { getBillingConfiguration } from "@testworx/lib/src/billing";
import { subscriberFeaturesEnabled, subscriptionAccess } from "@testworx/lib/src/subscriber-policy";
import { PageHeader } from "../../operations-ui";
import { SubscriptionForm } from "./form";

export default async function SubscriptionPage() {
  if (!subscriberFeaturesEnabled()) notFound();
  const session = await auth({ subscriptionRecovery: true });
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "tenant_admin" || !session.user.tenantId) notFound();
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } });
  const config = getBillingConfiguration();
  let prices: string[] = [];
  if (process.env.STRIPE_SECRET_KEY && (process.env.APP_ENV !== "staging" || process.env.STRIPE_SECRET_KEY.startsWith("sk_test_"))) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      prices = await Promise.all(config.plans.filter(plan => plan.code !== "enterprise" && plan.stripePriceId).map(async plan => {
        const price = await stripe.prices.retrieve(plan.stripePriceId!);
        return `${plan.label}: ${price.unit_amount === null ? "See checkout" : new Intl.NumberFormat("en-US", { style: "currency", currency: price.currency }).format(price.unit_amount / 100)} / month`;
      }));
    } catch { prices = []; }
  }
  return <section className="mx-auto max-w-3xl space-y-5"><PageHeader eyebrow="Company Settings" title="Subscription" />
    <div className="space-y-5 rounded-2xl border bg-white p-6"><h2 className="text-xl font-semibold">{tenant.name}</h2>
      <dl className="grid gap-5 sm:grid-cols-2"><div><dt className="text-sm text-slate-500">Subscription status</dt><dd className="font-semibold">{tenant.subscriptionManaged ? tenant.stripeSubscriptionStatus ?? "Not subscribed" : "Existing business: billing activation not enabled"}</dd></div><div><dt className="text-sm text-slate-500">{tenant.stripeCancelAtPeriodEnd ? "Paid through" : "Next billing date"}</dt><dd>{tenant.stripeCurrentPeriodEndsAt?.toLocaleDateString("en-US", { timeZone: "UTC" }) ?? "Not set"}</dd></div></dl>
      <p>{prices.join(" · ") || "Monthly price is not configured in this environment."}</p>
      {tenant.subscriptionManaged && !subscriptionAccess(tenant) ? <p className="rounded-xl bg-amber-50 p-4 text-amber-900">Your company subscription needs attention. Records are preserved; support and billing management remain available.</p> : null}
      <SubscriptionForm connected={Boolean(tenant.stripeCustomerId)} canSubscribe={!tenant.stripeSubscriptionId || ["canceled", "incomplete_expired"].includes(tenant.stripeSubscriptionStatus ?? "")} managed={tenant.subscriptionManaged} enabled={config.enabled && config.webhookConfigured} />
      <div className="flex flex-wrap gap-4 text-blue-700"><Link href="/app/admin/settings">Company branding</Link><Link href="/app/admin/team">Invite team</Link><Link href="/app/help">Help</Link></div>
    </div>
  </section>;
}
