import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../../../apps/web/public/sw.js", import.meta.url), "utf8");
const request = new Request("https://tradeworx.test/app/tech/inspections");
const html = () => new Response("inspection", { headers: { "content-type": "text/html" } });

function setup() {
  const cache = { put: vi.fn().mockResolvedValue(undefined), match: vi.fn().mockResolvedValue(undefined) };
  const caches = { open: vi.fn().mockResolvedValue(cache), match: vi.fn().mockResolvedValue(undefined) };
  const fetch = vi.fn().mockResolvedValue(html());
  const context = { Request, Response, URL, caches, fetch, self: { location: { origin: "https://tradeworx.test" }, addEventListener: vi.fn() } };
  const worker = runInNewContext(`${source}\n({networkFirstTechnicianNavigation, cacheFirstAsset, warmTechnicianCache, isTechnicianNavigation})`, context);
  return { worker, cache, caches, fetch };
}

describe("production service worker", () => {
  it("caches successful technician HTML", async () => {
    const { worker, cache } = setup();
    expect(await (await worker.networkFirstTechnicianNavigation(request)).text()).toBe("inspection");
    expect(cache.put).toHaveBeenCalledTimes(2);
  });

  it.each(["redirect", "json", "error"])("does not cache a %s as an inspection", async (kind) => {
    const { worker, cache, fetch } = setup();
    const response = kind === "json" ? Response.json({}) : kind === "error" ? new Response("error", { status: 500 }) : html();
    if (kind === "redirect") Object.defineProperty(response, "redirected", { value: true });
    fetch.mockResolvedValue(response);
    expect(await worker.networkFirstTechnicianNavigation(request)).toBe(response);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it.each(["open", "put"])("preserves live pages when cache %s fails", async (operation) => {
    const { worker, cache, caches } = setup();
    (operation === "open" ? caches.open : cache.put).mockRejectedValue(new Error("storage unavailable"));
    expect(await (await worker.networkFirstTechnicianNavigation(request)).text()).toBe("inspection");
  });

  it("preserves live assets when cache reads and writes fail", async () => {
    const { worker, cache, caches } = setup();
    caches.match.mockRejectedValue(new Error("storage unavailable"));
    cache.put.mockRejectedValue(new Error("quota exceeded"));
    expect(await (await worker.cacheFirstAsset(request)).text()).toBe("inspection");
  });

  it("serves cached HTML offline", async () => {
    const { worker, cache, fetch } = setup();
    fetch.mockRejectedValue(new Error("offline"));
    cache.match.mockResolvedValue(html());
    expect(await (await worker.networkFirstTechnicianNavigation(request)).text()).toBe("inspection");
  });

  it("provides an offline screen when network and storage are unavailable", async () => {
    const { worker, caches, fetch } = setup();
    fetch.mockRejectedValue(new Error("offline"));
    caches.open.mockRejectedValue(new Error("storage unavailable"));
    expect(await (await worker.networkFirstTechnicianNavigation(request)).text()).toContain("Offline mode");
  });

  it("only warms known routes and never caches redirected login HTML", async () => {
    const { worker, fetch, cache } = setup();
    const response = html();
    Object.defineProperty(response, "redirected", { value: true });
    fetch.mockResolvedValue(response);
    await worker.warmTechnicianCache(["https://other.test/app/tech", "/app/tech/manuals", null, "/app/tech"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("does not intercept similarly prefixed non-technician routes", () => {
    const { worker } = setup();
    const navigation = (path: string) => ({ url: `https://tradeworx.test${path}`, method: "GET", mode: "navigate" });
    expect(worker.isTechnicianNavigation(navigation("/app/technology"))).toBe(false);
    expect(worker.isTechnicianNavigation(navigation("/app/tech/inspections"))).toBe(true);
  });
});
