"use client";

const navigationStateKey = "tradeworx.navigation.v1";
const maxHistoryEntries = 40;
let memoryState: NavigationState | null = null;

export type NavigationState = {
  current: string | null;
  previous: string | null;
  entries: string[];
  updatedAt: number;
  deletedInspectionIds?: string[];
  repaired?: boolean;
};

function normalizeHref(href: string | null | undefined) {
  if (!href) {
    return "";
  }

  try {
    if (href.startsWith("http")) {
      const url = new URL(href);
      return `${url.pathname}${url.search}`;
    }
  } catch {
    return "";
  }

  return href.startsWith("/") ? href : `/${href}`;
}

function pathnameOnly(href: string) {
  return href.split(/[?#]/)[0] ?? href;
}

export function buildRouteHref(pathname: string | null, search?: string | null) {
  const path = pathname || "/";
  const query = search?.trim().replace(/^\?/, "") ?? "";
  return query ? `${path}?${query}` : path;
}

export function normalizeRouteHref(href: string | null | undefined) {
  return normalizeHref(href);
}

export function isTrackableAppHref(href: string | null | undefined) {
  const normalized = normalizeHref(href);
  return normalized.startsWith("/app");
}

function readSessionState(): NavigationState {
  if (typeof window === "undefined") {
    return { current: null, previous: null, entries: [], updatedAt: 0 };
  }

  try {
    const stored = window.sessionStorage.getItem(navigationStateKey);
    if (!stored) {
      return memoryState ?? { current: null, previous: null, entries: [], updatedAt: 0 };
    }

    const parsed = JSON.parse(stored) as Partial<NavigationState>;
    if (memoryState && memoryState.updatedAt >= (parsed.updatedAt ?? 0)) return memoryState;
    return {
      current: typeof parsed.current === "string" ? parsed.current : null,
      previous: typeof parsed.previous === "string" ? parsed.previous : null,
      entries: Array.isArray(parsed.entries) ? parsed.entries.filter((entry) => typeof entry === "string") : [],
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
      deletedInspectionIds: Array.isArray(parsed.deletedInspectionIds) ? parsed.deletedInspectionIds.filter((id) => typeof id === "string") : [],
      repaired: parsed.repaired === true
    };
  } catch {
    return memoryState ?? { current: null, previous: null, entries: [], updatedAt: 0 };
  }
}

function writeSessionState(state: NavigationState) {
  if (typeof window === "undefined") {
    return;
  }

  memoryState = state;
  try {
    window.sessionStorage.setItem(navigationStateKey, JSON.stringify(state));
  } catch {
    // Navigation memory is a convenience layer. Browser history still works without storage.
  }
}

function getSameOriginReferrer() {
  if (typeof window === "undefined" || typeof document === "undefined" || !document.referrer) {
    return null;
  }

  try {
    const referrer = new URL(document.referrer);
    return referrer.origin === window.location.origin ? `${referrer.pathname}${referrer.search}` : null;
  } catch {
    return null;
  }
}

export function rememberNavigationRoute(currentHref: string, options: { initial: boolean }) {
  if (!isTrackableAppHref(currentHref) || isDeletedInspectionRoute(currentHref)) {
    return;
  }

  const normalizedCurrent = normalizeHref(currentHref);
  const existing = readSessionState();
  const previousCandidate = options.initial ? getSameOriginReferrer() : existing.current;
  const previous = previousCandidate &&
    isTrackableAppHref(previousCandidate) &&
    !isDeletedInspectionRoute(previousCandidate) &&
    normalizeHref(previousCandidate) !== normalizedCurrent
    ? normalizeHref(previousCandidate)
    : existing.previous;

  const lastEntry = existing.entries[existing.entries.length - 1];
  const nextEntries = previous && previous !== lastEntry
    ? [...existing.entries, previous].slice(-maxHistoryEntries)
    : existing.entries.slice(-maxHistoryEntries);

  writeSessionState({
    ...existing,
    current: normalizedCurrent,
    previous,
    entries: nextEntries,
    updatedAt: Date.now()
  });
}

export function getStoredPreviousRoute(currentHref: string) {
  const current = normalizeHref(currentHref);
  const state = readSessionState();
  const candidates = [state.previous, ...state.entries.slice().reverse()];

  return candidates.find((candidate) => (
    isTrackableAppHref(candidate) &&
    !isDeletedInspectionRoute(candidate) &&
    normalizeHref(candidate) !== current
  )) ?? null;
}

export function hasSafeBrowserBackTarget(previousHref?: string | null) {
  if (typeof window === "undefined") {
    return false;
  }

  if (readSessionState().repaired || isDeletedInspectionRoute(previousHref) || window.history.length <= 1) {
    return false;
  }

  if (previousHref && isTrackableAppHref(previousHref)) {
    return true;
  }

  return Boolean(getSameOriginReferrer());
}

function matchesInspectionRoute(href: string | null | undefined, ids: string[]) {
  const path = pathnameOnly(normalizeHref(href));
  const match = path.match(/^\/app\/(?:admin|tech|customer)\/(?:inspections|reports|billing|archive)\/([^/]+)(?:\/|$)/);
  if (!match?.[1]) return false;
  try { return ids.includes(decodeURIComponent(match[1])); } catch { return false; }
}

export function isDeletedInspectionRoute(href: string | null | undefined) {
  return matchesInspectionRoute(href, readSessionState().deletedInspectionIds ?? []);
}

export function forgetDeletedInspectionRoutes(inspectionIds: string[]) {
  const state = readSessionState();
  const deletedInspectionIds = [...new Set([...(state.deletedInspectionIds ?? []), ...inspectionIds])];
  const keep = (href: string | null): href is string => Boolean(href) && !matchesInspectionRoute(href, deletedInspectionIds);
  const entries = state.entries.filter(keep);
  writeSessionState({
    ...state,
    current: keep(state.current) ? state.current : null,
    previous: keep(state.previous) ? state.previous : entries.at(-1) ?? null,
    entries,
    deletedInspectionIds,
    repaired: true,
    updatedAt: Date.now()
  });
}

// Browser history cannot remove older entries. After deletion, consume the
// cleaned app history explicitly instead of guessing where browser.back leads.
export function takeRepairedBackTarget(currentHref: string): string | null | undefined {
  const state = readSessionState();
  if (!state.repaired) return undefined;
  const target = getStoredPreviousRoute(currentHref);
  const index = target ? state.entries.lastIndexOf(target) : -1;
  const entries = index >= 0 ? state.entries.slice(0, index) : [];
  writeSessionState({ ...state, current: target, previous: entries.at(-1) ?? null, entries, updatedAt: Date.now() });
  return target;
}

export function resolveSmartBackFallback(pathname: string | null | undefined, explicitFallbackHref?: string | null) {
  const path = pathnameOnly(normalizeHref(pathname || "/"));

  const techReviewMatch = path.match(/^\/app\/tech\/reports\/([^/]+)\/([^/]+)\/review$/);
  if (techReviewMatch) {
    return `/app/tech/reports/${techReviewMatch[1]}/${techReviewMatch[2]}`;
  }

  if (/^\/app\/tech\/reports\/[^/]+\/[^/]+$/.test(path)) {
    return "/app/tech/inspections";
  }

  if (/^\/app\/tech\/inspections\/[^/]+\/documents\/[^/]+$/.test(path)) {
    return "/app/tech/inspections";
  }

  const adminReportMatch = path.match(/^\/app\/admin\/reports\/([^/]+)\/[^/]+$/);
  if (adminReportMatch) {
    return `/app/admin/inspections/${adminReportMatch[1]}`;
  }

  if (/^\/app\/admin\/inspections\/[^/]+$/.test(path)) {
    return "/app/admin/inspections";
  }

  if (/^\/app\/admin\/billing\/create$/.test(path) || /^\/app\/admin\/billing\/[^/]+$/.test(path)) {
    return "/app/admin/billing";
  }

  if (/^\/app\/admin\/clients\/[^/]+$/.test(path)) {
    return "/app/admin/clients";
  }

  if (/^\/app\/admin\/quotes\/new$/.test(path) || /^\/app\/admin\/quotes\/[^/]+$/.test(path)) {
    return "/app/admin/quotes";
  }

  if (/^\/app\/admin\/archive\/[^/]+$/.test(path)) {
    return "/app/admin/archive";
  }

  if (/^\/app\/admin\/manuals\/new$/.test(path) || /^\/app\/admin\/manuals\/[^/]+$/.test(path)) {
    return "/app/admin/manuals";
  }

  if (/^\/app\/admin\/customer-intakes\/[^/]+$/.test(path)) {
    return "/app/admin/customer-intakes";
  }

  if (/^\/app\/admin\/contract-providers\/[^/]+$/.test(path)) {
    return "/app/admin/contract-providers";
  }

  if (/^\/app\/customer\/reports\/[^/]+$/.test(path) || /^\/app\/customer\/inspections\/[^/]+$/.test(path)) {
    return "/app/customer";
  }

  if (/^\/app\/customer\/quotes\/[^/]+$/.test(path)) {
    return "/app/customer";
  }

  if (explicitFallbackHref) {
    return normalizeHref(explicitFallbackHref);
  }

  if (path.startsWith("/app/tech")) {
    return "/app/tech";
  }

  if (path.startsWith("/app/customer")) {
    return "/app/customer";
  }

  if (path.startsWith("/app/admin")) {
    return "/app/admin";
  }

  if (path.startsWith("/app")) {
    return "/app";
  }

  return "/login";
}
