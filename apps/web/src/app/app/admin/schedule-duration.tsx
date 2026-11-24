"use client";

export function ScheduleDuration({ name, value, defaultValue, onChange, required = false }: {
  name?: string; value?: string; defaultValue?: string; onChange?: (value: string) => void; required?: boolean;
}) {
  const choices = Array.from({length:48}, (_, index) => String((index + 1) / 2));
  const current = value ?? defaultValue ?? "";
  return <label className="my-3 block text-sm font-medium text-slate-600">
    Duration (hours)
    <select name={name} value={value} defaultValue={defaultValue} required={required} onChange={event => onChange?.(event.target.value)}
      className="mt-2 block min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-900">
      <option value="">Select duration</option>
      {current && !choices.includes(current) && <option value={current}>{Math.round(Number(current) * 60)} minutes (current)</option>}
      {choices.map(hours => <option key={hours} value={hours}>{hours} {hours === "1" ? "hour" : "hours"}</option>)}
    </select>
  </label>;
}
