# TradeWorx performance audit

## Release boundary

Work is isolated on `codex/performance-audit`, based on `82fcc66e`. No production database, production environment file, subscription provider, email provider, or deployment was used. Production release requires separate approval. There are no schema changes or data migrations in this change.

## Method and evidence

- Local `next build` / `next start`, Next 15.5.12, Node 24.13.0, PostgreSQL 18 on loopback port 55439. Authentication uses real seeded sessions, not mocked authorization.
- Baseline and comparison data: two isolated companies, 604 customers, 2,405 inspections and 2,410 reports, including similarly named customers in both companies. Additional portal/quote/document fixtures and a saved report edit were added **after** timing comparisons for correctness coverage.
- Desktop: Chromium, 1440 x 900, local office connection without artificial throttling. Phone: Chromium iPhone 13 emulation, 390 x 844, 150 ms latency, 200,000 bytes/sec download, 93,750 bytes/sec upload, 4x CPU slowdown. This is not a physical iPhone or Safari test.
- First visit clears HTTP cache; repeat visit retains it. Service workers are blocked in both versions to avoid mixing stale assets with the build under test. Browser cache is cold, but this is not a cold server/database restart for every route.
- Page timing is navigation through `load` plus the visible page/detail heading. It is a comparable **page-ready proxy**, not a proof that every field is interactive at that instant. Search and date-change timings wait for actual matching results/selected-day content. Additional browser checks exercise usable controls and server-confirmed saves.
- Timings below are one matched observation per condition, not medians, p95, or production SLAs. Some fast baseline pages become slightly slower; do not infer an improvement there. Localhost does not represent Vercel/database-region latency.
- Raw timings: `scripts/performance/results/baseline*.json`, `final.json`, `final-tech.json`. The later `release-tech.json` measures the final mobile-navigation adjustment separately; it follows correctness edits and must not be presented as an identical-data baseline pair.
- Technician report comparisons use `baseline-tech-report.json`, a corrected rerun waiting for the report heading rather than the surrounding shell heading. The earlier report entries in `baseline-tech.json` are not used.
- All 63 page routes are listed in `scripts/performance/results/route-inventory.json`. Final desktop/phone route logs identify the actual role, destination, heading, HTTP status, JavaScript errors, and document overflow. Redirect aliases are recorded as redirects, not separate detail screens. Invite/password pages were checked without completing token-based flows.
- Browser resource timings, server response timings, code tracing and PostgreSQL `pg_stat_statements` were compared. The final aggregate's highest-total-cost inspection query averaged 12.39 ms (362 calls); the large report query averaged 9.30 ms. These local SQL costs did not explain multi-second baseline waits by themselves. Repeated server CPU work, competing prefetch requests and oversized rendered collections were the first fixes; no speculative index migration was added.

## Changes

1. Removed blanket idle/sidebar, Home-row and inspection-row prefetching that generated competing server work for pages the user had not opened. Desktop sidebar hover/focus can still intentionally warm a destination. Technician bottom-navigation links no longer preload all tabs on a slow connection.
2. Indexed operational duplicate comparisons by customer, site and due period, calculating each period once instead of repeatedly comparing unrelated records. Tests preserve exact-winner, subset, recurrence-source and quantity behavior. This does not delete records.
3. Removed large report JSON from queue queries. Render at most 50 inspection rows, retaining the full matching count, URL filters and return path. Search still queries beyond the current page. The database still retrieves matching candidates needed for existing semantic de-duplication, so this is not unlimited-scale database pagination.
4. Replaced the inspection detail page's broad dashboard lookup with its narrower edit-option lookup. Existing inactive technician assignments remain available in detail editing; new scheduling still lists active staff.
5. Streamed Home attention and schedule independently. Existing eligibility predicates and queue links remain intact.
6. Reduced shared live-search delay from 1,200 to 200 ms and invalidated older customer requests immediately on input, before the next debounce fires. Fixed technician and search filters overwriting each other's `OR` predicates.
7. Scheduler uses its server-loaded range instead of immediately fetching it again. Creation form code/options load only when Add Job opens, with retry and cancellation. Existing date changes, polling and panel state remain in place.
8. Deferred Blob upload code until upload. Async transitions now stay pending through server-confirmed completion instead of ending while an unreturned promise is still running.
9. Fixed sidebar and technician notification hydration mismatches. Notification fallback caches are keyed by company and user, and discarded on authorization failure.
10. Added a bounded navigation render recovery for an observed production-build transition stall: the RSC response completed while the previous screen remained pending. It schedules at most three state updates, not another fetch, redirect, reload, or mutation. This matches the class of issue documented in [React issue 37830](https://github.com/react/react/issues/37830) and [backport 38013](https://github.com/react/react/pull/38013). It is a mitigation, not a claim that the upstream runtime is fixed; reevaluate after upgrading the bundled Next/React runtime.
11. The full phone sweep identified two more large HTML responses. Visit Review now renders 25 records per page; Upcoming renders 25 per month with independent month paging. Full totals and all months remain accessible. Pagination, the expanded target month, and detail return links retain URL state. The `pre-pagination-*-routes.json` logs preserve the findings that motivated this final adjustment.

## Correctness coverage and limits

Production build (including type checking) and workspace lint passed. The library suite passed with 840 tests and 14 skipped on a serial rerun; two initial default-worker timeouts disappeared without changing assertions. All 22 selected Playwright scheduler/layout/appointment tests passed. The separately enabled PostgreSQL integration suite is **not green**: its original fixtures omit a required report relationship and use outdated server exports/workflow setup. Diagnostic fixture repairs were not retained. This is an explicit release-validation gap, not a passing integration suite. No application validation was relaxed.

All 11 final signed-in production-browser checks passed, plus the separate unique-value failed-save/recovery check. Stored PDF bytes download successfully for the owning company and are denied to the other company, without changing inspection status. Evidence is in `verification.json` and `save-verification.json`.

The production-browser verifier checks empty-search focus (no directory request), out-of-order search responses, Home count versus the entire filtered queue, pagination and search reset, lazy scheduler creation, two-company access boundaries, read-only report viewing, phone overflow, and PDF browse/drop selection without submission. It also verifies that paged Visit Review/Upcoming lists reach distinct records and preserve totals and return URLs. Save verification simulates HTTP 503, checks a unique entered value and unchanged server version, restores connectivity, checks persisted text after reload, and checks technician progress from a second authenticated office session.

All 63 routes passed the final desktop and throttled-phone load/hydration/overflow smoke test. This is not exhaustive CRUD verification for every route. Existing regression tests cover scheduler Day/Week resizing, job popups, short windows, cancellation, conflicts, creation failures and upload-state behavior. No production release, real paid integration, real Blob upload, email delivery, physical-device Safari session, or live subscriber load test was performed. PDF browse/drop and PDF unit tests are not equivalent to a full external-storage upload/finalization test. A live multi-membership switch with offline caches and every export path was not fully exercised. Those remain release-validation gaps.

## Reproduction

Use a separate worktree without environment files and a disposable local PostgreSQL database named `tradeworx_perf`, owned by `perf`, on port 55439. The helper deliberately hardcodes loopback and refuses environment files; never substitute a production URL.

```text
node scripts/performance/local.cjs generate
node scripts/performance/local.cjs migrate
node scripts/performance/local.cjs seed
node scripts/performance/local.cjs scale
node scripts/performance/local.cjs build
node scripts/performance/local.cjs start
```

In a second terminal, run `node scripts/performance/measure.cjs <phase>`. Set `PERF_ROLE=tech` for technician timings. Run `seed-details.cjs` only after the paired measurements, then `audit-routes.cjs verified-desktop` and, with `PERF_PROFILE=slow-phone`, `audit-routes.cjs verified-phone`. Run `verify.cjs` and `verify-save.cjs` for correctness; the latter intentionally edits only the synthetic report. Run workloads serially to avoid CPU contention. Scale seeding refuses to duplicate its existing records.

Rollback is a code revert on the feature branch; no production data repair or reverse migration is needed. Before a future release, repeat the key checks in a production-like preview with representative storage and network topology, approve deployment separately, and monitor real-user timings/errors.

## Paired results (milliseconds)

Each cell is **before -> after**. Cold/repeat refer to browser HTTP cache.

| Workflow | Desktop first | Desktop repeat | Slow phone first | Slow phone repeat |
| --- | ---: | ---: | ---: | ---: |
| Home | 9249 -> 618 | 3525 -> 482 | 9652 -> 1942 | 9106 -> 846 |
| Inspection list | 11806 -> 584 | 7898 -> 516 | 19820 -> 2547 | 22446 -> 875 |
| Clients | 178 -> 378 | 227 -> 121 | 2239 -> 1889 | 591 -> 525 |
| Inspection detail | 8107 -> 472 | 5340 -> 387 | 11734 -> 2122 | 820 -> 859 |
| Scheduler | 6052 -> 480 | 4833 -> 473 | 11274 -> 1903 | 758 -> 685 |
| Billing | 5198 -> 372 | 5129 -> 453 | 12142 -> 1817 | 596 -> 535 |
| Settings | 5199 -> 459 | 4988 -> 499 | 14094 -> 1939 | 964 -> 767 |
| Technician work | 2784 -> 1676 | 2839 -> 877 | 3375 -> 3173 | 2529 -> 3133 |
| Technician report | 1922 -> 591 | 1057 -> 264 | 3077 -> 2596 | 1910 -> 913 |

| Action | Desktop before -> after | Slow phone before -> after |
| --- | ---: | ---: |
| Customer search, result beyond first page | 5516 -> 340 | 5757 -> 1004 |
| Scheduler next day | 263 -> 461 | 1271 -> 1040 |

The scheduler baseline action is from its separate warm-action run (`baseline-actions.json`), not the page-load run. Desktop day switching did not improve in this observation. Search meets the 500 ms office target but not that target under phone throttling. Repeat inspection page-ready proxy is below one second; an exact usable-fields before/after measurement is still needed. Phone LCP misses include inspection list (2524 ms), technician work repeat (2944 ms), and technician report first visit (2548 ms) in the paired run. Save feedback was 43 ms; recovery was confirmed in 407 ms in the unthrottled phone-sized correctness test, not the throttled timing run.

The final route sweep prompted an additional bounded-list improvement, measured with the same route-audit method (load plus a 300 ms hydration wait):

| Page | Desktop before -> after | Slow phone before -> after |
| --- | ---: | ---: |
| Visit Review | 4071 -> 965 | 8277 -> 1352 |
| Upcoming Inspections | 2603 -> 1463 | 6398 -> 2110 |

Final supplemental interaction test (`usable-inspection.json`): navigation through a successful Documents-tab click and mounted PDF chooser took **552 ms first / 423 ms repeat on desktop**, and **2696 ms first / 961 ms repeat on the throttled phone**. This confirms the repeat-visit target on the final code, but has no matched interactive baseline; do not substitute it for the paired heading/load measurements above.

Final technician run after removing mobile-tab preloads (`release-tech.json`): report first/repeat was 414/255 ms desktop and 2480/838 ms phone. Technician Work remained 3038/2779 ms on the phone, with repeat LCP 2732 ms, so that screen still misses the 2.5-second target. These supplemental runs include the post-measurement synthetic save fixtures. The report's phone first-load LCP improved to 2380 ms, but repeated sampling and real-device verification remain necessary before treating this as a subscriber SLA.
