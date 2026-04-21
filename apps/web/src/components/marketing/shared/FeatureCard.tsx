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
    <article className="min-h-[180px] rounded-[20px] border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-700">
        {icon}
      </div>
      <h3 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-slate-950">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
    </article>
  );
}
