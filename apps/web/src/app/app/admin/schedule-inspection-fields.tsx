"use client";

import { ScheduleDateTime } from "./schedule-date-time";
import { ScheduleDuration } from "./schedule-duration";

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
      <ScheduleDateTime name="inspectionAppointment" label="Inspection" required value={dateTime} onChange={onChange} />
      <ScheduleDuration name="appointmentDurationHours" defaultValue="1" required />
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </div> : null}
  </section>;
}
