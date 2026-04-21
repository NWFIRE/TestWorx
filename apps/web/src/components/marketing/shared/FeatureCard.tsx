import type { ReactNode } from "react";

export function FeatureCard({
  icon,
  title,
  description
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <article className="min-h-[190px] rounded-[20px] border border-slate-200/95 bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.05)] transition hover:shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-700">
        {icon}
      </div>
      <h3 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-slate-950">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
    </article>
  );
}
