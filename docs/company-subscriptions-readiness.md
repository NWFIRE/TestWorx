# Company subscriptions: implementation status

## Not ready for subscriber launch

This is an initial audit and safety patch, not a completed multi-company implementation.
No database migration, production data cleanup, billing activation, or charge was performed.
The current business retains its existing workspace and subscription behavior.

## Implemented safety fixes

- Auth refresh now revokes sessions for deleted or inactive users instead of retaining stale role/company claims.
- Stripe redeliveries increment delivery counts without resetting processing/processed events to received.
- Regression tests cover session revocation, server-side permission refresh, database failure,
  in-flight webhook redelivery, and completion between the initial read and claim.

## Findings requiring implementation

- Tenant records and most operational records already have tenant ownership.
- User has one tenantId and a globally unique email. Invitations explicitly reject an email
  used by another company. Multi-company identity and membership are not implemented.
- Existing operational relations reference User.id. Preserve those IDs during migration.
- /start-trial is an inquiry form, not workspace provisioning.
- Subscription configuration and hosted Checkout/portal exist, but checkout creation is not
  serialized or idempotent and does not block a second active subscription.
- Checkout metadata is not copied to subscription metadata.
- Subscription event ordering uses a read-then-write timestamp check; concurrent different
  events, different subscription IDs, and equal timestamps need reconciliation.
- Failed/processing worker recovery needs durable ownership/lease handling. The redelivery
  patch alone does not provide a full exactly-once webhook processing system.
- Access lifecycle enforcement, legacy billing exemption, and an owner recovery route are missing.
- Report numbers are globally unique; independently scoped company numbering needs a compatible
  migration that preserves existing IDs, download links, and report references.
- An end-to-end tenant-boundary audit of routes, jobs, exports, storage, offline caches,
  and live updates remains outstanding. Existing tenantId fields alone are not proof of isolation.

## Verification prerequisites

Local Stripe configuration is empty; the inspected production environment file contains no Stripe keys.
No dedicated staging database was identified. Do not run destructive integration tests against the
current business database or seed it with test companies.

Provide a separate staging deployment/database, Stripe test account access, and test email delivery.
Configure secrets in that environment, not in chat or committed files:

- DATABASE_URL and the deployment's migration connection configuration
- AUTH_SECRET, NEXTAUTH_URL, APP_URL
- STRIPE_SECRET_KEY (sk_test_...), STRIPE_PUBLISHABLE_KEY (pk_test_...)
- STRIPE_WEBHOOK_SECRET for /api/stripe/webhook
- Current code uses STRIPE_PRICE_STARTER, STRIPE_PRICE_PROFESSIONAL, and optional
  STRIPE_PRICE_ENTERPRISE. The requested single configurable monthly price is not implemented yet.
- Transactional invitation email credentials and approved sender
- Separate test file storage namespace/credentials

Configuring these values does not by itself make the current implementation launch-ready.
Never substitute production Stripe credentials for missing test credentials.

## Migration procedure to implement and rehearse

1. Snapshot the database and file manifest; capture per-tenant counts and cross-tenant/orphan relations.
2. Review null tenant ownership, cross-tenant User/Customer/Site/Inspection relations, invitation
   ownership, and global identifiers. Stop on ambiguity; do not guess the owning company.
3. Add identity/membership structures and explicit legacy billing exemption with additive migrations.
   Preserve User IDs and all existing record/storage identifiers. Backfill only proven relationships.
4. Reconcile before/after counts, relation integrity, and representative report/download links.
5. Verify two new empty companies, shared-email membership, switching, revocation, roles,
   offline caches, realtime, all scoped records, and identical customer names/record numbers.
6. Verify test checkout concurrency, signed duplicate/out-of-order events, renewal, failure/recovery,
   cancellation paid-through, recovery access, and invitation acceptance without another subscription.
7. Deploy only after staging passes. Existing-business billing activation requires a separate,
   explicit rollout decision and must never be a migration side effect.

## Rollback

The safety patch has no schema changes: revert its commit and redeploy to roll back code.
No data rollback is needed for this patch. A future identity migration requires a rehearsed
backup/restore or forward-repair procedure before deployment; do not drop additive membership
data after new companies have begun writing records.

## Verification performed

- Production build: passed (all five package build tasks).
- Web ESLint: passed, excluding the pre-existing .next-corrupt-* generated directory.
- Focused billing/auth tests: 13 passed.
- Full library suite rerun: 793 passed, 14 skipped, one scheduling-generic-site test failed.
  Its JSON report contained STACK_TRACE_ERROR without a diagnostic assertion message.
- Isolated rerun of scheduling-generic-site plus billing/auth: all 23 tests passed.
  This does not retroactively make the full run green.
- No signed-in two-company browser test, real Stripe test checkout, migration rehearsal,
  production ownership reconciliation, or seed execution was performed.
- The initial full run was interrupted; its final result was not used as verification evidence.

## References

- Stripe webhook signature verification, retries, ordering, and duplicate events:
  https://docs.stripe.com/webhooks
- Stripe subscription duplicate prevention:
  https://docs.stripe.com/payments/checkout/limit-subscriptions
