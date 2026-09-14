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
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-7">
      <div className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-blue-50 text-blue-700">
        {icon}
      </div>
      <h3 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-slate-950">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
    </article>
  );
}
