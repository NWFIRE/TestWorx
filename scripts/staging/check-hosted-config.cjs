// Run inside the separate protected preview project. Never prints secret values.
const env = process.env;
const errors = [];
const requireValue = (condition, message) => { if (!condition) errors.push(message); };
requireValue(env.APP_ENV === 'staging' && env.VERCEL_ENV === 'preview', 'Use APP_ENV=staging in a separate Vercel preview project.');
for (const key of ['APP_URL','AUTH_URL','NEXTAUTH_URL']) {
  try { requireValue(new URL(env[key]).protocol === 'https:', `${key} must be the sandbox HTTPS URL.`); }
  catch { errors.push(`${key} is required.`); }
}
requireValue(env.APP_URL === env.AUTH_URL && env.APP_URL === env.NEXTAUTH_URL, 'All application/auth URLs must match.');
requireValue(env.AUTH_SECRET?.length >= 32 && env.AUTH_SECRET !== 'isolated-subscriber-staging-only-secret', 'Use a unique random AUTH_SECRET.');
requireValue(env.EMAIL_DRIVER === 'capture', 'EMAIL_DRIVER must be capture.');
requireValue(env.STORAGE_DRIVER === 'inline', 'STORAGE_DRIVER must be inline for this private evaluation.');
requireValue(!!env.DATABASE_URL && !!env.DIRECT_URL, 'Separate staging database URLs are required.');
requireValue(!Object.keys(env).some(k => /^(RESEND_API_KEY|BLOB_READ_WRITE_TOKEN|QUICKBOOKS_CLIENT_SECRET|XERO_CLIENT_SECRET|SAGE_CLIENT_SECRET|FRESHBOOKS_CLIENT_SECRET)$/.test(k) && env[k]), 'Remove external delivery/storage/accounting credentials from this evaluation.');
requireValue(!env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY.startsWith('sk_test_'), 'Live Stripe credentials are forbidden.');
requireValue(!env.STRIPE_SECRET_KEY || env.STAGING_STRIPE_TEST_APPROVED === 'true', 'Stripe remains deferred until explicitly approved.');
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('Configuration shape passed. This does NOT prove deployment protection, database provenance, file isolation, or operator alert delivery. Verify these in the hosting account before sharing a URL.');
