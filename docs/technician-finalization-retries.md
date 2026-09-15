# Technician finalization retries

Failed finalization must stay retryable. A saved `pendingFinalize` flag means the
intent is retained, not that a request is currently running or has succeeded.
Report screens display `Finalize failed` for failed sync, allow correction/retry,
and display `Finalized` only after explicit server confirmation.

A same-job dependency conflict still blocks finalization (unsaved labor/materials
must not be skipped). The local report now shows that dependency's error and
unlocks correction/job-start controls instead of remaining stuck as Finalizing.
The queue and draft are retained. Unrelated jobs continue syncing independently.

Run `node scripts/check-report-finalize-sync.cjs` for real-browser IndexedDB/queue
regressions, and `node scripts/check-finalize-screen-retry.cjs` for both report
screen handler retry/success/failure regressions. Neither test uses production data.
