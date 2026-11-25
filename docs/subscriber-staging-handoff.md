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
- Library regression run: 846 passed, 17 skipped. The skipped legacy PostgreSQL integration suite is not represented as passing.
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
2. Complete first-subscriber field journey: schedule a new inspection, complete it on mobile, verify Pending-on-edit and second-session scheduler progress, and deliver its report. Fixture-generated finalized PDFs do not prove this journey.
3. Broader tenant-boundary audit for all exports, Home counts, recurring jobs, file stores and background tasks, with positive and negative assertions per surface.
4. Protected hosted staging, distributed signup rate limiting, operational monitoring and a support escalation/retention policy.
5. Approved sanitized current-business snapshot rehearsal, ownership exceptions reviewed, saved links/issued PDFs/staff access reconciled.
6. All existing field devices synced or unsent drafts explicitly recovered before changing offline namespaces. Do not simply delete the old database.
7. Provider reconciliation for ambiguous email outcomes and stalled checkout/webhook processing; no blind resend/recharge.

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
