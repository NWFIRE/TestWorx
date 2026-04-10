import { getQuoteTermsContent } from "@testworx/lib";

export function QuoteProjectTermsCard({
  className = "",
  customerNotes,
  primaryColor
}: {
  className?: string;
  customerNotes?: string | null;
  primaryColor?: string;
}) {
  const terms = getQuoteTermsContent();

  return (
    <section className={`rounded-[24px] border border-slate-200 bg-white p-5 sm:p-6 ${className}`}>
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">{terms.title}</h3>
          {terms.intro ? <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{terms.intro}</p> : null}
        </div>

        <div
          className="rounded-[22px] border p-5"
          style={{
            borderColor: primaryColor ? `${primaryColor}22` : undefined,
            background: primaryColor ? `linear-gradient(180deg, ${primaryColor}0d, rgba(255,255,255,0.98))` : undefined
          }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: primaryColor ?? "var(--tenant-primary)" }}>
            {terms.emphasisTitle}
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-700">{terms.emphasisBody}</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {terms.sections.map((section) => (
            <div key={section.title} className="rounded-[20px] border border-slate-200 bg-slate-50/55 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-700">{section.title}</p>
              {section.body?.length ? (
                <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              ) : null}
              {section.bullets?.length ? (
                <ul className="mt-3 space-y-2.5 text-sm leading-7 text-slate-600">
                  {section.bullets.map((bullet) => (
                    <li className="flex gap-3" key={bullet}>
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>

        {customerNotes?.trim() ? (
          <div className="rounded-[20px] border border-slate-200 bg-slate-50/55 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-700">Additional Quote Notes</p>
            <p className="mt-3 text-sm leading-7 text-slate-600">{customerNotes}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
