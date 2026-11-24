/** Only reuse the same-origin window that explicitly launched this Scheduler. */
export function openInspectionInOriginalWindow(href: string) {
  try {
    const original = window.opener as Window | null;
    if (!original || original.closed || original.location.origin !== window.location.origin) return false;
    original.location.assign(href);
    try { original.focus(); } catch { /* Browser focus policies must not trigger a second navigation. */ }
    return true;
  } catch {
    return false;
  }
}
