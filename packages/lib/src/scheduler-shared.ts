import { normalizeTenantTimezone } from "./timezone";
import type { ServiceLocation, CustomerLocation } from "./service-directions";

export function localDateTime(value: string | Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: normalizeTenantTimezone(timezone), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function shiftSchedulerDate(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) throw new Error("Choose a valid date.");
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** Resolve wall-clock input without relying on the server/browser timezone. Reject DST gaps and folds. */
export function schedulerInstant(local: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error("Choose a date and time.");
  const naive = new Date(`${local}:00Z`).getTime();
  if (!Number.isFinite(naive)) throw new Error("Choose a valid date and time.");
  const matches = new Set<number>();
  for (const hours of [-36, 0, 36]) {
    const probe = naive + hours * 3600000;
    const offset = new Date(`${localDateTime(new Date(probe), timezone)}:00Z`).getTime() - probe;
    const candidate = naive - offset;
    if (localDateTime(new Date(candidate), timezone) === local) matches.add(candidate);
  }
  if (matches.size !== 1) throw new Error("That time is invalid or ambiguous during a daylight-saving change. Choose another time.");
  return new Date([...matches][0]!);
}

export function schedulerRange(day: string, view: "day" | "week", timezone: string) {
  shiftSchedulerDate(day, 0);
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const first = view === "week" ? shiftSchedulerDate(day, -((weekday + 6) % 7)) : day;
  const days = Array.from({ length: view === "week" ? 7 : 1 }, (_, i) => shiftSchedulerDate(first, i));
  return { days, start: schedulerInstant(`${first}T00:00`, timezone), end: schedulerInstant(`${shiftSchedulerDate(first, days.length)}T00:00`, timezone) };
}

export type SchedulerJob = {
  serviceLocation?: ServiceLocation;
  customerLocation?: CustomerLocation;
  id: string; customer: string; site: string; address: string; types: string[]; technicianIds: string[];
  scheduledStart: string; scheduledEnd: string | null; updatedAt: string; status: string;
  sessions: { technicianId: string; startedAt: string; endedAt: string | null; endReason: string | null }[];
};
export type SchedulerData = { timezone: string; days: string[]; fetchedAt: string; truncated: boolean;
  technicians: { id: string; name: string; isActive: boolean }[]; jobs: SchedulerJob[] };

export function fieldProgress(job: SchedulerJob, now: number, technicianId?: string) {
  const sessions = job.sessions.filter((s) => !technicianId || s.technicianId === technicianId);
  const active = sessions.some((s) => !s.endedAt);
  if (active) {
    const over = job.scheduledEnd ? Math.floor((now - new Date(job.scheduledEnd).getTime()) / 60000) : 0;
    return `In progress${over > 0 ? ` · ${over} min over` : ""}`;
  }
  if (job.status === "cancelled") return "Canceled";
  if (["completed", "invoiced"].includes(job.status)) return "Completed";
  const ordered = sessions.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  if (!technicianId && job.technicianIds.length > 1) {
    const finished = job.technicianIds.filter((id) => ["field_finished", "completed"].includes(ordered.find((s) => s.technicianId === id)?.endReason ?? "")).length;
    if (finished) return finished === job.technicianIds.length ? "Work finished" : `${finished} of ${job.technicianIds.length} technicians finished`;
  }
  const latest = ordered[0];
  if (latest?.endReason === "field_finished" || latest?.endReason === "completed") return "Work finished";
  return latest ? "Paused" : "Not started";
}

/** Stable interval partitioning: every overlapping appointment gets its own lane. */
export function scheduleLanes(jobs: SchedulerJob[], start: number, end: number) {
  const lanes: number[] = [];
  return jobs.filter((j) => j.scheduledEnd && new Date(j.scheduledStart).getTime() < end && new Date(j.scheduledEnd).getTime() > start)
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart) || a.id.localeCompare(b.id)).map((job) => {
      const from = Math.max(start, new Date(job.scheduledStart).getTime()), to = Math.min(end, new Date(job.scheduledEnd!).getTime());
      let lane = lanes.findIndex((until) => until <= from);
      if (lane === -1) lane = lanes.length;
      lanes[lane] = to;
      return { job, lane, left: (from - start) / (end - start) * 100, width: (to - from) / (end - start) * 100 };
    });
}
