# Offline cache hardening

The service worker only stores successful, non-redirected HTML responses as
technician pages. Login redirects, error responses, and JSON are not offline
inspection pages. Cache storage failures do not discard successful network
responses; when both network and storage are unavailable, a standalone offline
screen is returned.

Root registration remains available for installation and static assets. Protected
page warming runs only for authenticated technicians visiting technician routes.
Warm requests are restricted to known routes; the nonexistent technician manuals
route has been removed. Activation listeners are removed when the component exits.

Cache version v2 replaces previous HTML/static caches, including any previously
cached login redirects. This does not clear IndexedDB inspection drafts, queued
uploads, or report data. Technicians should open their workspace online after
updating to replenish the HTML cache before working offline.

Regression coverage: `packages/lib/src/__tests__/service-worker.test.ts` executes
the served worker source with controlled network and storage failures.

Remaining review areas: authenticated cache ownership across account changes,
real-device offline transitions, and production-only workflows require further
verification. These changes do not claim to fully audit offline session isolation.
