import { localDateTime } from "./scheduler-shared";

type HomeJob = { id: string; scheduledStart: string | Date; status: string; jobTimeSessions?: { endedAt: string | Date | null }[] };

export function isCurrentHomeJob(job: HomeJob) {
  return job.jobTimeSessions ? job.jobTimeSessions.some(session => !session.endedAt) : job.status === "in_progress";
}

/** Only today's assigned work; promote a started job, otherwise the next timed stop. */
export function technicianHomeSchedule<T extends HomeJob>(jobs: T[], timezone: string, now = new Date()) {
  const today = localDateTime(now, timezone).slice(0, 10);
  const seen = new Set<string>();
  const rows = jobs.filter(job => {
    const start = new Date(job.scheduledStart);
    if (seen.has(job.id) || !Number.isFinite(start.getTime()) || job.status === "cancelled") return false;
    seen.add(job.id);
    return (job.jobTimeSessions?.some(session => !session.endedAt) ?? false) || localDateTime(start, timezone).slice(0, 10) === today;
  }).sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime() || a.id.localeCompare(b.id));
  const current = rows.find(isCurrentHomeJob)
    ?? rows.find(job => !["completed", "invoiced"].includes(job.status) && new Date(job.scheduledStart) >= now)
    ?? rows.find(job => !["completed", "invoiced"].includes(job.status));
  return current ? [current, ...rows.filter(job => job.id !== current.id)] : rows;
}
