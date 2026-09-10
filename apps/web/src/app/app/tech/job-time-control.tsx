"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getOfflineMeta, putOfflineMeta, listSyncQueueEntries, putSyncQueueEntry } from "./offline/offline-db";
import { queueJobTimeEvent, processSyncQueue, setJobTimeSyncUser } from "./offline/offline-sync";

type Session = { id: string; inspectionId: string; startedAt: string; endedAt: string | null; needsReview: boolean };
type Snapshot = { sessions: Session[]; active: (Session & { inspection?: { customerCompany: { name: string } } }) | null; closed: boolean; timezone: string };

export function useJobTime(inspectionId: string, userId?: string) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const refreshVersion = useRef(0);
  const refresh = useCallback(async () => {
    if (!userId) return;
    const version = ++refreshVersion.current;
    const key = `job-time:${userId}:${inspectionId}`;
    try {
      let data: Snapshot | null = null;
      const cached = await getOfflineMeta(key);
      if (cached?.value) data = JSON.parse(cached.value) as Snapshot;
      if (navigator.onLine) {
        const response = await fetch(`/api/tech/job-time?inspectionId=${encodeURIComponent(inspectionId)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to verify job time. Please reconnect or contact the office.");
        data = await response.json() as Snapshot;
        await putOfflineMeta(key, JSON.stringify(data));
      }
      const events = (await listSyncQueueEntries()).filter((entry) => entry.operation === "job_time_event" && entry.payload.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const conflict = events.find((entry) => entry.status === "conflict");
      if (conflict) { setError(conflict.lastError ?? "Job time needs office review."); setSnapshot(null); return; }
      if (!data) { setError("Connect once to load this job before starting offline."); return; }
      for (const event of events) {
        const payload = event.payload;
        if (payload.action === "start") {
          data.active = { id: String(payload.sessionId), inspectionId: String(payload.inspectionId), startedAt: String(payload.occurredAt), endedAt: null, needsReview: true };
          if (payload.inspectionId === inspectionId && !data.sessions.some((session) => session.id === payload.sessionId)) data.sessions.push(data.active);
        } else if (data.active?.id === payload.sessionId) {
          const session = data.sessions.find((item) => item.id === payload.sessionId);
          if (session) session.endedAt = String(payload.occurredAt);
          data.active = null;
        }
      }
      if (version !== refreshVersion.current) return;
      setSnapshot(data);
      setError(events.length ? "Job time saved on this device; waiting to sync." : "");
    } catch (caught) {
      if (version !== refreshVersion.current) return;
      setError(caught instanceof Error ? caught.message : "Unable to load job time.");
      if (navigator.onLine) setSnapshot(null);
    }
  }, [inspectionId, userId]);
  useEffect(() => {
    if (!userId) return;
    setJobTimeSyncUser(userId);
    void refresh();
    const run = () => { if (!document.hidden) void refresh(); };
    window.addEventListener("job-time-changed", run);
    window.addEventListener("focus", run);
    window.addEventListener("online", run);
    const interval = window.setInterval(run, 30_000);
    return () => { window.clearInterval(interval); window.removeEventListener("job-time-changed", run); window.removeEventListener("focus", run); window.removeEventListener("online", run); };
  }, [refresh, userId]);
  const active = snapshot?.active?.inspectionId === inspectionId ? snapshot.active : null;
  async function change(action: "start" | "pause", beforePause?: () => Promise<void>) {
    if (!userId || busy.current || !snapshot) return;
    busy.current = true; setPending(true);
    try {
      if (action === "pause") await beforePause?.();
      const current = snapshot.active;
      if (action === "pause" && !current) return;
      await queueJobTimeEvent({ userId, inspectionId: action === "pause" ? current!.inspectionId : inspectionId,
        sessionId: action === "pause" ? current!.id : crypto.randomUUID(), action, occurredAt: new Date().toISOString(), offline: !navigator.onLine });
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to change job time."); }
    finally { busy.current = false; setPending(false); }
  }
  async function retry() {
    if (busy.current || !userId) return;
    busy.current = true; setPending(true);
    try {
      for (const entry of await listSyncQueueEntries()) {
        if (entry.operation === "job_time_event" && entry.payload.userId === userId && ["conflict", "failed"].includes(entry.status)) await putSyncQueueEntry({ ...entry, status: "pending", lastError: null });
      }
      await processSyncQueue(); await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to retry job time."); }
    finally { busy.current = false; setPending(false); }
  }
  return { active, snapshot, error, pending, change, retry, canEdit: !userId || Boolean(active && !snapshot?.closed && !pending) };
}

export function JobTimeControl({ timer, beforePause }: { timer: ReturnType<typeof useJobTime>; beforePause?: () => Promise<void> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const interval = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(interval); }, []);
  const { snapshot, active, pending, error } = timer;
  const total = (snapshot?.sessions ?? []).reduce((sum, session) => sum + Math.max(0, new Date(session.endedAt ?? new Date(now).toISOString()).getTime() - new Date(session.startedAt).getTime()), 0);
  const minutes = Math.floor(total / 60_000);
  const otherJob = snapshot?.active && !active;
  return <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Job time">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-semibold text-slate-950">{snapshot?.closed ? "Job complete" : active ? "In progress" : snapshot?.sessions.length ? "Job paused" : "Start your job"}</p>
        <p className="mt-1 text-sm text-slate-500">{active ? `Started ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: snapshot?.timezone }).format(new Date(active.startedAt))}` : "Start or resume to edit. Finalizing the whole job stops time."} {minutes > 0 ? ` · ${Math.floor(minutes / 60)}h ${minutes % 60}m recorded` : ""}</p></div>
      {!snapshot?.closed && <button type="button" disabled={pending || !snapshot} onClick={() => void timer.change(active || otherJob ? "pause" : "start", beforePause)} className="min-h-12 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving..." : otherJob ? "Pause current job" : active ? "Pause job" : snapshot?.sessions.length ? "Resume job" : "Start job"}</button>}
    </div>
    {otherJob && <p className="mt-2 text-sm text-amber-800">Another job is running{snapshot?.active?.inspection?.customerCompany.name ? `: ${snapshot.active.inspection.customerCompany.name}` : ""}. Pause it before starting this job.</p>}
    {error && <p role="status" className="mt-2 text-sm text-amber-800">{error}</p>}
    {error && !snapshot && <button type="button" disabled={pending} className="mt-2 min-h-11 text-sm font-semibold text-blue-700" onClick={() => void timer.retry()}>Retry job time after office review</button>}
  </section>;
}
