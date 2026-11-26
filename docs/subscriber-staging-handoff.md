# Subscriber staging handoff

## Release boundary

Private local evaluation only, November 25, 2026. Branch: `codex/subscriber-support-staging`.
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

## Exactly what is needed for Stripe testing

1. Identify a Stripe sandbox/test account and authorize test-only product, price, customer, subscription, and test-clock creation. No live account changes or real card details are needed.
2. Securely configure `TEST_STRIPE_SECRET_KEY` (`sk_test_...`) and `TEST_STRIPE_PUBLISHABLE_KEY` (`pk_test_...`) on this machine or the protected staging secret store. Do not paste secrets into chat or commit them.
3. Provide same-sandbox monthly `TEST_STRIPE_PRICE_STARTER` and `TEST_STRIPE_PRICE_PROFESSIONAL` price IDs, or authorize creating temporary test prices. Confirm whether staging should use no trial and seven days' grace (the current defaults), or different values.
4. Allow Stripe CLI authorization for this sandbox or a protected reachable staging webhook. We can configure forwarding to `/api/stripe/webhook` and securely set its generated signing secret as `TEST_STRIPE_WEBHOOK_SECRET`. Stripe cannot call localhost directly. Some Stripe accounts require an administrator to enable CLI access.
5. Allow configuration of the test customer portal for payment method updates, invoice history, and cancellation at period end.

After those inputs, build/start with `--stripe-test` and exercise actual Checkout, repeated attempts, verified webhook activation, renewal, failed payment/grace/recovery, portal access, cancellation/paid-through access, and reactivation. Test-mode results do not authorize production activation.

References: https://docs.stripe.com/cli and https://docs.stripe.com/customer-management/configure-portal.

## Migration and rollback

Before production approval: back up the database and object storage, record counts/relationships and issued-PDF hashes, rehearse both additive migrations against an approved private snapshot, and review ownership warnings.
Migrations: `20261125180000_subscriber_staging_support`, then `20261125190000_preserve_delivery_audit`.
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
