"use client";

import { useId, useState } from "react";

/** Keep local wall time intact; the existing server action owns timezone conversion. */
export function ScheduleDateTime({ name, value, defaultValue = "", onChange, required = false, label }: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  label: string;
}) {
  const id = useId();
  const [local, setLocal] = useState(defaultValue);
  const [draftTime, setDraftTime] = useState("09:00");
  const current = value ?? local;
  const [date = "", time = draftTime] = current.split("T");
  const [hour = "09", minute = "00"] = time.split(":");
  const hourNumber = Number(hour);
  const update = (nextDate: string, nextHour: number, nextMinute: string) => {
    const nextTime = `${String(nextHour).padStart(2, "0")}:${nextMinute}`;
    setDraftTime(nextTime);
    const next = nextDate ? `${nextDate}T${nextTime}` : "";
    setLocal(next);
    onChange?.(next);
  };
  const field = "min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600";
  return <fieldset className="min-w-0">
    <legend className="mb-2 text-sm font-medium text-slate-600">{label}</legend>
    {name && <input type="hidden" name={name} value={current} />}
    <div className="flex flex-wrap items-center gap-2">
      <input id={id} aria-label={`${label} date`} type="date" required={required} value={date} onChange={event => update(event.target.value, hourNumber, minute)} className={`${field} basis-40 flex-1`} />
      <div className="grid flex-1 basis-52 grid-cols-3 gap-2">
        <select aria-label={`${label} hour`} value={hourNumber % 12 || 12} onChange={event => update(date, Number(event.target.value) % 12 + (hourNumber >= 12 ? 12 : 0), minute)} className={field}>
          {Array.from({length:12}, (_, index) => index + 1).map(hour => <option key={hour} value={hour}>{hour}</option>)}
        </select>
        <select aria-label={`${label} minute`} value={minute} onChange={event => update(date, hourNumber, event.target.value)} className={field}>
          {!['00', '15', '30', '45'].includes(minute) && <option value={minute}>{minute} (saved)</option>}
          {['00', '15', '30', '45'].map(minute => <option key={minute} value={minute}>{minute}</option>)}
        </select>
        <select aria-label={`${label} AM or PM`} value={hourNumber >= 12 ? "PM" : "AM"} onChange={event => update(date, hourNumber % 12 + (event.target.value === "PM" ? 12 : 0), minute)} className={field}>
          <option>AM</option><option>PM</option>
        </select>
      </div>
    </div>
  </fieldset>;
}
