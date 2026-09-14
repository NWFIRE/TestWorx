import { Check } from "lucide-react";

import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function PricingCard({
  name,
  subtitle,
  price,
  cadence,
  features,
  ctaLabel,
  featured,
  secondaryText,
  href
}: {
  name: string;
  subtitle: string;
  price: string;
  cadence: string;
  features: string[];
  ctaLabel: string;
  featured?: boolean;
  secondaryText?: string;
  href: string;
}) {
  return (
    <article
      className={cn(
        "relative flex min-h-[460px] min-w-0 flex-col rounded-lg border bg-white p-7 md:p-8",
        featured
          ? "border-blue-400 shadow-sm"
          : "border-slate-200"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">{name}</p>
        {featured ? <span className="rounded-md bg-blue-700 px-3 py-1 text-xs font-semibold text-white">Most Popular</span> : null}
      </div>
      <p className="mt-4 text-base leading-7 text-slate-600">{subtitle}</p>
      <div className="mt-8 flex flex-wrap items-end gap-2">
        <span className="text-4xl font-bold tracking-[-0.05em] text-slate-950">{price}</span>
        <span className="pb-1 text-sm text-slate-500">{cadence}</span>
      </div>
      <div className="mt-8 border-t border-slate-200/95 pt-6">
        <ul className="space-y-3">
          {features.map((feature) => (
            <li key={feature} className="flex gap-3 text-sm leading-7 text-slate-600">
              <Check className="mt-1 h-4 w-4 shrink-0 text-blue-600" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-auto pt-8">
        {featured ? <PrimaryButton className="w-full" href={href}>{ctaLabel}</PrimaryButton> : <SecondaryButton className="w-full" href={href}>{ctaLabel}</SecondaryButton>}
        {secondaryText ? <p className="mt-4 text-sm leading-6 text-slate-500">{secondaryText}</p> : null}
      </div>
    </article>
  );
}
