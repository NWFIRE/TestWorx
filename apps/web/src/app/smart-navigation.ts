"use client";

const navigationStateKey = "tradeworx.navigation.v1";
const maxHistoryEntries = 40;

export type NavigationState = {
  current: string | null;
  previous: string | null;
  entries: string[];
  updatedAt: number;
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
      return { current: null, previous: null, entries: [], updatedAt: 0 };
    }

    const parsed = JSON.parse(stored) as Partial<NavigationState>;
    return {
      current: typeof parsed.current === "string" ? parsed.current : null,
      previous: typeof parsed.previous === "string" ? parsed.previous : null,
      entries: Array.isArray(parsed.entries) ? parsed.entries.filter((entry) => typeof entry === "string") : [],
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0
    };
  } catch {
    return { current: null, previous: null, entries: [], updatedAt: 0 };
  }
}

function writeSessionState(state: NavigationState) {
  if (typeof window === "undefined") {
    return;
  }

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
  if (!isTrackableAppHref(currentHref)) {
    return;
  }

  const normalizedCurrent = normalizeHref(currentHref);
  const existing = readSessionState();
  const previousCandidate = options.initial ? getSameOriginReferrer() : existing.current;
  const previous = previousCandidate &&
    isTrackableAppHref(previousCandidate) &&
    normalizeHref(previousCandidate) !== normalizedCurrent
    ? normalizeHref(previousCandidate)
    : existing.previous;

  const lastEntry = existing.entries[existing.entries.length - 1];
  const nextEntries = previous && previous !== lastEntry
    ? [...existing.entries, previous].slice(-maxHistoryEntries)
    : existing.entries.slice(-maxHistoryEntries);

  writeSessionState({
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
    normalizeHref(candidate) !== current
  )) ?? null;
}

export function hasSafeBrowserBackTarget(previousHref?: string | null) {
  if (typeof window === "undefined") {
    return false;
  }

  if (window.history.length <= 1) {
    return false;
  }

  if (previousHref && isTrackableAppHref(previousHref)) {
    return true;
  }

  return Boolean(getSameOriginReferrer());
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
