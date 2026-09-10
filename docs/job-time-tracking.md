# Technician job time

Technicians open reports in view-only mode, then choose **Start job** to edit. **Pause job** saves pending report changes before pausing; **Resume job** creates a new working session. The timer persists across navigation, refresh, and closing the application. It is independent of payroll timesheets and invoice labor.

Each technician can have one active job. If another job is running, the control offers to pause it first. Jobs shared by multiple technicians maintain separate sessions. The inspection moves from a starting status to Pending when explicitly started. Office corrections do not require a timer and existing completed records receive no invented time.

Successful whole-inspection completion closes all active sessions. Finalizing an individual report does not stop time if other reports or required document signatures remain. Saving the last required document also reconciles completion once the report tasks are complete. Validation failures do not stop time. Reissued technician corrections can record a new session without downgrading the inspection status.

## Offline behavior

Load the job online once before starting offline. Start/pause events are queued on the device with technician identity and timestamps, interleaved with existing report saves. A rejected clock event blocks dependent synchronization rather than losing edits. Device-only and delayed timestamps are flagged for office review. Finalization received late uses the technician's captured finish time for that technician's session, while the report's official finalization timestamp remains server-generated. Other technicians stop at server completion.

Clock events more than 30 days old or in the future require office assistance. Conflicts remain on the device; after the office addresses overlapping time, use **Retry job time after office review**. Do not clear device storage when unsynced work remains.

## Office review

Open **Job time** on the inspection Overview to see sessions, totals per technician, and recent timing conflicts. Times display in the company timezone. Correction inputs explicitly identify the device timezone and convert to UTC. A correction requires a reason, rejects overlaps, and records before/after timestamps in the audit log. Payroll and pricing are not changed.

## Rollout and verification

Apply `202609100001_job_time_sessions` to the deployment database before deploying application code. It adds a table, foreign keys, an interval check, and a partial unique index enforcing one active job per technician. No existing inspection or timesheet data is backfilled.

Run the library test suite and `node scripts/check-job-time.cjs`. The browser check uses the real timer and IndexedDB queue with simulated API responses; it does not modify production jobs. Also verify the production build and migration status. Postgres integration tests require a dedicated test database, not production.
