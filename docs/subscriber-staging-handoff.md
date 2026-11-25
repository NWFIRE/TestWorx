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
- Final normal library regression run: 849 passed, 17 skipped (`npm run test --workspace=@testworx/lib -- --maxWorkers=2`). The skipped legacy PostgreSQL integration suite is not represented as passing. Final production build, lint and type checks passed; both targeted real-database subscriber contract tests passed separately.
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

Test-run caveat: running the entire legacy unit suite with the staging capture-mail environment enabled exposed mock incompatibilities, outdated PostgreSQL fixtures, and timeouts while a build competed for resources. That run is not a pass. Run the normal library suite separately; run the targeted `subscriber-*.staging.test.ts` contract tests with the isolated helper. The older PostgreSQL integration suite still needs modernization before it can be a release gate.

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
