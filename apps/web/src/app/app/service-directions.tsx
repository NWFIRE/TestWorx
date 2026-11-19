"use client";

import { useEffect, useState } from "react";
import { drivingDirectionsUrl, serviceDestination, type ServiceLocation } from "@testworx/lib/service-directions";

export function ServiceDirections({ site, editable = false }: { site?: ServiceLocation | null; editable?: boolean }) {
  const [location, setLocation] = useState(site);
  const [apple, setApple] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setLocation(site); }, [site]);
  useEffect(() => { setApple(/iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)); }, []);
  const resolved = serviceDestination(location);
  async function save(form: HTMLFormElement) {
    if (busy || !site?.id) return;
    const fields = new FormData(form);
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/sites/${encodeURIComponent(site.id)}/location`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(fields))
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save location.");
      setLocation(result.site); setEditing(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save location."); }
    finally { setBusy(false); }
  }
  return <div className="my-2 space-y-2 text-sm" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
    <div className="flex flex-wrap items-center gap-3">
      <span className="min-w-0 break-words text-slate-600">{resolved.address || (resolved.hasPin ? "Service entrance pin" : "Location needed")}</span>
      {resolved.destination && <a className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-blue-700 hover:bg-blue-50"
        href={drivingDirectionsUrl(resolved.destination, apple ? "iPhone" : "")} target="_blank" rel="noopener noreferrer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
        Get directions
      </a>}
      {resolved.hasPin && <span className="text-xs text-slate-500">Entrance pin</span>}
      {editable && site?.id && <button type="button" className="min-h-11 px-3 font-medium text-blue-700" onClick={() => setEditing(!editing)}>{resolved.destination ? "Edit location" : "Add location"}</button>}
    </div>
    {editing && <form className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void save(event.currentTarget); }}>
      <p className="text-xs text-slate-600 sm:col-span-2">Updates this service location for all inspections using it. Leave both coordinates blank to use the street address.</p>
      {([['addressLine1', 'Street address'], ['addressLine2', 'Unit / entrance'], ['city', 'City'], ['state', 'State'], ['postalCode', 'Postal code'], ['latitude', 'Latitude (-90 to 90)'], ['longitude', 'Longitude (-180 to 180)']] as const).map(([key, label]) => <label key={key} className="grid gap-1">{label}<input className="min-h-11 min-w-0 rounded-lg border border-slate-200 px-3" name={key} defaultValue={location?.[key] ?? ""} type={key === "latitude" || key === "longitude" ? "number" : "text"} step="any" /></label>)}
      {error && <p role="alert" className="text-red-700 sm:col-span-2">{error}</p>}
      <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-blue-700 px-3 text-white">{busy ? "Saving..." : "Save location"}</button>
      <button type="button" disabled={busy} className="min-h-11" onClick={() => setEditing(false)}>Cancel</button>
    </form>}
  </div>;
}
