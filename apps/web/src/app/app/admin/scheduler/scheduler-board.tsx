"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { fieldProgress, localDateTime, scheduleLanes, schedulerDisplayEnd, schedulerRange, scheduleDurationHours, scheduleEndForDuration, shiftSchedulerDate, type SchedulerData, type SchedulerJob } from "@testworx/lib/scheduler-shared";
import { getInspectionTypeTextColorClass } from "../../inspection-type-inline-list";
import styles from "./scheduler.module.css";
import banner from "../../page-banner.module.css";
import { ServiceDirections } from "../../service-directions";
import { ScheduleDateTime } from "../schedule-date-time";
import { ScheduleDuration } from "../schedule-duration";
import { ResizeHandle } from "./resize-handle";
import { openInspectionInOriginalWindow } from "./open-inspection";
import { CreateJobDialog, type CreateJobOptions } from "./create-job-dialog";

const labelType = (type: string) => type.replaceAll("_", " ");
export function SchedulerBoard({ initial, initialView, createOptions }: { initial: SchedulerData; initialView: "day" | "week"; createOptions: CreateJobOptions }) {
  const [data, setData] = useState(initial), [date, setDate] = useState(initial.days[0]!), [view, setView] = useState(initialView);
  const [now, setNow] = useState(() => Date.now()), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SchedulerJob | null>(null), [panel, setPanel] = useState(false), [editing, setEditing] = useState(false);
  const [query, setQuery] = useState(""), [matches, setMatches] = useState<SchedulerJob[]>([]), [searching, setSearching] = useState(false);
  const [start, setStart] = useState(""), [end, setEnd] = useState(""), [ids, setIds] = useState<string[]>([]), [version, setVersion] = useState("");
  const [saveError, setSaveError] = useState(""), [conflicts, setConflicts] = useState<string[]>([]), [allowOverlap, setAllowOverlap] = useState(false), [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), refresh = useRef<() => void>(() => {}), saveBusy = useRef(false);
  const selectedId = useRef<string | null>(null);
  const outsidePress = useRef(false);
  const [resizePreview, setResizePreview] = useState<{id: string; end: string} | null>(null);
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => { selectedId.current = panel ? selected?.id ?? null : null; }, [selected?.id, panel]);
  const timezone = data.timezone, today = localDateTime(new Date(now), timezone).slice(0, 10);
  const current = selected ? data.jobs.find((job) => job.id === selected.id) ?? selected : null;
  const stale = Boolean(error) || now - new Date(data.fetchedAt).getTime() > 45000;
  const timeFormatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" });
  const time = (value: string) => timeFormatter.format(new Date(value));
  const planned = (job: SchedulerJob) => job.scheduledEnd ? `${time(job.scheduledStart)} - ${time(job.scheduledEnd)}` : `${time(job.scheduledStart)} · End not set`;
  const belongs = (job: SchedulerJob, id: string) => id === "unassigned" ? !job.technicianIds.length : job.technicianIds.includes(id);
  const dayRanges = new Map(data.days.map((day) => [day, schedulerRange(day, "day", timezone)]));
  const onDay = (job: SchedulerJob, day: string) => {
    const range = dayRanges.get(day)!;
    const start = new Date(job.scheduledStart);
    return job.scheduledEnd ? start < range.end && new Date(job.scheduledEnd) > range.start : start >= range.start && start < range.end;
  };
  function navigate(next: string, nextView = view) {
    setDate(next); setView(nextView);
    window.history.pushState(null, "", `/app/admin/scheduler?date=${next}&view=${nextView}`);
  }
  useEffect(() => {
    const pop = () => { const p = new URLSearchParams(window.location.search); setDate(p.get("date") || initial.days[0]!); setView(p.get("view") === "week" ? "week" : "day"); };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [initial.days]);
  useEffect(() => {
    let disposed = false, controller: AbortController | null = null;
    async function run() {
      if (document.hidden) return;
      controller?.abort(); controller = new AbortController(); const request = controller;
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/scheduler?date=${date}&view=${view}`, { cache: "no-store", signal: request.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to refresh Scheduler.");
        if (!disposed && !request.signal.aborted) { setData(result); setError(""); }
        const id = selectedId.current;
        if (id && !result.jobs.some((job: SchedulerJob) => job.id === id)) {
          const detail = await fetch(`/api/admin/scheduler?id=${encodeURIComponent(id)}`, { cache: "no-store", signal: request.signal });
          const payload = await detail.json();
          if (!detail.ok) throw new Error(payload.error || "Job unavailable.");
          if (!disposed && !request.signal.aborted && selectedId.current === id) setSelected(payload.job);
        }
      } catch (caught) { if (!disposed && !request.signal.aborted) setError(caught instanceof Error ? caught.message : "Connection lost."); }
      finally { if (!disposed && !request.signal.aborted) setLoading(false); }
    }
    refresh.current = () => void run(); void run();
    const tick = window.setInterval(() => { setNow(Date.now()); void run(); }, 15000);
    const reconnect = () => void run();
    window.addEventListener("online", reconnect); window.addEventListener("focus", reconnect); document.addEventListener("visibilitychange", reconnect);
    return () => { disposed = true; controller?.abort(); window.clearInterval(tick); window.removeEventListener("online", reconnect); window.removeEventListener("focus", reconnect); document.removeEventListener("visibilitychange", reconnect); };
  }, [date, view]);
  useEffect(() => {
    if (!panel || selected || query.trim().length < 2) { setMatches([]); setSearching(false); return; }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/admin/scheduler?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!controller.signal.aborted) { setMatches(result.jobs); setSaveError(""); }
      } catch (caught) { if (!controller.signal.aborted) setSaveError(caught instanceof Error ? caught.message : "Search failed."); }
      finally { if (!controller.signal.aborted) setSearching(false); }
    }, 400);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [query, panel, selected]);
  useEffect(() => {
    if (!panel) return;
    const opener = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); opener?.focus({ preventScroll: true }); };
  }, [panel]);
  function edit(job: SchedulerJob) {
    setSelected(job); setEditing(true); setVersion(job.updatedAt); setStart(localDateTime(job.scheduledStart, timezone));
    setEnd(job.scheduledEnd ? localDateTime(job.scheduledEnd, timezone) : ""); setIds(job.technicianIds);
    setSaveError(""); setConflicts([]); setAllowOverlap(false);
  }
  function changeStart(next: string) {
    const hours = scheduleDurationHours(start, end, timezone);
    setStart(next);
    if (next && hours) {
      try { setEnd(scheduleEndForDuration(next, Number(hours), timezone)); setSaveError(""); }
      catch (error) { setSaveError(error instanceof Error ? error.message : "Choose a valid time."); }
    }
  }
  function open(job?: SchedulerJob) {
    setSelected(job ?? null); setEditing(!job); setQuery(""); setMatches([]); setSaveError(""); setConflicts([]); setAllowOverlap(false); setPanel(true);
  }
  function closePanel() {
    if (saveBusy.current) return;
    const dirty = editing && selected && (start !== localDateTime(selected.scheduledStart, timezone) || end !== (selected.scheduledEnd ? localDateTime(selected.scheduledEnd, timezone) : "") || JSON.stringify(ids) !== JSON.stringify(selected.technicianIds));
    if (dirty && !window.confirm("Discard unsaved schedule changes?")) return;
    setPanel(false);
  }
  async function resize(job: SchedulerJob, nextEnd: string) {
    if (saveBusy.current) return;
    saveBusy.current = true; setSaving(true); setNotice("Saving duration...");
    try {
      const response = await fetch("/api/admin/scheduler", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId: job.id, updatedAt: job.updatedAt, start: localDateTime(job.scheduledStart, timezone), end: localDateTime(nextEnd, timezone), technicianIds: job.technicianIds, resizeOnly: true }) });
      const result = await response.json();
      if (result.conflicts) {
        edit(job); setEnd(localDateTime(nextEnd, timezone)); setPanel(true);
        setConflicts(result.conflicts.map((conflict: {customer: string}) => conflict.customer));
        setNotice("Duration not saved: review the scheduling overlap."); return;
      }
      if (!response.ok) throw new Error(result.error || "Duration could not be saved.");
      setData(old => ({...old, jobs: old.jobs.map(existing => existing.id === result.job.id ? result.job : existing)}));
      setNotice("Scheduled duration updated."); refresh.current();
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "Unable to save duration. Try again."); refresh.current(); }
    finally { saveBusy.current = false; setSaving(false); }
  }
  function resizeHandle(job: SchedulerJob, vertical = false) {
    if (job.archived || ["completed", "invoiced", "cancelled"].includes(job.status)) return null;
    return <ResizeHandle start={job.scheduledStart} end={schedulerDisplayEnd(job)} label={job.customer || job.site} vertical={vertical} disabled={saving}
      onPreview={end => setResizePreview(end ? {id: job.id, end} : null)} onCommit={end => void resize(job, end)} />;
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!selected || saveBusy.current) return;
    saveBusy.current = true; setSaving(true); setSaveError("");
    try {
      const response = await fetch("/api/admin/scheduler", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId: selected.id, updatedAt: version, start, end, technicianIds: ids, allowOverlap }) });
      const result = await response.json();
      if (result.conflicts) { setConflicts(result.conflicts.map((c: { customer: string }) => c.customer)); return; }
      if (!response.ok) throw new Error(result.error || "Schedule could not be saved.");
      setSelected(result.job); setEditing(false); setData((old) => ({ ...old, jobs: old.jobs.map((j) => j.id === result.job.id ? result.job : j) })); refresh.current();
    } catch (caught) { setSaveError(caught instanceof Error ? caught.message : "Unable to save."); }
    finally { saveBusy.current = false; setSaving(false); }
  }
  function card(job: SchedulerJob, technicianId: string, compact = false) {
    const displayJob = resizePreview?.id === job.id ? {...job, scheduledEnd: resizePreview.end} : job;
    return <button type="button" key={job.id} className={styles.card} onClick={() => open(job)} title={`${job.customer} · ${job.site} · ${planned(displayJob)} · ${fieldProgress(job, now, technicianId)}`}>
      <span className={`${styles.accent} ${getInspectionTypeTextColorClass(job.types[0])}`} aria-hidden="true" />
      <strong>{job.customer || job.site}</strong><span>{planned(displayJob)}</span><small>{fieldProgress(job, now, technicianId)}</small>
      {!compact && job.site && job.site !== job.customer && <small>{job.site}</small>}
    </button>;
  }
  const rows = [...data.technicians, { id: "unassigned", name: "Unassigned", isActive: true }];
  const range = schedulerRange(data.days[0]!, "day", timezone), from = range.start.getTime(), until = range.end.getTime();
  const hours = Array.from({ length: Math.ceil((until - from) / 3600000) }, (_, i) => new Date(from + i * 3600000));
  return <div className={styles.scheduler}>
    <header className={`${styles.toolbar} ${banner.banner} p-4`}><div><h1>Scheduler</h1><p className={banner.muted}>{timezone} · <span role="status">{stale ? "Updates delayed" : loading ? "Updating" : "Live · every 15 seconds"}</span></p></div>
      <div className={`${styles.controls} ${banner.actions}`}>
        <Link href="/app/admin/dashboard" className={styles.homeLink}>Home</Link>
        <button type="button" aria-label="Previous period" onClick={() => navigate(shiftSchedulerDate(date, view === "day" ? -1 : -7))}>Previous</button>
        <button type="button" onClick={() => navigate(today)}>Today</button>
        <button type="button" aria-label="Next period" onClick={() => navigate(shiftSchedulerDate(date, view === "day" ? 1 : 7))}>Next</button>
        <input aria-label="Schedule date" type="date" value={date} onChange={(e) => { if (e.target.value) navigate(e.target.value); }} />
        <div className={styles.viewSwitch} role="group" aria-label="Calendar view"><button type="button" aria-pressed={view === "day"} onClick={() => navigate(date, "day")}>Day</button><button type="button" aria-pressed={view === "week"} onClick={() => navigate(date, "week")}>Week</button></div>
        <button className={styles.primary} type="button" onClick={() => setCreating(true)}>Add Job</button>
      </div>
    </header>
    {creating && <CreateJobDialog options={createOptions} date={date} onClose={() => setCreating(false)} onCreated={message => { setNotice(message); refresh.current(); }} />}
    {stale && <p role="status" className={styles.warning}>{error || "Displayed data may be stale."} Last updated {time(data.fetchedAt)}. <button type="button" onClick={() => refresh.current()}>Retry</button></p>}
    {data.truncated && <p className={styles.warning}>This range exceeds 2,000 visits. Use Day view to see a smaller range.</p>}
    <div role="status" aria-atomic="true" className={styles.resizeStatus}>{resizePreview ? `New end: ${new Intl.DateTimeFormat("en-US", {timeZone: timezone, month:"short", day:"numeric", hour:"numeric", minute:"2-digit"}).format(new Date(resizePreview.end))}` : notice}</div>
    <p className={styles.caption}>{data.days[0]}{data.days.length > 1 ? ` through ${data.days[6]}` : ""} · {data.jobs.length} visits</p>
    <div className={styles.board} tabIndex={0} aria-label={`${view} scheduling board`}>
      <div className={styles.desktop} style={{ minWidth: view === "day" ? 1776 : 1510 }}>
        <div className={styles.heading}><div className={styles.name}>Technician</div><div className={styles.axis}>
          {view === "day" ? hours.map((hour, i) => <span key={hour.toISOString()} style={{ left: `${i / hours.length * 100}%` }}>{time(hour.toISOString())}</span>)
            : data.days.map((day) => <button type="button" key={day} onClick={() => navigate(day, "day")}>{new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00Z`))}</button>)}
        </div></div>
        {rows.map((tech) => {
          const jobs = data.jobs.filter((j) => belongs(j, tech.id));
          const lanes = scheduleLanes(jobs, from, until), count = Math.max(1, ...lanes.map((l) => l.lane + 1));
          const tbd = jobs.filter((j) => !onDay(j, data.days[0]!) && j.sessions.some((s) => !s.endedAt));
          return <div key={tech.id} className={styles.row}><div className={styles.name}><strong>{tech.name}</strong><small>{tech.isActive ? `${jobs.length} visits` : "Inactive · existing assignments"}</small></div>
            {view === "week" ? <div className={styles.week}>{data.days.map((day) => <div key={day}>{jobs.filter((j) => onDay(j, day) || (day === today && j.sessions.some((s) => !s.endedAt))).map((job) => <div key={job.id} className={styles.weekJob}>{card(job, tech.id, true)}{resizeHandle(job, true)}</div>)}</div>)}</div>
              : <div className={styles.day}><div className={styles.timeline} data-day-minutes={(until - from) / 60000} style={{ height: count * 72 + 16, backgroundSize: `${100 / hours.length}% 100%` }}>
                {lanes.map(({ job, lane, left, width }) => <div key={job.id} className={styles.slot} data-scheduled-start={job.scheduledStart} style={{ top: lane * 72 + 8, left: `${left}%`, width: `${resizePreview?.id === job.id ? (Math.min(until, +new Date(resizePreview.end)) - Math.max(from, +new Date(job.scheduledStart))) / (until - from) * 100 : width}%` } as CSSProperties}>{card(job, tech.id, true)}{new Date(schedulerDisplayEnd(job)).getTime() <= until && resizeHandle(job)}</div>)}
                {!jobs.length && <p className={styles.gap}>No jobs scheduled</p>}
                {data.days[0] === today && now >= from && now < until && <span aria-label="Current time" className={styles.now} style={{ left: `${(now - from) / (until - from) * 100}%` }} />}
              </div>{tbd.length > 0 && <div className={styles.tbd}><span>Active outside planned day</span>{tbd.map((j) => card(j, tech.id, true))}</div>}</div>}
          </div>;
        })}
      </div>
      <div className={styles.agenda}>{rows.map((tech) => <section key={tech.id}><h2>{tech.name}</h2>{data.jobs.filter((j) => belongs(j, tech.id)).length ? data.jobs.filter((j) => belongs(j, tech.id)).map((j) => <div key={j.id}><small>{localDateTime(j.scheduledStart, timezone).slice(0, 10)}</small>{card(j, tech.id)}<ServiceDirections site={j.serviceLocation} customer={j.customerLocation} /></div>) : <p>No jobs scheduled</p>}</section>)}</div>
    </div>
    {panel && <dialog ref={dialog} className={styles.panel} aria-labelledby="scheduler-panel-title" onCancel={(e) => { e.preventDefault(); closePanel(); }}
      onPointerDown={event => { const rect = event.currentTarget.getBoundingClientRect(); outsidePress.current = event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom); }}
      onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); if (outsidePress.current && event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closePanel(); outsidePress.current = false; }}>
      <header><h2 id="scheduler-panel-title">{current ? current.customer : "Schedule an existing job"}</h2><button type="button" aria-label="Close job details" disabled={saving} onClick={closePanel}>Close</button></header>
      {!selected ? <><label>Find customer, site, or inspection<input autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type at least two characters" /></label>
        <p role="status">{searching ? "Searching..." : query.trim().length >= 2 && !matches.length ? "No matching open inspections." : "Choose an existing visit; no new inspection is created."}</p>
        {matches.map((job) => <button type="button" key={job.id} className={styles.result} onClick={() => edit(job)}><strong>{job.customer}</strong><span>{job.site} · {localDateTime(job.scheduledStart, timezone).slice(0, 10)} · {job.id.slice(-8)}</span></button>)}
      </> : current && <>
        <ServiceDirections key={current.id} site={current.serviceLocation} customer={current.customerLocation} editable />
        <dl><dt>Site</dt><dd>{current.site || current.customer}</dd><dt>Job type</dt><dd>{current.types.map(labelType).join(", ")}</dd>
          <dt>Assigned</dt><dd>{current.technicianIds.map((id) => data.technicians.find((t) => t.id === id)?.name || "Team member").join(", ") || "Unassigned"}</dd>
          <dt>Planned</dt><dd>{localDateTime(current.scheduledStart, timezone).slice(0, 10)} · {planned(current)}</dd><dt>Field progress</dt><dd>{fieldProgress(current, now)}</dd>
          <dt>Report workflow</dt><dd>{labelType(current.status)} (separate from field progress)</dd>
          <dt>Actual work</dt><dd>{current.sessions.length ? current.sessions.map((s, i) => <p key={`${s.technicianId}-${i}`}>{data.technicians.find((t) => t.id === s.technicianId)?.name}: {localDateTime(s.startedAt, timezone).replace("T", " ")} - {s.endedAt ? localDateTime(s.endedAt, timezone).replace("T", " ") : "Running"}</p>) : "Not started"}</dd></dl>
        <Link className={styles.link} onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && openInspectionInOriginalWindow(event.currentTarget.href)) event.preventDefault(); }} href={`/app/admin/inspections/${current.id}?from=${encodeURIComponent(`/app/admin/scheduler?date=${date}&view=${view}`)}`}>Open inspection</Link>
        {!editing && !["completed", "invoiced", "cancelled"].includes(current.status) && <button type="button" className={styles.primary} onClick={() => edit(current)}>Reschedule / reassign</button>}
        {editing && <form onSubmit={save} onChange={(e) => { if (!(e.target instanceof HTMLInputElement) || e.target.name !== "overlap") { setAllowOverlap(false); setConflicts([]); } }}>
          <p>Only this visit changes. Future recurring visits stay unchanged.</p>
          {current.updatedAt !== version && <p className={styles.warning}>This job changed while you were editing. <button type="button" onClick={() => edit(current)}>Reload details</button></p>}
          <ScheduleDateTime label={`Start (${timezone})`} required value={start} onChange={changeStart} />
          <ScheduleDuration value={scheduleDurationHours(start, end, timezone)} onChange={value => {
            if (!value) { setEnd(""); return; }
            try { setEnd(scheduleEndForDuration(start, Number(value), timezone)); setSaveError(""); }
            catch (error) { setSaveError(error instanceof Error ? error.message : "Choose a start time first."); }
          }} />
          <ScheduleDateTime label="End" required value={end} onChange={setEnd} />
          <fieldset><legend>Assigned technicians</legend>{data.technicians.filter((t) => t.isActive || ids.includes(t.id)).map((tech) => <label key={tech.id} className={styles.check}><input type="checkbox" checked={ids.includes(tech.id)} onChange={(e) => setIds((old) => e.target.checked ? [...old, tech.id] : old.filter((id) => id !== tech.id))} />{tech.name}{!tech.isActive ? " (inactive; remove before saving)" : ""}</label>)}</fieldset>
          {!!conflicts.length && <div className={styles.warning}>Overlaps: {conflicts.join(", ")}<label className={styles.check}><input name="overlap" type="checkbox" checked={allowOverlap} onChange={(e) => setAllowOverlap(e.target.checked)} />Schedule despite these overlaps</label></div>}
          <button type="submit" className={styles.primary} disabled={saving || !ids.length || current.updatedAt !== version}>{saving ? "Saving..." : "Save schedule"}</button>
        </form>}
      </>}
      {saveError && <p role="alert" className={styles.warning}>{saveError} {selected && <button type="button" onClick={() => { refresh.current(); if (current) edit(current); }}>Reload job details</button>}</p>}
    </dialog>}
  </div>;
}
