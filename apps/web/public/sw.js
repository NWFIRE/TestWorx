const CACHE_VERSION = "tradeworx-pwa-v1";
const APP_SHELL_CACHE = `${CACHE_VERSION}:app-shell`;
const ASSET_CACHE = `${CACHE_VERSION}:assets`;
const LAST_TECH_NAVIGATION_KEY = "last-tech-navigation";
const TECH_NAVIGATION_FALLBACKS = [
  "/app/tech",
  "/app/tech/work",
  "/app/tech/inspections",
  "/app/tech/manuals",
  "/app/tech/profile",
  "/app"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(ASSET_CACHE).then((cache) => cache.addAll([
      "/manifest.webmanifest",
      "/icon.png",
      "/apple-icon.png"
    ]).catch(() => undefined))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith("tradeworx-pwa-") && !cacheName.startsWith(CACHE_VERSION))
        .map((cacheName) => caches.delete(cacheName))
    );
    await self.clients.claim();
  })());
});

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isStaticAssetRequest(request) {
  const url = new URL(request.url);
  return request.method === "GET" && (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/icon.png" ||
    url.pathname === "/apple-icon.png" ||
    url.pathname === "/manifest.webmanifest"
  );
}

function isTechnicianNavigation(request) {
  if (request.mode !== "navigate" || request.method !== "GET" || !isSameOrigin(request)) {
    return false;
  }

  const url = new URL(request.url);
  return url.pathname === "/app" || url.pathname.startsWith("/app/tech");
}

async function rememberLastTechnicianNavigation(request) {
  const cache = await caches.open(APP_SHELL_CACHE);
  await cache.put(LAST_TECH_NAVIGATION_KEY, new Response(new URL(request.url).pathname, {
    headers: { "content-type": "text/plain; charset=utf-8" }
  }));
}

async function readLastTechnicianNavigation() {
  const cache = await caches.open(APP_SHELL_CACHE);
  const response = await cache.match(LAST_TECH_NAVIGATION_KEY);
  return response ? response.text() : null;
}

function offlineFallbackResponse() {
  return new Response(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0B1730" />
    <title>TradeWorx Offline</title>
    <style>
      :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #eef3f8; color: #0f172a; }
      body { margin: 0; min-height: 100vh; min-height: 100dvh; display: grid; place-items: center; padding: max(1rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom)); }
      main { width: min(100%, 430px); border: 1px solid #d8e2ee; border-radius: 28px; background: #fff; padding: 24px; box-shadow: 0 20px 55px rgba(15, 23, 42, 0.12); }
      .badge { display: inline-flex; min-height: 32px; align-items: center; border-radius: 999px; background: #dbeafe; color: #1d4ed8; padding: 0 12px; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      h1 { margin: 18px 0 0; font-size: 28px; letter-spacing: -.04em; line-height: 1.05; }
      p { margin: 12px 0 0; color: #52627a; line-height: 1.6; font-size: 15px; }
      .actions { display: grid; gap: 10px; margin-top: 22px; }
      a, button { min-height: 48px; border-radius: 16px; border: 1px solid #d8e2ee; background: #f8fafc; color: #1e3a5f; font-weight: 700; text-decoration: none; display: flex; align-items: center; justify-content: center; font-size: 15px; }
      button { width: 100%; cursor: pointer; }
      .primary { background: #1e3a5f; color: white; border-color: #1e3a5f; }
    </style>
  </head>
  <body>
    <main>
      <span class="badge">Offline mode</span>
      <h1>TradeWorx is ready when service returns</h1>
      <p>The app could not reach the network from this device. If this iPhone or iPad has opened TradeWorx recently, use Try again to load the cached technician workspace.</p>
      <p>Inspection changes already saved on this device will stay local and sync when service comes back.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a href="/app/tech/inspections">Open inspections</a>
        <a href="/app/tech/profile">Open sync</a>
      </div>
    </main>
  </body>
</html>`, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstTechnicianNavigation(request) {
  const cache = await caches.open(APP_SHELL_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      await rememberLastTechnicianNavigation(request);
    }
    return response;
  } catch {
    const exact = await cache.match(request);
    if (exact) {
      return exact;
    }

    const lastNavigation = await readLastTechnicianNavigation();
    const candidates = [
      lastNavigation,
      ...TECH_NAVIGATION_FALLBACKS
    ].filter(Boolean);

    for (const pathname of candidates) {
      const cached = await cache.match(new Request(new URL(pathname, self.location.origin), {
        method: "GET",
        credentials: "same-origin"
      }));
      if (cached) {
        return cached;
      }
    }

    return offlineFallbackResponse();
  }
}

async function warmTechnicianCache(urls) {
  const cache = await caches.open(APP_SHELL_CACHE);
  for (const pathname of urls) {
    try {
      const request = new Request(new URL(pathname, self.location.origin), {
        method: "GET",
        credentials: "same-origin",
        headers: { "X-TradeWorx-Prefetch": "technician-offline" }
      });
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(request, response.clone());
      }
    } catch {
      // Ignore warm-cache misses; normal navigation will still cache successful pages.
    }
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "TRADEWORX_WARM_TECH_CACHE" && Array.isArray(event.data.urls)) {
    event.waitUntil(warmTechnicianCache(event.data.urls));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (!isSameOrigin(request)) {
    return;
  }

  if (isStaticAssetRequest(request)) {
    event.respondWith(cacheFirstAsset(request));
    return;
  }

  if (isTechnicianNavigation(request)) {
    event.respondWith(networkFirstTechnicianNavigation(request));
  }
});
