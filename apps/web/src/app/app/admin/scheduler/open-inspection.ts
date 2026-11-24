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

/** A window proxy may accept navigation without actually following it (notably in app windows). */
export async function openInspectionWithFallback(href: string): Promise<boolean> {
  const destination = new URL(href, window.location.href);
  if (destination.origin !== window.location.origin) return false;
  try {
    const original = window.opener as Window | null;
    if (original && original !== window && !original.closed && original.location.origin === destination.origin) {
      // Request foreground focus during the click, before navigation or an await loses activation.
      try { original.focus(); } catch { /* Still navigate if the browser declines foreground focus. */ }
      original.location.assign(destination.href);
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        if (original.closed) break;
        if (original.location.href === destination.href) {
          try { original.focus(); } catch { /* Focus can be blocked even after a successful navigation. */ }
          return true;
        }
        await new Promise(resolve => window.setTimeout(resolve, 100));
      }
    }
  } catch { /* Missing, cross-origin, or inaccessible openers use the current window. */ }
  window.location.assign(destination.href);
  return false;
}
