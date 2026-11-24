"use client";

export function ScheduleInspectionFields({ enabled, dateTime, onToggle, onChange, description }: {
  enabled: boolean;
  dateTime: string;
  onToggle: (enabled: boolean) => void;
  onChange: (dateTime: string) => void;
  description: string;
}) {
  return <section className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold text-slate-900">
      <input type="checkbox" name="scheduleInspection" checked={enabled} onChange={event => onToggle(event.target.checked)} className="h-5 w-5 rounded border-slate-300" />
      Schedule Inspection
    </label>
    {enabled ? <div className="mt-3 min-w-0">
      <label htmlFor="inspectionAppointment" className="mb-2 block text-sm font-medium text-slate-600">Inspection date and time</label>
      <input id="inspectionAppointment" name="inspectionAppointment" type="datetime-local" required value={dateTime} onChange={event => onChange(event.target.value)} className="block min-h-11 w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900" />
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </div> : null}
  </section>;
}
