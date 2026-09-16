# Technician finalization retries

Failed finalization must stay retryable. A saved `pendingFinalize` flag means the
intent is retained, not that a request is currently running or has succeeded.
Report screens display `Finalize failed` for failed sync, allow correction/retry,
and display `Finalized` only after explicit server confirmation.

A same-job dependency conflict still blocks finalization (unsaved labor/materials
must not be skipped). The local report now shows that dependency's error and
unlocks correction/job-start controls instead of remaining stuck as Finalizing.
The queue and draft are retained. Unrelated jobs continue syncing independently.

Rejected job-time events are retained for review/retry, but do not prevent report
delivery for a job with a valid running session. Report and line-item endpoints
continue enforcing job-start and authorization checks. Rejected timer events
must never replace a verified active session in the UI or disable other jobs.
Retrying job time from a report retries only that inspection's events.

When completed work exists only on a field device, keep its local storage intact
and sync/retry there. Never synthesize signatures or mark an empty server draft
complete to move it into billing. Billing remains dependent on successful report
finalization through the existing workflow.

Run `node scripts/check-report-finalize-sync.cjs` for real-browser IndexedDB/queue
regressions, and `node scripts/check-finalize-screen-retry.cjs` for both report
screen handler retry/success/failure regressions. Neither test uses production data.
Run `node scripts/check-job-time-conflict-controls.cjs` to verify the actual timer
hook retains valid controls through rejected starts without unlocking unstarted jobs.
