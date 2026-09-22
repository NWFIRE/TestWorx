# My profile

`/app/profile` is an authenticated personal account page. Admin and customer
navigation includes My profile under Settings. Technicians reach it from their
existing Profile screen, which retains all offline, device, and sync tools.

Only the signed-in user's display name is editable. The server selects the actor
from the session, enforces the exact tenant (including null for platform users),
requires an active account, validates 1-100 characters, and audits name changes
in the same transaction. Email, role, tenant, credentials, and permissions are
not accepted from the form. Unchanged saves do not write or generate audit noise.

The auth callback refreshes the display name from the database so a saved name
appears in the app without signing out. Email/password/access changes continue
through the existing administrator-managed processes. No schema changes.

Tests: `npm run test --workspace @testworx/lib -- src/__tests__/user-profile.test.ts`
and `node scripts/check-profile-page.cjs` (browser rendering and mocked saves).
