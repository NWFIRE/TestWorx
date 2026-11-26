# Subscriber staging handoff

## Release boundary

Private local and protected hosted sample-data evaluation, November 25, 2026. Branch: `codex/subscriber-support-staging`. Latest hosted evidence is in the current release gate review below; earlier local-only sections are historical.
No production deployment, production database migration, live charge, or external customer email was authorized or performed.
This is not yet approved for the first paying subscriber. Provider and workflow gaps below remain release gates.

## Audit and implementation

| Area | Existing state | Staging changes / remaining scope |
| --- | --- | --- |
| Company data | Tenant relationships and scoped services already existed | Reused these structures; tested selected direct links, search, scheduler, attachments and support isolation. A complete route/background-job authorization audit remains outstanding. |
| Authentication | Existing credentials, roles and team invitations | Inactive/deleted users now lose sessions. Subscription restrictions are server-side, with explicit recovery actions. No multi-company membership switcher was added. |
| Browser isolation | Offline technician database shared one browser namespace | Feature-gated company/user databases, navigation-cache invalidation and session revalidation added. Old offline drafts remain untouched and require a rollout recovery plan. |
| Billing | Stripe checkout, portal and signature-verified events existed | Monthly price validation, checkout attempt locking, duplicate-event protection, configurable grace/trial, owner Subscription page, legacy-business opt-out. Hosted Stripe flows still require real test credentials. |
| Onboarding | Invitations and branding existed; public workspace creation incomplete | Email verification creates an empty workspace and owner. Invitations reuse the workspace. Signup has per-email cooldown but still needs distributed abuse protection. |
| Support | Missing subscriber/operator ticket workflow | Mobile/desktop tickets, screenshots, private notes, assignment, replies, resolve/reopen, report and billing diagnostic references. Not a universal application-error/background-job tracing system. |
| Report recovery | No coordinated failed-delivery repair workflow | Tracked delivery reuses the issued PDF; operator retry limited to confirmed failures. Concurrent retry sends once; uncertain outcomes require reconciliation. Existing delivery paths are not all backfilled into this new ledger. |
| Staging | No hosted private staging provisioned for this work | Loopback production build, isolated PostgreSQL, inline files and captured mail. Hosted preview protection and provider settings require operator access. |

## Access on this computer

Open `http://localhost:3340/login`. The server binds only to 127.0.0.1, not the public network.

| Account | Email |
| --- | --- |
| Evergreen owner | tenantadmin@evergreenfire.com |
| Evergreen technician | tech1@evergreenfire.com |
| Northshore owner | admin@northshorelife.com |
| Northshore technician | tech@northshorelife.com |
| TradeWorx operator | platform@nwfiredemo.com |

Synthetic seed password: `Password123!`. Never use these credentials on a public deployment.
Operator: `/app/platform/support`; captured verification/invite emails: `/app/platform/support/mail`.
New signup: `/signup`; owner billing: `/app/admin/settings/subscription`; support: `/app/help`.
Both companies have a customer called Pinecrest Commons and visibly different saved logos.
Existing seeded companies deliberately remain subscription-unmanaged; new signup companies require activation.

From the repository root, `node scripts/staging/local.cjs start` starts the built app.
The helper refuses environment files, strips external integration credentials, pins PostgreSQL to
`127.0.0.1:55439/tradeworx_subscriber`, captures email and stores files in the staging database.
PostgreSQL must already be running. Do not point these scripts at production.

Fresh isolated setup: run helper modes `generate`, `migrate`, `seed`, `fixture`, `build`, then `start`.
Seed resets synthetic data; never run it against a business database.
Browser verification: `node scripts/staging/verify-browser.cjs` after preparing fixtures.
Generated evidence stays in `scripts/staging/results/` and is deliberately excluded from Git.

## Verification evidence

- Production build includes Next.js lint/type validation; separate TypeScript check passed.
- Final normal library regression run: 851 passed, 18 skipped (`npm run test --workspace=@testworx/lib -- --maxWorkers=2`). All eight PostgreSQL integration checks and the signup concurrency test passed separately against isolated staging. Final production build, lint and type checks passed. Earlier provider-contract tests remain simulated; no Stripe provider testing was performed in the non-Stripe follow-up.
- Real staging database tests pass for support ownership/private notes/revoked users/concurrent delivery and subscription checkout/recovery contracts.
- Billing provider tests use a fake Stripe client plus real database. They are NOT actual hosted Checkout, portal or renewal tests.
- Final browser run: 11 of 11 checks passed. Coverage includes mobile ticket creation/screenshot, cross-company ticket and attachment denial, operator recovery/reply/resolve, technician reopening, own-company search, invitations to both companies, branded PDF downloads, owner-only billing, read-only inspection viewing, deactivation, new empty-workspace signup, billing-blocked support submission/reply, and shared-browser cache isolation. A stuck support-submission navigation was found and fixed during this run.
- Browser viewports: desktop 1440x900 and mobile 390x844, Chromium. Service workers are blocked in the general suite; cache namespace checks do not prove every offline service-worker race.
- Two generated PDFs checked for correct company text and absence of the other company: 3 and 7 pages. First pages visually reviewed for distinct logos. This is not an all-template PDF regression audit.
- Migration rehearsal on a synthetic clone: 58 original tables retain matching row counts and original-column hashes; no ownership warnings; zero existing companies automatically enrolled. This is NOT a rehearsal against the current business's production snapshot.

## Configuration still required

Create a protected staging deployment with separate database, file storage and secrets. Require deployment protection; no public seed accounts.
Set server and build-time flags together: `SUBSCRIBER_FEATURES_ENABLED=true`, `NEXT_PUBLIC_SUBSCRIBER_FEATURES_ENABLED=true`, plus `SELF_SIGNUP_ENABLED=true`.
Set `APP_ENV=staging`, staging `APP_URL`, `AUTH_URL`, `NEXTAUTH_URL`, unique `AUTH_SECRET`, and isolated database URLs.
Use `EMAIL_DRIVER=capture`, `STORAGE_DRIVER=inline` for this evaluation; configure a real support address in `SUPPORT_EMAIL`.
Set Stripe test secret/publishable keys and a test webhook signing secret, with active recurring monthly price IDs in `STRIPE_PRICE_STARTER` and `STRIPE_PRICE_PROFESSIONAL`.
Configure Checkout and the customer portal for payment updates, invoice history and period-end cancellation.
Webhook endpoint: `/api/stripe/webhook`; the handler processes checkout completion and subscription created/updated/deleted. Payment-failure access currently follows subscription status transitions, not individual invoice-event processing; verify these transitions with Stripe before launch.
Set `SUBSCRIPTION_TRIAL_DAYS` (0-30, default 0) and `SUBSCRIPTION_GRACE_DAYS` (0-30, default 7) deliberately.
Local helper accepts test provider credentials only through `TEST_STRIPE_*` and the `--stripe-test` flag for build/start.
Use Stripe CLI forwarding or a protected reachable staging webhook; the loopback URL is not directly reachable by Stripe.

## Remaining release blockers

1. Actual Stripe test checkout/renewal/failure/recovery/cancel/repeated-click tests, including event reordering and recovery of events stranded in processing.
2. Complete paid first-subscriber journey after actual Stripe activation. The signed-in seeded-company field journey now passes through UI creation, mobile editing/signatures/finalization, draft billing, and captured report delivery; this does not substitute for hosted Checkout activation or external email delivery.
3. Broader tenant-boundary audit for all exports, Home counts, recurring jobs, file stores and background tasks, with positive and negative assertions per surface.
4. Protected hosted staging, distributed signup rate limiting, operational monitoring and a support escalation/retention policy.
5. Approved sanitized current-business snapshot rehearsal, ownership exceptions reviewed, saved links/issued PDFs/staff access reconciled.
6. All existing field devices synced or unsent drafts explicitly recovered before changing offline namespaces. Do not simply delete the old database.
7. Provider reconciliation for ambiguous email outcomes and stalled checkout/webhook processing; no blind resend/recharge.

## Follow-up staging verification, November 25

All work remained in the isolated local staging worktree/database. No hosted staging or production release occurred.

Fixed defects:

- A delayed Checkout event could overwrite newer subscription state. Feature-gated handling now verifies the saved checkout/customer, links only the matching subscription, and leaves subscription events responsible for status and plan updates. Real-database provider-contract tests cover stale checkout and mismatched customer/subscription events.
- Asset-linked report validation could silently replace a technician's edited equipment location with its original asset value. Validation now preserves recorded nonempty overrides; explicitly selecting another asset still applies its defaults. Regression and signed-in autosave tests cover both paths.
- PDF table headings did not wrap and long words could exceed cell boundaries. Shared table rendering now reserves wrapped header height and breaks oversized words without discarding characters. New tests and a rendered visual fixture verify the behavior. This is not an all-template PDF audit.

Running-browser evidence:

- The original 11 subscriber checks passed again in Chromium (1440x900 office, 390x844 technician).
- `verify-field-journey.cjs` creates an inspection through the office UI, schedules and assigns it, and starts it through the technician UI.
- `verify-field-completion.cjs` confirms read-only viewing, retained input during a simulated autosave failure, recovered save and location override persistence, Pending-on-work-note edit, progress visible to a second office session, drawn technician/customer signatures, successful finalization, generated PDF, and draft billing summary. Delivery goes only to captured staging email and leaves the finalized report unchanged.
- `verify-boundaries.cjs` passes five grouped checks: cross-company scheduler access, report autosave/finalize denial, two-company monthly CSV exports, Home/search ownership, and unauthorized cron denial. This is selected coverage, not a complete route audit or numerical reconciliation of every Home count.
- The completed field report's three pages were visually inspected, including both signatures. Two-company PDF branding/text checks also pass. The table-wrapping correction was verified in a separate generated fixture, without replacing issued files to test the renderer.

Evidence files are in ignored `scripts/staging/results/`: `field-completion.json`, `boundaries.json`, `report-branding.json`, browser screenshots, and PDFs. Field scripts create synthetic records; run creation before completion and do not rerun completion on an already finalized report.

Test-run caveat: running the entire legacy unit suite with the staging capture-mail environment enabled exposed mock incompatibilities, outdated PostgreSQL fixtures, and timeouts while a build competed for resources. That run is not a pass. Run the normal library suite separately; run targeted database tests with the isolated helper. The PostgreSQL fixture problems were subsequently repaired and all eight integration tests now pass, as recorded below.

## Non-Stripe follow-up

Stripe configuration, provider integration changes, and production deployment were explicitly deferred. Work stayed in the same private local staging environment.

Additional fixes:

- Signup requests now coordinate through a PostgreSQL transaction lock keyed by normalized email. Concurrent requests cannot overwrite each other's verification token or bypass the existing per-email cooldown. Verification uses the same lock, so resend and verification cannot race. This is cross-instance concurrency protection, not a replacement for IP-level distributed abuse protection.
- Service-worker navigation no longer reopens a deleted workspace cache after an in-flight write. Offline reads also check workspace generation before returning cached HTML, preventing a reset race from returning the previous company's page. Static asset caching and existing offline drafts remain intact.
- Support reply actions return their save result before requesting a normal client refresh. A focused browser reproduction found replies persisted but the action response/view could stall for an owner awaiting activation during in-action tree revalidation. This change does not bypass subscription restrictions or alter ticket visibility.
- Modernized PostgreSQL integration fixtures: explicit inspection/report relationship, server entry-point imports, current required report data, start/resume job-time events, and cleanup of billing relationships. Assertions now reflect the existing manual billing/archive workflow; production business rules were not weakened to make tests pass.

Additional verification:

- All eight PostgreSQL integration tests pass: seeded roles, simultaneous claims, multi-service claims, finalization/PDF/billing persistence, unsigned required document behavior, correction/reissue/re-finalization audits, PDF regeneration without reopening, and replacement-visit audit history.
- Real database signup test passes: five simultaneous requests produce exactly one email; concurrent verification creates exactly one empty workspace and owner; replay and existing-account signup cannot create another workspace.
- Service-worker tests cover the two reset races. `verify-offline.cjs` runs Chromium at 390x844 with service workers enabled: company A cache is cleared on login to company B, B's inspection list loads offline, prior-company marker does not appear, and reconnect reload succeeds. This is not proof of every offline upload/sync race or a real iOS device test.
- `verify-attention.cjs` creates temporary records for all six Home categories in each company, verifies all 12 row counts against displayed queue totals, and tests Enter, refresh, and Back. It asserts inspection status/updatedAt remain unchanged during navigation and removes only its temporary records afterward. It is not a large-volume pagination benchmark or a concurrent-final-item-resolution test.
- Build, lint, and type checks passed after the application changes. Normal regression: 851 passed, 18 skipped. The nine database tests above passed separately; they are intentionally skipped in the normal no-database run. The five expanded company-boundary browser checks also passed again.
- Focused support-reply browser test passes for a new owner awaiting activation: three consecutive replies appear without manual reload and each creates exactly one message. The test first reproduced a saved-but-invisible reply before the fix.
- Final full browser run passes all 11 scenarios, including technician reopening, invitations, isolated signup, company boundaries, branded PDFs, deactivation, and shared-browser switching. The functional assertion timeout is 15 seconds after a broader run encountered a refresh timeout; this is not a performance-target pass.

Commands from this isolated worktree:

```powershell
node scripts/staging/local.cjs test src/__tests__/postgres.integration.test.ts src/__tests__/workspace-signup.staging.test.ts --maxWorkers=1
node scripts/staging/verify-offline.cjs
node scripts/staging/verify-attention.cjs
```

Remaining non-Stripe gates are still explicit: protected hosted staging and monitoring; a broader authorization/background-job audit beyond the tested surfaces; signup abuse throttling across different emails; current-business sanitized migration rehearsal; recovery/sign-off for unsent drafts on real field devices; provider reconciliation for ambiguous email delivery; and operational support/retention decisions. No credentials or production data were requested or used for this follow-up.

## Current release gate review (November 25, latest follow-up)

This section supersedes earlier counts and gaps only where new evidence is listed. Commercial price, trial, grace and cancellation settings remain proposals. No production migration, real-data download, charge or customer release is authorized.

| Release blocker | Evidence | Remaining action or owner |
| --- | --- | --- |
| Legacy field-draft recovery | Code review: `tradeworx-technician-offline` remains intact. Its report drafts contain report/inspection IDs but no authenticated author/company stamp. Scoped databases are separate. New local durability tests prove request success alone cannot announce a committed save; scope changes now hide children until that scope is ready. | **Still blocked.** Do not auto-attribute drafts from the current session or current assignment. Implement an operator-confirmed ownership grant and durable server recovery receipt before import/replay. Ambiguous originals must remain quarantined. Interrupted recovery, restart and exactly-once recovery are NOT yet verified. Engineering + field supervisor. |
| Complete company isolation audit | `subscriber-route-inventory.md` inventories 134 page/action/API entry points, with context signals explicitly marked as unreviewed. Existing Home/scheduler/search/support checks are retained. New real-DB test denies foreign attachment access and foreign recurring-task binding without creating schedules. | Trace each remaining service chain, token link, export and background entry point; add positive and negative fixtures. A generated inventory is not a completed security audit. Engineering. |
| Recurring creation and PDFs | Reviewed `createRecurringFollowUpInspectionsTx` tenant-filtered future-series lookup and `bindCompletedTaskSchedule` tenant lock/filter. Reviewed media allowlist, category/tenant storage-key validation and attachment permission checks. Eight real-DB inspection/finalization/correction tests pass again. | Multi-company positive concurrent recurrence creation and failure/recovery need additional tests. Current generated-PDF download can invoke the existing renderer-refresh/rebuild path; this was not changed and requires issued-document retention review. No new standalone queue worker found; synchronous services, cron and client sync still require full tracing. |
| Diagnosable failures and safe recovery | Platform Support now searches tracked failed/uncertain/stalled-sending report deliveries by company, report or delivery reference. Shows issued-attachment selection, attempt time and provider reference without a resend for uncertainty. Real-DB test proves uncertain/stalled sends cannot retry or change issued attachment/report records. Existing concurrent confirmed-failure retry test passes. | General PDF-generation and recurrence failures are not yet connected to durable searchable operation references. Provider reconciliation and operational alert routing still pending. No provider delivery confirmation is claimed. Engineering + provider account owner. |
| Shared signup throttling | PostgreSQL atomic counters before hashing/request and verification actions; global and client budgets, hashed edge identity, cleanup, fail-closed on DB failure. Local concurrency test admits exactly 5 of 15 simultaneous attempts and resets an expired window. Existing signup race test still passes. | Verify trusted edge headers and quotas on hosted deployment. Fixed windows permit boundary bursts; current technical caps are 10 requests/15 min/client and 100/hour globally, 30 verifications/min/client and 3000/hour globally. Non-Vercel deployments use a shared fallback bucket, not untrusted forwarded headers. |
| Protected phone sandbox | Separate Vercel project `nw-fire/tradeworx-subscriber-sandbox`, Authentication protection `all`, Node 24, new free Neon resource connected to Preview only. Synthetic loopback DB copied into the empty new DB; every account password rotated, captured mail/invitations/signup/reset tokens cleared. Latest hosted run passes all six checks: anonymous denial, two office logins, isolated search/PDFs, technician/operator restrictions, captured inbox and rejection of the demo password. Final protection check confirms zero temporary test bypasses. | Physical phone evaluation still required. External operator alert delivery is not configured/tested; the operator diagnostics list is available. Production was not modified; separately authorized metadata-only review is recorded below. |
| Stripe and activated-company journey | Deferred. No Stripe secret configured or provider flow exercised in this follow-up. | Authorized test secrets and provider approval; run the complete lifecycle, then first signed report/delivery for a newly activated company. Account owner + engineering. |
| Real business migration | User screenshot identifies Neon `neon-fulvous-field` and private Blob `test-worx-private-blob`. Authorized read-only catalog/object-metadata review confirms 59 tables, 939 columns, 221 constraints, and a complete listing of 6,873 objects (818,915,274 bytes). Zero customer rows or PDF contents read. Sensitive manifests remain ignored locally. | Sanitization proposal below requires separate approval before any record export, snapshot/branch or file-content access. Only synthetic migration rehearsal has passed; current-business preservation remains unverified. |
| Regression | Latest local and hosted builds pass compilation, lint and type validation. Final normal library suite: **858 passed, 20 skipped** (93 test files passed, 7 skipped), including the login hydration regression. Twelve targeted real-DB checks passed separately (8 inspection flows, support retry, signup race, quota race, diagnostics/file/recurrence boundary). Local browser reruns: 11 subscriber scenarios, all 12 attention rows/read-only assertions, five boundary groups and service-worker offline switch check pass. Latest hosted smoke run: six checks passed. | Physical iPhone/iPad, actual delivery provider and hosted activation remain separate gates. |

### Field-device rollout checklist

1. **Supervisor, real device:** record technician, company, device, Safari/PWA/native app and pending-work count while the original installation still opens. Do not clear site data, uninstall, reset storage or switch feature flags yet.
2. **Technician, real device:** reconnect as the original author; verify every pending job appears on the server and obtain supervisor confirmation. A disappearing queue alone is not evidence of preserved content.
3. **If work remains:** stop rollout on that device. Keep the old IndexedDB database and browser profile untouched. Do not sign in as another technician to try importing it. Have the original author and office identify the report; ambiguous work stays quarantined without content shown to another account.
4. **Before approval:** engineering must deliver the ownership-confirmed recovery/receipt flow. Verify interruption after server acceptance, app force-close/reopen, airplane mode, account switch and repeat retry all retain the original and produce one intended server result. This is currently a blocker, not an implemented recovery promise.
5. **After recovery:** compare answers, notes, photos, signatures and report status with the original. Verify issued PDFs remain unchanged. Only then enable separated storage for the device.
6. **Physical iPhone/iPad required:** Safari and installed PWA suspension/eviction, force-close, reconnect, storage-pressure behavior, camera/signature persistence and shared-device sign-out/in. Chromium mobile emulation does not establish these results.

### Hosted configuration and production-provider first step

Verified hosted preview: **https://tradeworx-subscriber-sandbox.vercel.app**. Sign in through Vercel first, then use a unique TradeWorx sandbox account from the private, ignored `.vercel/sandbox-accounts.json` on this computer. Do not paste this file into a ticket or commit it. The five documented demo emails are reused only as synthetic identities; their old demo passwords do not work here.

Deployment: `dpl_A8uVrET2VnTnDnpjqjXLTRvuPukY` is READY with preview target, in project `prj_su2r87mUde6ttMAREVbUrpBZgwFl`; the sandbox alias resolves to this deployment. Vercel automatically labeled the brand-new project's initial attempt as its default production target despite the preview option; that sandbox-only attempt was canceled before readiness. The replacement is verified preview. The real `test-worx` project was never deployed or modified. Authentication protects all sandbox URLs, including the alias. Temporary browser-test bypass credentials were revoked after testing.

`verify-hosted.cjs` uses real hosted sessions at 1440x900 and 390x844, with a temporary operator-managed deployment credential and rotated application passwords. This is Chromium, not physical iOS. Earlier runs hit protection propagation redirects and an incorrect HTTP-status assertion for Next's streamed not-found response. The final test waits for the protected browser login page and checks actual access-denied content, without weakening app authorization. The login form now disables submit until hydration, prevents overlapping sign-in requests, handles network errors, and uses POST rather than a native GET fallback. A rendered-HTML regression test confirms the server-rendered submit is disabled and the form uses POST. Latest local and hosted builds include this fix. Evidence: ignored `results/hosted.json` and `results/hosted-tech.png`. No Stripe or external email was enabled.

`scripts/staging/check-hosted-config.cjs` checks preview-only settings without printing secrets and passed as a manual preflight. The existing `apps/web/vercel.json` build command overrides the project build command, so this preflight is NOT automatically enforced by deployment yet. `hosted-project.json` is the separate sandbox's proposed project configuration; never apply it to `test-worx`. The local demo seed now refuses remote databases. The one-time hosted bootstrap accepts only the explicitly created sandbox project and an empty new Neon DB, copies only loopback synthetic data and rotates account passwords.

Provider identification is complete. If reviewing the account manually, open **Vercel -> nw-fire -> test-worx -> Storage**. Neon `neon-fulvous-field` is the database; `test-worx-private-blob` is the private file store. No dashboard changes are needed now. Do not clone, reconnect or delete either resource.

### Approved metadata review and proposed sanitized rehearsal

The user authorized structure and file metadata only. `review-production-metadata.cjs --approved-read-only` used a PostgreSQL transaction with `transaction_read_only=on` and queried only system catalogs. Blob access used listing only, not object downloads. Credentials were used in memory and not printed. Private evidence is `.vercel/production-schema-metadata.json` and `.vercel/production-file-metadata.json`; neither is committed or uploaded. The aggregate summary is in ignored `scripts/staging/results/production-metadata-summary.json`. No row counts, ownership reconciliation, PDF hashes or PDF integrity claims can be made from this metadata alone.

Proposed next phase, NOT yet authorized or run:

1. Obtain approval for a tightly scoped database export into a separate restricted rehearsal environment. Preserve IDs, foreign keys, roles, statuses, dates and recurrence relationships so existing links and ownership can be reconciled. Never point the rehearsal app at production or run migrations there.
2. Replace names, emails, phones, addresses, GPS coordinates, license/asset identifiers and company branding with deterministic fictional values. Keep the replacement map private. Replace passwords and strip integration credentials, device push tokens, reset/invitation/public-access tokens, Stripe/QuickBooks identifiers and provider payloads. Disable every outbound worker, reminder, push and live provider; use captured email only.
3. Treat JSON and free text as sensitive: report `contentJson`, asset metadata, billing/quote snapshots, audit/correction/amendment snapshots, intake submissions, notes, email bodies, error messages and manual searchable text all need explicit masking. Preserve answer/measurement structure and relationships without retaining personal narrative. Review sanitized output before any hosted import.
4. Do not upload original photos, signatures, logos or issued PDFs into the sample sandbox. Use labeled synthetic substitutes there. A separate approved restricted file-integrity exercise would compare hashes and storage-key relationships without regenerating or replacing issued PDFs. Filename/path metadata is also private. Sanitized substitutes cannot certify original PDF byte preservation.
5. Record baseline row counts, foreign-key/ownership exceptions, staff roles, saved record links and file-reference counts; apply only the additive migrations to the sanitized rehearsal copy and compare. Keep existing-company subscription activation disabled. Review every ownership ambiguity rather than assigning it automatically.
6. Keep the source backup immutable, retain the reconciliation evidence under agreed access/retention controls, and discard only rehearsal resources after approval. No production rollback or customer-data deletion is part of this phase.

Next approval needed: authorize preparation of the restricted sanitized database copy under this plan. Original file-content access remains a separate decision. Until then, continue only synthetic-data testing.

Vercel edge header reference: https://vercel.com/docs/headers/request-headers. Protection reference: https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication.

**Pilot recommendation: not yet.** Private sample-data evaluation is appropriate once the hosted smoke checks pass, but an outside operational pilot is blocked by legacy-draft recovery, incomplete authorization/job audit, unverified provider recovery/activation and the pending real-business migration safeguards. A successful local build does not waive those gates.

## Deferred Stripe inputs

1. Identify a Stripe sandbox/test account and authorize test-only product, price, customer, subscription, and test-clock creation. No live account changes or real card details are needed.
2. Securely configure `TEST_STRIPE_SECRET_KEY` (`sk_test_...`) and `TEST_STRIPE_PUBLISHABLE_KEY` (`pk_test_...`) on this machine or the protected staging secret store. Do not paste secrets into chat or commit them.
3. Provide same-sandbox monthly `TEST_STRIPE_PRICE_STARTER` and `TEST_STRIPE_PRICE_PROFESSIONAL` price IDs, or authorize creating temporary test prices. Confirm whether staging should use no trial and seven days' grace (the current defaults), or different values.
4. Allow Stripe CLI authorization for this sandbox or a protected reachable staging webhook. We can configure forwarding to `/api/stripe/webhook` and securely set its generated signing secret as `TEST_STRIPE_WEBHOOK_SECRET`. Stripe cannot call localhost directly. Some Stripe accounts require an administrator to enable CLI access.
5. Allow configuration of the test customer portal for payment method updates, invoice history, and cancellation at period end.

After those inputs, build/start with `--stripe-test` and exercise actual Checkout, repeated attempts, verified webhook activation, renewal, failed payment/grace/recovery, portal access, cancellation/paid-through access, and reactivation. Test-mode results do not authorize production activation.

References: https://docs.stripe.com/cli and https://docs.stripe.com/customer-management/configure-portal.

## Migration and rollback

Before production approval: back up the database and object storage, record counts/relationships and issued-PDF hashes, rehearse both additive migrations against an approved private snapshot, and review ownership warnings.
Migrations: `20261125180000_subscriber_staging_support`, `20261125190000_preserve_delivery_audit`, then `20261125200000_signup_shared_rate_limit`. The latest additive quota migration was applied only to isolated staging, not production.
Existing tenants default to `subscriptionManaged=false`: migration cannot enroll or charge the current operation. Activating its billing is a separate explicit decision.
Deploy initially with subscriber/signup flags disabled; verify existing access and links. Enable only after the gates above pass.
Rollback application behavior by disabling all three flags and redeploying the prior approved application build. Keep additive tables/columns and audit records; do not drop them or overwrite newly saved records.
If data restoration is needed, reconcile post-migration writes before restoring a backup. Provider subscriptions require separate provider-side reconciliation; code rollback does not cancel a subscription.

## First outside subscriber approval checklist

- [ ] Approve monthly price, trial, grace period, cancellation terms and support address.
- [ ] Review protected staging and complete real Stripe test lifecycle checks.
- [ ] Complete two-company isolation and mobile first-inspection/delivery workflow checks.
- [ ] Approve current-business migration rehearsal and field-device offline recovery plan.
- [ ] Approve live credentials, production migration and public release separately.
