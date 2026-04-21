export function StepCard({
  step,
  title,
  body
}: {
  step: string;
  title: string;
  body: string;
}) {
  return (
    <article className="rounded-[20px] border border-slate-200 bg-slate-50/70 p-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">
        {step}
      </div>
      <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-slate-950">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-slate-600">{body}</p>
    </article>
  );
}
