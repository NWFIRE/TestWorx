"use client";

function normalizePhoneHref(phone: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

export function InspectionCustomerContactCard({
  contactName,
  phone,
  email,
  compact = false
}: {
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  compact?: boolean;
}) {
  const trimmedName = contactName?.trim() || null;
  const trimmedPhone = phone?.trim() || null;
  const trimmedEmail = email?.trim() || null;
  const phoneHref = trimmedPhone ? normalizePhoneHref(trimmedPhone) : null;

  if (!trimmedName && !trimmedPhone && !trimmedEmail) {
    return null;
  }

  return (
    <div className={`rounded-[1.25rem] border border-slate-200 bg-slate-50 ${compact ? "px-3.5 py-3" : "px-4 py-4"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Customer contact</p>
      {trimmedName ? <p className="mt-2 text-sm font-semibold text-slate-950">{trimmedName}</p> : null}
      <div className={`mt-3 grid gap-2 ${trimmedPhone && trimmedEmail ? "sm:grid-cols-2" : "grid-cols-1"}`}>
        {trimmedPhone ? (
          phoneHref ? (
            <a
              className="flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
              href={phoneHref}
            >
              Call {trimmedPhone}
            </a>
          ) : (
            <div className="flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">
              {trimmedPhone}
            </div>
          )
        ) : null}
        {trimmedEmail ? (
          <a
            className="flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
            href={`mailto:${trimmedEmail}`}
          >
            Email customer
          </a>
        ) : null}
      </div>
    </div>
  );
}
