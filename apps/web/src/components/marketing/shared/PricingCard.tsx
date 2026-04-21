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
        "relative flex min-h-[460px] flex-col rounded-[24px] border bg-white p-7 md:p-8",
        featured
          ? "border-blue-300 shadow-[0_22px_60px_rgba(37,99,235,0.14)]"
          : "border-slate-200/95 shadow-[0_14px_30px_rgba(15,23,42,0.05)]"
      )}
    >
      {featured ? (
        <div className="absolute right-6 top-6 rounded-full border border-blue-500/20 bg-blue-700 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-[0_8px_18px_rgba(37,99,235,0.18)]">
          Most Popular
        </div>
      ) : null}
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">{name}</p>
      <p className="mt-4 text-base leading-7 text-slate-600">{subtitle}</p>
      <div className="mt-8 flex items-end gap-2">
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
