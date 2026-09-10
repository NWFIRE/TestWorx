"use client";
import { useState } from "react";

type Session = { id: string; technicianId: string; startedAt: string; endedAt: string | null; updatedAt: string; needsReview: boolean; technician: { name: string } };
function localInput(iso: string) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function JobTimeReview({ inspectionId }: { inspectionId: string }) {
  const [data, setData] = useState<{ sessions: Session[]; timezone: string; timeIssues?: Array<{ id: string; metadata: { message?: string } }> } | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function load() {
    try {
      const response = await fetch(`/api/tech/job-time?inspectionId=${encodeURIComponent(inspectionId)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load job time."); }
  }
  return <details className="rounded-2xl border border-slate-200 bg-white p-4" onToggle={(event) => { if (event.currentTarget.open) void load(); }}>
    <summary className="cursor-pointer font-semibold text-slate-950">Job time</summary>
    <p className="mt-2 text-sm text-slate-500">Recorded working sessions only. Does not change payroll or invoice labor.</p>
    {message && <p role="status" className="mt-2 text-sm text-amber-800">{message}</p>}
    {data?.timeIssues?.length ? <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">Recent time-sync issues</p>{data.timeIssues.map((issue) => <p key={issue.id} className="mt-1">{issue.metadata.message ?? "Contact the technician to review device time."}</p>)}</div> : null}
    {data && !data.sessions.length && <p className="mt-3 text-sm text-slate-500">No recorded job time.</p>}
    {data && <div className="mt-3 space-y-3">{Array.from(new Set(data.sessions.map((session) => session.technicianId))).map((technicianId) => {
      const sessions = data.sessions.filter((session) => session.technicianId === technicianId);
      const minutes = sessions.reduce((sum, session) => sum + Math.max(0, Date.parse(session.endedAt ?? new Date().toISOString()) - Date.parse(session.startedAt)) / 60000, 0);
      return <p key={technicianId} className="text-sm font-semibold">{sessions[0]?.technician.name}: {Math.floor(minutes / 60)}h {Math.floor(minutes % 60)}m</p>;
    })}{data.sessions.map((session) => <div key={`${session.id}:${session.updatedAt}`} className="rounded-xl border border-slate-200 p-3 text-sm">
      <p className="font-semibold">{session.technician.name}{session.needsReview ? " · Needs time review" : ""}</p>
      <p className="mt-1 text-slate-500">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: data.timezone }).format(new Date(session.startedAt))} to {session.endedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: data.timezone }).format(new Date(session.endedAt)) : "Running"} ({data.timezone})</p>
      <details className="mt-2"><summary className="cursor-pointer text-blue-700">Correct time</summary><form className="mt-2 space-y-2" onSubmit={async (event) => {
        event.preventDefault(); if (pending) return;
        const form = new FormData(event.currentTarget); setPending(true); setMessage("");
        try {
          const response = await fetch("/api/tech/job-time", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "correct", id: session.id, updatedAt: session.updatedAt, startedAt: new Date(String(form.get("start"))).toISOString(), endedAt: new Date(String(form.get("end"))).toISOString(), reason: form.get("reason") }) });
          const result = await response.json(); if (!response.ok) throw new Error(result.error);
          await load(); setMessage("Job time corrected. The reason is saved in the audit history.");
        } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to correct time."); }
        finally { setPending(false); }
      }}>
        <p className="text-xs text-slate-500">Enter times in this device&apos;s timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
        <label className="block">Start<input className="block min-h-11 w-full rounded-lg border p-2" name="start" type="datetime-local" defaultValue={localInput(session.startedAt)} required /></label>
        <label className="block">Finish<input className="block min-h-11 w-full rounded-lg border p-2" name="end" type="datetime-local" defaultValue={session.endedAt ? localInput(session.endedAt) : ""} required /></label>
        <label className="block">Correction reason<input className="block min-h-11 w-full rounded-lg border p-2" name="reason" required maxLength={1000} /></label>
        <button type="submit" disabled={pending} className="rounded-lg bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{pending ? "Saving..." : "Save correction"}</button>
      </form></details>
    </div>)}</div>}
  </details>;
}
